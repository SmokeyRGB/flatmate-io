import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import {
  HOUSEHOLD_PERMISSIONS,
  HOUSEHOLD_PERMISSIONS_AT_0024,
  MODERATOR_ONLY_PERMISSIONS_AT_0027,
  MODERATOR_PERMISSIONS,
  MODERATOR_PERMISSIONS_AT_0027,
  RESIDENT_PERMISSIONS_AT_0024,
} from "@/modules/identity/schema";
import { uuid } from "../../helpers/uuid";

// drizzle/0029 (F3 change 2b, design D3): the backfills, the precondition and the CHECKs, run against
// the PRE-0029 state. Unlike reverse-permission-backfill.test.ts this is NOT constraint-free: the
// ordering of 0029's statements is argued against the constraints live at each statement (step 3
// drops the exact household CHECK before the backfill would violate it), so the temporary copy of
// `membership` carries the pre-0029 CHECKs, written from the frozen copies of the old sets in
// schema.ts. Every statement of the migration FILE runs, in file order, with only the table name
// rewritten: this exercises the real statements, not a hand-copied approximation. drizzle/0029 is not
// edited for this test.
//
// The temp table is `LIKE membership` without constraints or indexes, so nothing else (a unique
// index on account_id, RLS) gets in the way, and it is dropped ON COMMIT; the transaction always
// rolls back, so nothing reaches the real table.
const TABLE = "membership_pre0029";

function statementsOf0029(): string[] {
  const file = join(__dirname, "../../../drizzle/0029_role_permissions.sql");
  return readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter((s) => s !== "")
    .map((s) => s.replaceAll('"membership"', TABLE));
}

const literal = (values: readonly string[]) =>
  values.length === 0 ? "'{}'::text[]" : `ARRAY[${values.map((v) => `'${v}'`).join(", ")}]::text[]`;

// The CHECKs live before 0029, from the frozen old sets (0024's household and resident, 0027's
// moderator and moderator-only) and the two that 0029 leaves alone.
const PRE_0029_CHECKS = [
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_resident_pairing CHECK (is_resident = (resident_profile_id IS NOT NULL))`,
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_admin_has_no_profile CHECK (role <> 'household_admin' OR resident_profile_id IS NULL)`,
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_moderator_holds_role_permissions CHECK (revoked_at IS NOT NULL OR role <> 'moderator' OR permissions @> ${literal(MODERATOR_PERMISSIONS_AT_0027)})`,
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_moderator_only_permissions CHECK (role = 'moderator' OR NOT (permissions && ${literal(MODERATOR_ONLY_PERMISSIONS_AT_0027)}))`,
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_household_admin_holds_role_permissions CHECK (revoked_at IS NOT NULL OR role <> 'household_admin' OR (permissions @> ${literal(HOUSEHOLD_PERMISSIONS_AT_0024)} AND permissions <@ ${literal(HOUSEHOLD_PERMISSIONS_AT_0024)}))`,
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_resident_holds_role_permissions CHECK (revoked_at IS NOT NULL OR NOT is_resident OR permissions @> ${literal(RESIDENT_PERMISSIONS_AT_0024)})`,
  `ALTER TABLE ${TABLE} ADD CONSTRAINT membership_revoked_holds_nothing CHECK (revoked_at IS NULL OR (cardinality(permissions) = 0 AND role <> 'moderator'))`,
];

type Tx = Parameters<Parameters<typeof withSessionContext>[1]>[0];

