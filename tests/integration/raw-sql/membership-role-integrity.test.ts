import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, setMovedOut } from "@/modules/identity/repository";
import { HOUSEHOLD_PERMISSIONS, membership } from "@/modules/identity/schema";
import {
  cleanupAll,
  createTestModerator,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

type PgError = { code?: string; message?: string; constraint_name?: string };

function pgErrorOf(caught: unknown): PgError {
  const err = caught as PgError & { cause?: PgError };
  // postgres.js throws its own error with `.code` set; drizzle's wrapping sometimes nests it under
  // `.cause` instead. Both are read, so this test is not coupled to which layer surfaces it.
  return err.code ? err : (err.cause ?? err);
}

async function claimMember(household: TestHousehold, name: string) {
  const actor = { accountId: household.accountId, profileId: null };
  const profile = await createResidentProfile(household.context, name, actor);
  const { accountId } = await claimResidentProfile(household.context, profile.id, "test-password-not-real-1234");
  accountIds.push(accountId);
  return { accountId, profileId: profile.id };
}

// Runs one raw statement as app_runtime in the household's session and asserts it fails with a
// CHECK violation (23514) naming exactly this constraint. Asserting the SQLSTATE AND the
// constraint name, not just "an error", proves the refusal comes from this constraint and not from
// RLS or another CHECK (CLAUDE.md, "Tests that can fail").
async function expectCheckViolation(household: TestHousehold, statement: ReturnType<typeof sql>, constraint: string) {
  let caught: unknown;
  try {
    await withSessionContext(household.context, (tx) => tx.execute(statement));
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(Error);
  const pg = pgErrorOf(caught);
  expect(pg.code).toBe("23514");
  expect(pg.constraint_name).toBe(constraint);
}

// drizzle/0024 (design D2/D3): a membership that contradicts its roles is a refused write for every
// writer, raw SQL under app_runtime included. Roles are only names for stored permission sets;
// these CHECKs are what make "a moderator without its rights" or "a moved-out person keeping one"
// impossible rather than a state the application has to cope with.
describe("[G-C7 raw SQL] membership role integrity (drizzle/0024)", () => {
  it("registration still produces an administering membership with no profile and exactly the household set", async () => {
    hh = await registerTestHousehold();
    const [row] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.accountId, hh!.accountId)),
    );
    expect(row.role).toBe("household_admin");
    expect(row.residentProfileId).toBeNull();
    expect([...row.permissions].sort()).toEqual([...HOUSEHOLD_PERMISSIONS].sort());
  });

  it("refuses to give the administering membership a resident profile (membership_admin_has_no_profile)", async () => {
    hh = await registerTestHousehold();
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET resident_profile_id = ${randomUUID()}::uuid, is_resident = true
          WHERE account_id = ${hh.accountId}::uuid`,
      "membership_admin_has_no_profile",
    );
  });

  it("refuses to take create_application away from a live moderator", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = array_remove(permissions, 'create_application')
          WHERE account_id = ${moderator.accountId}::uuid`,
      "membership_moderator_holds_role_permissions",
    );
  });

  it("refuses the moderator role on a member without adding its permissions", async () => {
    hh = await registerTestHousehold();
    const member = await claimMember(hh, "PlainMember");
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET role = 'moderator' WHERE account_id = ${member.accountId}::uuid`,
      "membership_moderator_holds_role_permissions",
    );
  });

  it("the household set is exact: neither a missing manage_settings nor an extra close_round is accepted", async () => {
    hh = await registerTestHousehold();
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = array_remove(permissions, 'manage_settings')
          WHERE account_id = ${hh.accountId}::uuid`,
      "membership_household_admin_holds_role_permissions",
    );
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = permissions || ARRAY['close_round']::text[]
          WHERE account_id = ${hh.accountId}::uuid`,
      "membership_household_admin_holds_role_permissions",
    );
  });

  it("a revoked membership keeps nothing: neither a permission nor the moderator role", async () => {
    hh = await registerTestHousehold();
    const member = await claimMember(hh, "SoonMovedOut");
    const actor = hh.accountId;
    await setMovedOut(hh.context, actor, member.accountId);

    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = ARRAY['manage_rooms']::text[]
          WHERE account_id = ${member.accountId}::uuid`,
      "membership_revoked_holds_nothing",
    );
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET role = 'moderator' WHERE account_id = ${member.accountId}::uuid`,
      "membership_revoked_holds_nothing",
    );
  });

  // drizzle/0027: `reverse_application_state` is moderator-only (matrix ❌, not ⬜), while
  // `change_application_state` may be granted individually (⬜).
  it("a live member cannot be granted reverse_application_state, but can be granted change_application_state", async () => {
    hh = await registerTestHousehold();
    const member = await claimMember(hh, "GrantedMember");
    // (a) refused, by the moderator-only CHECK and no other
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = permissions || ARRAY['reverse_application_state']::text[]
          WHERE account_id = ${member.accountId}::uuid`,
      "membership_moderator_only_permissions",
    );
    // (b) accepted
    await withSessionContext(hh.context, (tx) =>
      tx.execute(
        sql`UPDATE membership SET permissions = permissions || ARRAY['change_application_state']::text[]
            WHERE account_id = ${member.accountId}::uuid`,
      ),
    );
    const [row] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.accountId, member.accountId)),
    );
    expect(row.permissions).toContain("change_application_state");
    expect(row.permissions).not.toContain("reverse_application_state");
  });

  it("refuses to take reverse_application_state away from a live moderator (drizzle/0027)", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = array_remove(permissions, 'reverse_application_state')
          WHERE account_id = ${moderator.accountId}::uuid`,
      "membership_moderator_holds_role_permissions",
    );
  });

  // (a)'s deliberate break is ARGUED, not executed: without membership_moderator_only_permissions,
  // the first UPDATE succeeds (no other constraint, trigger or policy looks at the value), so
  // `caught` is undefined and `toBeInstanceOf(Error)` fails. (c) was run with a scratch pre-0027
  // (four-value) literal: the array_remove would then be accepted and the test fails the same way.

  // Deliberate break (ARGUED, not executed — design D11: DATABASE_URL is app_runtime, which cannot
  // drop a constraint, and a drop on the shared dev database would take an ACCESS EXCLUSIVE lock;
  // the raw-sql/membership-resident-pairing.test.ts precedent). With drizzle/0024's five CHECKs
  // absent, every UPDATE above succeeds — nothing else references role, permissions or
  // resident_profile_id together: no foreign key, no trigger, and RLS's WITH CHECK looks at
  // household_id only — so `caught` is undefined and each `toBeInstanceOf(Error)` fails because no
  // error was thrown at all. That is exactly what a buggy writer or hand-run SQL could do before
  // this migration: leave a moderator without its rights, or a moved-out person with one.
});
