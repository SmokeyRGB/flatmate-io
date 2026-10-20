import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { uuid } from "../../helpers/uuid";

// drizzle/0038 (application-deletion, design D2): the membership statements, run against the
// PRE-0038 state on a scratch table, so the order and the backfill are exercised on real rows
// before a human applies the file. Modelled on role-permissions-contract.test.ts: it replays the
// statements of the migration FILE in file order with only the quoted table name rewritten, so it
// runs the real statements and does not depend on which migrations the shared dev database has
// applied (dev is at 0037 until the human applies 0038). The scratch table carries the constraints
// 0037 left live, read from 0037's own file.
//
// Temp table, dropped ON COMMIT; the transaction always rolls back, so nothing reaches the real table.
const TABLE = "membership_pre0038";

function statementsOf(prefix: string): string[] {
  const dir = join(__dirname, "../../../drizzle");
  const file = readdirSync(dir).find((f) => f.startsWith(prefix)) as string;
  return readFileSync(join(dir, file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter((s) => s !== "")
    .map((s) => s.replaceAll('"membership"', TABLE));
}

const addsConstraint = (s: string) => /^ALTER TABLE \S+ ADD CONSTRAINT/.test(s);
const CHECKS_OF_0037 = statementsOf("0037_").filter(addsConstraint);
// Live at 0037 and untouched by it: 0029's household-only and resident-only CHECKs and the
// structural ones.
const CHECKS_OF_0029 = statementsOf("0029_").filter(
  (s) => addsConstraint(s) && /membership_(household_only|resident_only)_permissions/.test(s),
);
const STRUCTURAL_CHECKS = [
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_resident_pairing CHECK (is_resident = (resident_profile_id IS NOT NULL))`,
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_admin_has_no_profile CHECK (role <> 'household_admin' OR resident_profile_id IS NULL)`,
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_revoked_holds_nothing CHECK (revoked_at IS NULL OR (cardinality(permissions) = 0 AND role <> 'moderator'))`,
];

type Tx = Parameters<Parameters<typeof withSessionContext>[1]>[0];

async function withPre0038Copy<T>(body: (tx: Tx) => Promise<T>): Promise<T> {
  const context = { accountId: uuid(), householdId: uuid(), profileId: null };
  let result: T | undefined;
  const rollback = new Error("rollback");
  try {
    await withSessionContext(context, async (tx) => {
      await tx.execute(sql.raw(`CREATE TEMP TABLE ${TABLE} (LIKE membership INCLUDING DEFAULTS) ON COMMIT DROP`));
      for (const c of [...STRUCTURAL_CHECKS, ...CHECKS_OF_0029, ...CHECKS_OF_0037]) await tx.execute(sql.raw(c));
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
    INSERT INTO membership_pre0038 (household_id, account_id, resident_profile_id, is_resident, role, permissions, revoked_at)
    VALUES (${hh}::uuid, ${uuid()}::uuid, ${resident ? uuid() : null}::uuid, ${resident},
            ${row.role}::membership_role, ${`{${row.permissions.join(",")}}`}::text[],
            ${row.revoked ? sql`now()` : sql`NULL`})`);
  return { key: row.key, householdId: hh };
}

// The whole row as text, so "byte-identical" covers every column, not only the permissions.
async function rowsByHousehold(tx: Tx): Promise<Map<string, string>> {
  const rows = await tx.execute<{ household_id: string; row: string }>(
    sql.raw(`SELECT household_id, t::text AS row FROM ${TABLE} t`),
  );
  return new Map((rows as { household_id: string; row: string }[]).map((r) => [r.household_id, r.row]));
}

async function permissionsOf(tx: Tx, householdId: string): Promise<string[]> {
  const rows = await tx.execute<{ permissions: string[] }>(
    sql.raw(`SELECT permissions FROM ${TABLE} WHERE household_id = '${householdId}'::uuid`),
  );
  return (rows as { permissions: string[] }[])[0].permissions;
}

async function runMigration(tx: Tx) {
  for (const statement of statementsOf("0038_")) await tx.execute(sql.raw(statement));
}

const sorted = (values: readonly string[]) => [...values].sort();

// Literals of the contract (frozen here, checked against schema.ts by role-permissions-constants.test.ts).
const MODERATOR_AT_0037 = [
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

async function seedPre0038(tx: Tx) {
  return [
    await seed(tx, { key: "moderator", role: "moderator", permissions: [...MODERATOR_AT_0037, "vote"] }),
    await seed(tx, { key: "nonResidentModerator", role: "moderator", permissions: MODERATOR_AT_0037, isResident: false }),
    // a revoked ex-moderator: role member, nothing held (0037)
    await seed(tx, { key: "revokedExModerator", role: "member", permissions: [], revoked: true }),
    await seed(tx, { key: "member", role: "member", permissions: ["vote"] }),
    await seed(tx, { key: "household", role: "household_admin", permissions: HOUSEHOLD }),
  ];
}

describe("[raw SQL] drizzle/0038 against the pre-0038 state", () => {
  it("gives every live moderator delete_application, sorted, and changes no other row", async () => {
    const { before, after } = await withPre0038Copy(async (tx) => {
      const rows = await seedPre0038(tx);
      const beforeRows = await rowsByHousehold(tx);
      await runMigration(tx);
      const afterRows = await rowsByHousehold(tx);
      return {
        before: Object.fromEntries(rows.map((r) => [r.key, beforeRows.get(r.householdId)])),
        after: Object.fromEntries(
          await Promise.all(
            rows.map(async (r) => [r.key, { row: afterRows.get(r.householdId), permissions: await permissionsOf(tx, r.householdId) }] as const),
          ),
        ),
      };
    });

    // the resident moderator: the twelve plus vote, sorted
    expect(after.moderator!.permissions).toEqual(sorted([...MODERATOR_AT_0037, "delete_application", "vote"]));
    // a moderator without a resident profile: the twelve
    expect(after.nonResidentModerator!.permissions).toEqual(sorted([...MODERATOR_AT_0037, "delete_application"]));
    // every other row is byte-identical, and none holds the new name
    for (const key of ["revokedExModerator", "member", "household"]) {
      expect(after[key]!.row, key).toBe(before[key]);
      expect(after[key]!.permissions, key).not.toContain("delete_application");
    }
  });

  it("is re-runnable: a second run of the whole file changes nothing", async () => {
    const [first, second] = await withPre0038Copy(async (tx) => {
      await seedPre0038(tx);
      await runMigration(tx);
      const once = [...(await rowsByHousehold(tx)).values()].sort();
      await runMigration(tx);
      const twice = [...(await rowsByHousehold(tx)).values()].sort();
      return [once, twice];
    });
    expect(second).toEqual(first);
  });

  it("leaves the scratch table under the new constraints: each refuses what it is named for", async () => {
    const refusals: [string, string, string][] = [
      // [constraint, a statement it refuses, the row key]
      ["membership_moderator_holds_role_permissions", "SET permissions = array_remove(permissions, 'delete_application')", "moderator"],
      ["membership_moderator_only_permissions", "SET permissions = permissions || ARRAY['delete_application']::text[]", "member"],
      ["membership_declared_permissions", "SET permissions = permissions || ARRAY['close_round']::text[]", "member"],
    ];
    // One replay; each refusal runs inside its own savepoint, rolled back so the next one starts from
    // the migrated rows.
    const results = await withPre0038Copy(async (tx) => {
      const rows = await seedPre0038(tx);
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