// Runs `body` inside one transaction that owns a pre-0029 copy of membership with the pre-0029
// CHECKs, dropped at the end; the transaction always rolls back.
async function withPre0029Copy<T>(body: (tx: Tx) => Promise<T>, options: { checks?: boolean } = {}): Promise<T> {
  const context = { accountId: uuid(), householdId: uuid(), profileId: null };
  let result: T | undefined;
  const rollback = new Error("rollback");
  try {
    await withSessionContext(context, async (tx) => {
      await tx.execute(sql.raw(`CREATE TEMP TABLE ${TABLE} (LIKE membership INCLUDING DEFAULTS) ON COMMIT DROP`));
      if (options.checks !== false) for (const c of PRE_0029_CHECKS) await tx.execute(sql.raw(c));
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
    INSERT INTO membership_pre0029 (household_id, account_id, resident_profile_id, is_resident, role, permissions, revoked_at)
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
  for (const statement of statementsOf0029()) await tx.execute(sql.raw(statement));
}

const sorted = (values: readonly string[]) => [...values].sort();
const unique = (values: readonly string[]) => [...new Set(values)];

const SIX = [
  "manage_join_codes",
  "create_resident_profile",
  "appoint_moderator",
  "manage_members",
  "export_subject_access",
  "manage_round_participation",
];
const OLD_MODERATOR = [...MODERATOR_PERMISSIONS_AT_0027];

function pgCode(err: unknown): { code?: string; constraint_name?: string } {
  const e = err as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  return e.code ? e : (e.cause ?? e);
}

describe("[raw SQL] drizzle/0029 against the pre-0029 state", () => {
  // Seeded with the pre-0029 state of every writer. A revoked former household does not exist (a
  // household account is never revoked: it has no profile to move out), so that row is skipped.
  it("gives every row exactly what its roles entitle it to, drops nothing, and touches nobody else", async () => {
    const after = await withPre0029Copy(async (tx) => {
      const rows = [
        await seed(tx, { key: "household", role: "household_admin", permissions: [...HOUSEHOLD_PERMISSIONS_AT_0024] }),
        await seed(tx, { key: "moderator", role: "moderator", permissions: OLD_MODERATOR }),
        await seed(tx, { key: "moderatorWithGrant", role: "moderator", permissions: [...OLD_MODERATOR, "manage_settings"] }),
        await seed(tx, { key: "nonResidentModerator", role: "moderator", permissions: OLD_MODERATOR, isResident: false }),
        await seed(tx, { key: "revokedMember", role: "member", permissions: [], revoked: true }),
        await seed(tx, { key: "memberWithOldName", role: "member", permissions: ["close_round"] }),
        await seed(tx, { key: "memberWithOldSettings", role: "member", permissions: ["manage_settings"] }),
        await seed(tx, { key: "resident", role: "member", permissions: [] }),
      ];
      await runMigration(tx);
      const byHousehold = await permissionsByHousehold(tx);
      return Object.fromEntries(rows.map((r) => [r.key, byHousehold.get(r.householdId)]));
    });

    // a household with the old two values gains the eight, keeps manage_settings until the contract migration
    expect(sorted(after.household!)).toEqual(sorted(unique([...HOUSEHOLD_PERMISSIONS, "manage_settings"])));
    // a moderator (five) gains the six, manage_rounds (it held close_round), and vote (it is a resident)
    expect(sorted(after.moderator!)).toEqual(sorted([...OLD_MODERATOR, ...SIX, "manage_rounds", "vote"]));
    // a moderator individually granted manage_settings also gains manage_voting_procedure
    expect(sorted(after.moderatorWithGrant!)).toEqual(
      sorted([...OLD_MODERATOR, "manage_settings", ...SIX, "manage_rounds", "manage_voting_procedure", "vote"]),
    );
    // a moderator without a resident profile gains no vote
    expect(sorted(after.nonResidentModerator!)).toEqual(sorted([...OLD_MODERATOR, ...SIX, "manage_rounds"]));
    // a revoked member gains nothing
    expect(after.revokedMember).toEqual([]);
    // a plain member holding an old name carries nothing over (residents hold no organising
    // permission): it gains the resident set only, and keeps the stored old name
    expect(sorted(after.memberWithOldName!)).toEqual(sorted(["close_round", "vote"]));
    expect(sorted(after.memberWithOldSettings!)).toEqual(sorted(["manage_settings", "vote"]));
    // a live resident with no permissions gains vote
    expect(after.resident).toEqual(["vote"]);
    // every moderator's whole old set survived: nothing is dropped
    for (const key of ["moderator", "moderatorWithGrant", "nonResidentModerator"]) {
      for (const p of OLD_MODERATOR) expect(after[key], `${key} keeps ${p}`).toContain(p);
    }
    // the moderator set of the declaration is covered by what a backfilled moderator holds
    for (const p of MODERATOR_PERMISSIONS) expect(after.moderator, `moderator holds ${p}`).toContain(p);
  });

  it("is re-runnable: a second run of the whole file changes nothing", async () => {
    const [first, second] = await withPre0029Copy(async (tx) => {
      await seed(tx, { key: "household", role: "household_admin", permissions: [...HOUSEHOLD_PERMISSIONS_AT_0024] });
      await seed(tx, { key: "moderator", role: "moderator", permissions: OLD_MODERATOR });
      await seed(tx, { key: "resident", role: "member", permissions: [] });
      await runMigration(tx);
      const once = [...(await permissionsByHousehold(tx)).values()].map(sorted);
      await runMigration(tx);
      const twice = [...(await permissionsByHousehold(tx)).values()].map(sorted);
      return [once, twice];
    });
    expect(second).toEqual(first);
  });

  it("the precondition stops the migration when a membership outside its holder group already holds a new permission", async () => {
    for (const permission of ["manage_join_codes", "manage_rounds", "issue_password_reset_link"]) {
      const refused = await withPre0029Copy(
        async (tx) => {
          await seed(tx, { key: "member", role: "member", permissions: [permission] });
          return runMigration(tx).then(
            () => null,
            (err: unknown) => err,
          );
        },
        { checks: false },
      );
      expect(refused, permission).toBeInstanceOf(Error);
      expect(JSON.stringify(refused, Object.getOwnPropertyNames(refused))).toContain(
        "a membership outside its holder group already holds one of the new permissions",
      );
    }
    // vote on a row without is_resident
    const refusedVote = await withPre0029Copy(
      async (tx) => {
        await seed(tx, { key: "nonResident", role: "moderator", permissions: [...OLD_MODERATOR, "vote"], isResident: false });
        return runMigration(tx).then(
          () => null,
          (err: unknown) => err,
        );
      },
      { checks: false },
    );
    expect(refusedVote).toBeInstanceOf(Error);
  });

  // What old code (a branch without this change) writes after 0029 is accepted, with the one
  // refusal design D2 names: an old-code demotion of a BACKFILLED moderator.
  it("replays old code on the migrated copy: registration and appointment are accepted; demoting a fresh old-code moderator is accepted; demoting a backfilled moderator is refused by membership_administration_permissions", async () => {
    const outcome = await withPre0029Copy(async (tx) => {
      const backfilled = await seed(tx, { key: "backfilled", role: "moderator", permissions: OLD_MODERATOR });
      await runMigration(tx);

      // old registration: the two household values (a household has no profile)
      await seed(tx, { key: "oldHousehold", role: "household_admin", permissions: [...HOUSEHOLD_PERMISSIONS_AT_0024] });
      // old appointment: a member given the old five
      const fresh = await seed(tx, { key: "fresh", role: "moderator", permissions: OLD_MODERATOR });

      // old-code demotion: the old EXCEPT of the five. A fresh old-code moderator is left holding nothing role-bound.
      const oldDemotion = (householdId: string) =>
        tx.execute(
          sql.raw(
            `UPDATE ${TABLE} SET role = 'member', permissions = ARRAY(SELECT p FROM unnest(permissions) AS p EXCEPT SELECT p FROM unnest(${literal(OLD_MODERATOR)}) AS p) WHERE household_id = '${householdId}'::uuid`,
          ),
        );
      await oldDemotion(fresh.householdId);
      const freshAfter = (await permissionsByHousehold(tx)).get(fresh.householdId);

      // the backfilled one still holds the six, manage_rounds and vote after the old EXCEPT: refused
      const refused = await oldDemotion(backfilled.householdId).then(
        () => null,
        (err: unknown) => err,
      );
      return { freshAfter, refused };
    });

    expect(outcome.freshAfter).toEqual([]);
    expect(outcome.refused).toBeInstanceOf(Error);
    expect(pgCode(outcome.refused).code).toBe("23514");
    expect(pgCode(outcome.refused).constraint_name).toBe("membership_administration_permissions");
  });

  // Deliberate breaks (tasks 7.8), to run after 0029 reaches dev, since the test needs the database:
  //  (a) move step 3 (the DROP of the old household CHECK) after step 4: the run fails on the temp
  //      copy carrying the old exact household CHECK (the household backfill violates it);
  //  (b) drop the `role = 'moderator'` filter of step 6: a member gains the six, and the exact
  //      assertion on memberWithOldName fails;
  //  (c) make the household floor the eight-value set: the old-code household insert in the replay
  //      case is refused by membership_household_admin_holds_role_permissions.
});
