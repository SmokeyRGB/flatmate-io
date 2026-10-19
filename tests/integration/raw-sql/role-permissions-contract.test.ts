import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { uuid } from "../../helpers/uuid";

// drizzle/0037 (role-permissions-contract, design D1/D3): the data statements and the constraint
// swaps, run against the PRE-0037 state on a scratch table. Like role-permissions-backfill.test.ts
// this replays the statements of the migration FILE in file order with only the quoted table name
// rewritten, so it exercises the real statements, and it does not depend on which migrations the
// shared dev database has applied. The scratch table carries the constraints 0029 left live, read
// from 0029's own file, plus the three 0024 ones 0029 did not touch.
//
// Temp table, dropped ON COMMIT; the transaction always rolls back, so nothing reaches the real table.
const TABLE = "membership_pre0037";

function statementsOf(prefix: string): string[] {
  const dir = join(__dirname, "../../../drizzle");
  const file = readdirSync(dir).find((f) => f.startsWith(prefix)) as string;
  return readFileSync(join(dir, file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter((s) => s !== "")
    .map((s) => s.replaceAll('"membership"', TABLE));
}

// The CHECKs 0029 added (moderator floor, moderator-only, household floor/ceiling, household-only,
// administration, resident-only), as 0029's file states them.
const CHECKS_OF_0029 = statementsOf("0029_").filter((s) => /^ALTER TABLE \S+ ADD CONSTRAINT/.test(s));
// Untouched by 0029 and still live at 0037: the empty resident floor of 0024 and the two structural
// CHECKs.
const OTHER_PRE_0037_CHECKS = [
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_resident_pairing CHECK (is_resident = (resident_profile_id IS NOT NULL))`,
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_admin_has_no_profile CHECK (role <> 'household_admin' OR resident_profile_id IS NULL)`,
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_resident_holds_role_permissions CHECK (revoked_at IS NOT NULL OR NOT is_resident OR permissions @> '{}'::text[])`,
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_revoked_holds_nothing CHECK (revoked_at IS NULL OR (cardinality(permissions) = 0 AND role <> 'moderator'))`,
];

type Tx = Parameters<Parameters<typeof withSessionContext>[1]>[0];

async function withPre0037Copy<T>(body: (tx: Tx) => Promise<T>): Promise<T> {
  const context = { accountId: uuid(), householdId: uuid(), profileId: null };
  let result: T | undefined;
  const rollback = new Error("rollback");
  try {
    await withSessionContext(context, async (tx) => {
      await tx.execute(sql.raw(`CREATE TEMP TABLE ${TABLE} (LIKE membership INCLUDING DEFAULTS) ON COMMIT DROP`));
      for (const c of [...OTHER_PRE_0037_CHECKS, ...CHECKS_OF_0029]) await tx.execute(sql.raw(c));
      result = await body(tx);
      throw rollback;
    });
  } catch (err) {
    if (err !== rollback) throw err;
  }
  return result as T;
}

interface SeedRow {
  key: string;
  role: "member" | "moderator" | "household_admin";
  permissions: string[];
  isResident?: boolean;
  revoked?: boolean;
}

async function seed(tx: Tx, row: SeedRow) {
  const hh = uuid();
  const resident = row.isResident ?? row.role !== "household_admin";
  await tx.execute(sql`
    INSERT INTO membership_pre0037 (household_id, account_id, resident_profile_id, is_resident, role, permissions, revoked_at)
    VALUES (${hh}::uuid, ${uuid()}::uuid, ${resident ? uuid() : null}::uuid, ${resident},
            ${row.role}::membership_role, ${`{${row.permissions.join(",")}}`}::text[],
            ${row.revoked ? sql`now()` : sql`NULL`})`);
  return { key: row.key, householdId: hh };
}

async function permissionsByHousehold(tx: Tx): Promise<Map<string, string[]>> {
  const rows = await tx.execute<{ household_id: string; permissions: string[] }>(
    sql.raw(`SELECT household_id, permissions FROM ${TABLE}`),
  );
  return new Map((rows as { household_id: string; permissions: string[] }[]).map((r) => [r.household_id, r.permissions]));
}

async function runMigration(tx: Tx) {
  for (const statement of statementsOf("0037_")) await tx.execute(sql.raw(statement));
}

const sorted = (values: readonly string[]) => [...values].sort();

// Literals of the contract (frozen here, checked against schema.ts by role-permissions-constants.test.ts).
const HOUSEHOLD = [
  "manage_voting_procedure",
  "manage_rooms",
  "manage_join_codes",
  "create_resident_profile",
  "appoint_moderator",
  "manage_members",
  "export_subject_access",
  "issue_password_reset_link",
];
const MODERATOR = [
  "manage_rooms",
  "manage_join_codes",
  "create_resident_profile",
  "appoint_moderator",
  "manage_members",
  "export_subject_access",
  "manage_rounds",
  "manage_round_participation",
  "create_application",
  "change_application_state",
  "reverse_application_state",
];
// What old code (branches without 0029's code) wrote.
const OLD_MODERATOR = ["manage_rooms", "close_round", "create_application", "change_application_state", "reverse_application_state"];

async function seedPre0037(tx: Tx) {
  return [
    await seed(tx, { key: "oldHousehold", role: "household_admin", permissions: ["manage_rooms", "manage_settings"] }),
    await seed(tx, { key: "backfilledHousehold", role: "household_admin", permissions: [...HOUSEHOLD, "manage_settings"] }),
    await seed(tx, { key: "oldModerator", role: "moderator", permissions: [...OLD_MODERATOR, "manage_settings"] }),
    await seed(tx, {
      key: "floorModerator",
      role: "moderator",
      permissions: ["manage_rooms", "create_application", "change_application_state", "reverse_application_state"],
    }),
    await seed(tx, { key: "nonResidentModerator", role: "moderator", permissions: OLD_MODERATOR, isResident: false }),
    await seed(tx, { key: "completeModerator", role: "moderator", permissions: [...MODERATOR, "vote"] }),
    await seed(tx, {
      key: "memberWithOrganising",
      role: "member",
      permissions: ["close_round", "manage_rooms", "create_application"],
    }),
    await seed(tx, { key: "memberWithSettings", role: "member", permissions: ["manage_settings", "vote"] }),
    await seed(tx, { key: "resident", role: "member", permissions: [] }),
    await seed(tx, { key: "revoked", role: "member", permissions: [], revoked: true }),
  ];
}

describe("[raw SQL] drizzle/0037 against the pre-0037 state", () => {
  it("gives every row exactly what its roles entitle it to, strips retired names and organising rights from plain members", async () => {
    const after = await withPre0037Copy(async (tx) => {
      const rows = await seedPre0037(tx);
      await runMigration(tx);
      const byHousehold = await permissionsByHousehold(tx);
      return Object.fromEntries(rows.map((r) => [r.key, byHousehold.get(r.householdId)]));
    });

    // household: exactly the eight, the retired manage_settings gone
    expect(sorted(after.oldHousehold!)).toEqual(sorted(HOUSEHOLD));
    expect(sorted(after.backfilledHousehold!)).toEqual(sorted(HOUSEHOLD));
    // moderator: the eleven, plus manage_voting_procedure where it held manage_settings, plus vote if
    // a resident; close_round and manage_settings are gone
    expect(sorted(after.oldModerator!)).toEqual(sorted([...MODERATOR, "manage_voting_procedure", "vote"]));
    expect(sorted(after.floorModerator!)).toEqual(sorted([...MODERATOR, "vote"]));
    expect(sorted(after.nonResidentModerator!)).toEqual(sorted(MODERATOR));
    expect(sorted(after.completeModerator!)).toEqual(sorted([...MODERATOR, "vote"]));
    // plain member: vote and nothing else (an organising right and a retired name are stripped)
    expect(after.memberWithOrganising).toEqual(["vote"]);
    expect(after.memberWithSettings).toEqual(["vote"]);
    expect(after.resident).toEqual(["vote"]);
    // revoked rows hold nothing
    expect(after.revoked).toEqual([]);
    // nothing holds a retired name any more
    for (const [key, permissions] of Object.entries(after)) {
      expect(permissions, key).not.toContain("close_round");
      expect(permissions, key).not.toContain("manage_settings");
    }
  });

  it("is re-runnable: a second run of the whole file changes nothing", async () => {
    const [first, second] = await withPre0037Copy(async (tx) => {
      await seedPre0037(tx);
      await runMigration(tx);
      const once = [...(await permissionsByHousehold(tx)).values()].map(sorted).sort();
      await runMigration(tx);
      const twice = [...(await permissionsByHousehold(tx)).values()].map(sorted).sort();
      return [once, twice];
    });
    expect(second).toEqual(first);
  });

  it("leaves the scratch table under the new constraints: each refuses what it is named for", async () => {
    const refusals: [string, string, string][] = [
      // [constraint, a statement it refuses, the row key]
      ["membership_resident_holds_role_permissions", "SET permissions = '{}'::text[]", "resident"],
      ["membership_declared_permissions", "SET permissions = permissions || ARRAY['close_round']::text[]", "resident"],
      ["membership_administration_permissions", "SET permissions = permissions || ARRAY['manage_rooms']::text[]", "resident"],
      ["membership_moderator_only_permissions", "SET permissions = permissions || ARRAY['create_application']::text[]", "resident"],
      ["membership_household_admin_holds_role_permissions", "SET permissions = array_remove(permissions, 'manage_rooms')", "oldHousehold"],
      ["membership_moderator_holds_role_permissions", "SET permissions = array_remove(permissions, 'manage_members')", "oldModerator"],
    ];
    // One replay; each refusal runs inside its own savepoint, rolled back so the next one starts from
    // the migrated rows.
    const results = await withPre0037Copy(async (tx) => {
      const rows = await seedPre0037(tx);
      await runMigration(tx);
      const out: unknown[] = [];
      for (const [, set, key] of refusals) {
        const householdId = rows.find((r) => r.key === key)!.householdId;
        await tx.execute(sql.raw("SAVEPOINT refusal"));
        out.push(
          await tx.execute(sql.raw(`UPDATE ${TABLE} ${set} WHERE household_id = '${householdId}'::uuid`)).then(
            () => null,
            (err: unknown) => err,
          ),
        );
        await tx.execute(sql.raw("ROLLBACK TO SAVEPOINT refusal"));
      }
      return out;
    });
    for (const [i, [constraint]] of refusals.entries()) {
      const refused = results[i];
      expect(refused, constraint).toBeInstanceOf(Error);
      const e = refused as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
      const pg = e.code ? e : (e.cause ?? e);
      expect(pg.code, constraint).toBe("23514");
      expect(pg.constraint_name, constraint).toBe(constraint);
    }
  });
});
