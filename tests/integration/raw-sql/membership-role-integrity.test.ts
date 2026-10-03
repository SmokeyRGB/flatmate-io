import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, PermissionDeniedError, setMovedOut } from "@/modules/identity/repository";
import { HOUSEHOLD_PERMISSIONS, membership } from "@/modules/identity/schema";
import {
  cleanupAll,
  createNonResidentModerator,
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

  // F3 change 2b / drizzle/0029 (expand): the household CHECK is a FLOOR (manage_rooms) and a CEILING
  // (the eight plus the retired manage_settings), not the exact set, because branches without this
  // change still register the old two-value household on the shared dev database. This case used to
  // read "the household set is exact: neither a missing manage_settings nor an extra close_round";
  // 0029 relaxes the first half on purpose (the contract migration makes the set exact again).
  it("the household set has a floor and a ceiling: a missing manage_settings is accepted (transition), a missing manage_rooms and an extra close_round are refused", async () => {
    hh = await registerTestHousehold();
    // accepted: the retired manage_settings is no longer required (transition case)
    await withSessionContext(hh.context, (tx) =>
      tx.execute(
        sql`UPDATE membership SET permissions = array_remove(permissions, 'manage_settings')
            WHERE account_id = ${hh!.accountId}::uuid`,
      ),
    );
    // refused: the floor (manage_rooms) is still required
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = array_remove(permissions, 'manage_rooms')
          WHERE account_id = ${hh.accountId}::uuid`,
      "membership_household_admin_holds_role_permissions",
    );
    // refused: nothing outside the ceiling (close_round is retired AND not a household permission)
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = permissions || ARRAY['close_round']::text[]
          WHERE account_id = ${hh.accountId}::uuid`,
      "membership_household_admin_holds_role_permissions",
    );
    // refused: the moderator-only values are beyond the ceiling too
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = permissions || ARRAY['reverse_application_state']::text[]
          WHERE account_id = ${hh.accountId}::uuid`,
      "membership_household_admin_holds_role_permissions",
    );
  });

  it("transition: the household holding the eight plus the retired manage_settings is accepted (what a backfilled row carries)", async () => {
    hh = await registerTestHousehold();
    await withSessionContext(hh.context, (tx) =>
      tx.execute(
        sql`UPDATE membership SET permissions = permissions || ARRAY['manage_settings']::text[]
            WHERE account_id = ${hh!.accountId}::uuid`,
      ),
    );
    const [row] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.accountId, hh!.accountId)),
    );
    expect(row.permissions).toContain("manage_settings");
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
  // `change_application_state` may be granted individually (⬜). TRANSITION half: since F3 change 2b
  // the matrix gives a plain resident no individual grant either, but the holder rule for
  // change_application_state / create_application / manage_rooms is enforced only from the contract
  // migration (old-code tests on other branches still grant them); (b) then becomes a refusal.
  it("a live member cannot be granted reverse_application_state, but (transition) can still be granted change_application_state", async () => {
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

// F3 change 2b / drizzle/0029 (expand): the holder rules for the permissions that arrive with one
// permission per matrix row. Each refusal asserts the CHECK's own name, so a refusal reached by the
// wrong constraint cannot pass. These are INVARIANT GUARDS run against the migrated catalog:
// app_runtime cannot drop a constraint and the CHECK cannot be disabled from a test, so the
// deliberate break is carried by the constants test (role-permissions-constants.test.ts, task 1.4),
// which pins the CHECK literals to the declaration.
describe("[G-C7 raw SQL] membership holder rules (drizzle/0029)", () => {
  it("a moderator cannot be written with issue_password_reset_link (membership_household_only_permissions)", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = permissions || ARRAY['issue_password_reset_link']::text[]
          WHERE account_id = ${moderator.accountId}::uuid`,
      "membership_household_only_permissions",
    );
  });

  it("a plain member cannot be written with any member-administration permission or manage_voting_procedure (membership_administration_permissions)", async () => {
    hh = await registerTestHousehold();
    const member = await claimMember(hh, "PlainMember");
    for (const permission of [
      "manage_join_codes",
      "create_resident_profile",
      "appoint_moderator",
      "manage_members",
      "export_subject_access",
      "manage_voting_procedure",
    ]) {
      await expectCheckViolation(
        hh,
        sql`UPDATE membership SET permissions = permissions || ARRAY[${permission}]::text[]
            WHERE account_id = ${member.accountId}::uuid`,
        "membership_administration_permissions",
      );
    }
  });

  it("a plain member cannot be written with manage_rounds or manage_round_participation (membership_moderator_only_permissions)", async () => {
    hh = await registerTestHousehold();
    const member = await claimMember(hh, "PlainMember");
    for (const permission of ["manage_rounds", "manage_round_participation"]) {
      await expectCheckViolation(
        hh,
        sql`UPDATE membership SET permissions = permissions || ARRAY[${permission}]::text[]
            WHERE account_id = ${member.accountId}::uuid`,
        "membership_moderator_only_permissions",
      );
    }
  });

  // TRANSITION case, labelled as such (design Risks, "A plain resident holding create_application or
  // change_application_state until the contract migration"): old-code tests on other branches still
  // grant these to plain members on the shared dev database, so the holder rule for them is enforced
  // only from the contract migration. This accepted write becomes a refusal then.
  it("transition: a plain member written with create_application is still accepted by the database", async () => {
    hh = await registerTestHousehold();
    const member = await claimMember(hh, "GrantedMember");
    await withSessionContext(hh.context, (tx) =>
      tx.execute(
        sql`UPDATE membership SET permissions = permissions || ARRAY['create_application']::text[]
            WHERE account_id = ${member.accountId}::uuid`,
      ),
    );
    const [row] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.accountId, member.accountId)),
    );
    expect(row.permissions).toContain("create_application");
  });

  it("the household account cannot hold close_round or reverse_application_state (its ceiling)", async () => {
    hh = await registerTestHousehold();
    for (const permission of ["close_round", "reverse_application_state"]) {
      await expectCheckViolation(
        hh,
        sql`UPDATE membership SET permissions = permissions || ARRAY[${permission}]::text[]
            WHERE account_id = ${hh.accountId}::uuid`,
        "membership_household_admin_holds_role_permissions",
      );
    }
  });

  it("vote needs a resident profile: a moderator without one cannot be written with it (membership_resident_only_permissions)", async () => {
    hh = await registerTestHousehold();
    const nonResident = await createNonResidentModerator(hh);
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = permissions || ARRAY['vote']::text[]
          WHERE account_id = ${nonResident.accountId}::uuid`,
      "membership_resident_only_permissions",
    );
  });

  // The EXPAND cases (spec identity/permissions, "Until the contract step, a set missing the new
  // values is accepted but grants nothing new"): what branches without this change still write is
  // accepted by the database, and the row is then refused every action gated by a permission it lacks.
  it("expand: a live household row holding only manage_rooms and manage_settings is accepted, and is refused manage_members-gated actions", async () => {
    hh = await registerTestHousehold();
    const member = await claimMember(hh, "SomeMember");
    await withSessionContext(hh.context, (tx) =>
      tx.execute(
        sql`UPDATE membership SET permissions = ARRAY['manage_rooms', 'manage_settings']::text[]
            WHERE account_id = ${hh!.accountId}::uuid`,
      ),
    );
    await expect(setMovedOut(hh.context, hh.accountId, member.accountId)).rejects.toThrow(PermissionDeniedError);
  });

  it("expand: a live moderator holding only the five earlier values is accepted, and is refused manage_members-gated actions", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    const member = await claimMember(hh, "SomeMember");
    await withSessionContext(hh.context, (tx) =>
      tx.execute(
        sql`UPDATE membership SET permissions = ARRAY['manage_rooms', 'close_round', 'create_application', 'change_application_state', 'reverse_application_state']::text[]
            WHERE account_id = ${moderator.accountId}::uuid`,
      ),
    );
    await expect(setMovedOut(moderator.context, moderator.accountId, member.accountId)).rejects.toThrow(
      PermissionDeniedError,
    );
  });
});
