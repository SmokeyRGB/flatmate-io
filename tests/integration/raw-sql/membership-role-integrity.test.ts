import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, setMovedOut } from "@/modules/identity/repository";
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
  const { accountId } = await claimResidentProfile(household.context, profile.id, "test-password-not-real-1234", "de");
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

  // drizzle/0037: the household set is exact. 0029 had left a floor (manage_rooms) and a ceiling
  // that still admitted the retired manage_settings; the "transition:" cases that accepted a missing
  // manage_settings and an extra manage_settings are replaced by these refusals and by the declared-
  // names case below (household + manage_settings).
  it("the household set is exact: a missing manage_rooms or issue_password_reset_link is refused (floor), an extra reverse_application_state or vote too (ceiling)", async () => {
    hh = await registerTestHousehold();
    for (const permission of ["manage_rooms", "issue_password_reset_link"]) {
      await expectCheckViolation(
        hh,
        sql`UPDATE membership SET permissions = array_remove(permissions, ${permission})
            WHERE account_id = ${hh.accountId}::uuid`,
        "membership_household_admin_holds_role_permissions",
      );
    }
    // The ceiling: household_admin_holds... sorts before moderator_only... and resident_only..., so
    // it is the constraint that reports. (An undeclared name such as close_round is refused by
    // membership_declared_permissions first, which sorts before it: no undeclared name exists that
    // only the household ceiling refuses.)
    for (const permission of ["reverse_application_state", "vote"]) {
      await expectCheckViolation(
        hh,
        sql`UPDATE membership SET permissions = permissions || ARRAY[${permission}]::text[]
            WHERE account_id = ${hh.accountId}::uuid`,
        "membership_household_admin_holds_role_permissions",
      );
    }
  });

  it("refuses to take manage_members away from a live moderator (membership_moderator_holds_role_permissions)", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = array_remove(permissions, 'manage_members')
          WHERE account_id = ${moderator.accountId}::uuid`,
      "membership_moderator_holds_role_permissions",
    );
  });

  // drizzle/0037: a live resident holds vote. Replaces the old-code join/claim write of an empty
  // set that 0029 still accepted.
  it("refuses an empty permission set on a live resident (membership_resident_holds_role_permissions)", async () => {
    hh = await registerTestHousehold();
    const member = await claimMember(hh, "SoonEmpty");
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = '{}'::text[] WHERE account_id = ${member.accountId}::uuid`,
      "membership_resident_holds_role_permissions",
    );
  });

  // drizzle/0037: a stored name must be declared. Each fixture violates this constraint first by
  // name (declared... sorts before household_admin_holds... and moderator_only...), and dropping it
  // would change the reported constraint or accept the write.
  it("refuses a name the matrix does not declare: close_round and manage_settings on a moderator, a plain member or the household (membership_declared_permissions)", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    const member = await claimMember(hh, "PlainMember");
    for (const [accountId, permission] of [
      [moderator.accountId, "close_round"],
      [member.accountId, "close_round"],
      [hh.accountId, "close_round"],
      [hh.accountId, "manage_settings"],
    ] as const) {
      await expectCheckViolation(
        hh,
        sql`UPDATE membership SET permissions = permissions || ARRAY[${permission}]::text[]
            WHERE account_id = ${accountId}::uuid`,
        "membership_declared_permissions",
      );
    }
  });

  it("a revoked membership keeps nothing: neither a permission nor the moderator role", async () => {
    hh = await registerTestHousehold();
    const member = await claimMember(hh, "SoonMovedOut");
    const actor = hh.accountId;
    await setMovedOut(hh.context, actor, member.accountId);

    // vote, not an organising permission: the holder CHECKs sort before revoked_holds_nothing, and
    // vote is the one value a revoked-but-still-is_resident row could be written with that no other
    // CHECK refuses.
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET permissions = ARRAY['vote']::text[]
          WHERE account_id = ${member.accountId}::uuid`,
      "membership_revoked_holds_nothing",
    );
    await expectCheckViolation(
      hh,
      sql`UPDATE membership SET role = 'moderator' WHERE account_id = ${member.accountId}::uuid`,
      "membership_revoked_holds_nothing",
    );
  });

  // drizzle/0027 and drizzle/0037: reverse_application_state, create_application and
  // change_application_state are moderator-only (matrix ❌, not ⬜): since 0037 a plain member cannot
  // hold change_application_state either (0027/0029 allowed it as a ⬜ grant). The accepted
  // "transition" half is replaced by this refusal.
  it("a live member cannot be granted reverse_application_state or change_application_state (membership_moderator_only_permissions)", async () => {
    hh = await registerTestHousehold();
    const member = await claimMember(hh, "GrantedMember");
    for (const permission of ["reverse_application_state", "change_application_state"]) {
      await expectCheckViolation(
        hh,
        sql`UPDATE membership SET permissions = permissions || ARRAY[${permission}]::text[]
            WHERE account_id = ${member.accountId}::uuid`,
        "membership_moderator_only_permissions",
      );
    }
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

  // The deliberate break of the moderator-only case is ARGUED, not executed: without
  // membership_moderator_only_permissions the first UPDATE succeeds (no other constraint, trigger or
  // policy looks at the value), so `caught` is undefined and `toBeInstanceOf(Error)` fails.

  // Deliberate break (ARGUED, not executed — design D11: DATABASE_URL is app_runtime, which cannot
  // drop a constraint, and a drop on the shared dev database would take an ACCESS EXCLUSIVE lock;
  // the raw-sql/membership-resident-pairing.test.ts precedent). With drizzle/0024's five CHECKs
  // absent, every UPDATE above succeeds — nothing else references role, permissions or
  // resident_profile_id together: no foreign key, no trigger, and RLS's WITH CHECK looks at
  // household_id only — so `caught` is undefined and each `toBeInstanceOf(Error)` fails because no
  // error was thrown at all. That is exactly what a buggy writer or hand-run SQL could do before
  // this migration: leave a moderator without its rights, or a moved-out person with one.
});

// F3 change 2b / drizzle/0029, completed by drizzle/0037 (contract): the holder rules for the
// permissions that arrive with one permission per matrix row. Each refusal asserts the CHECK's own
// name, so a refusal reached by the wrong constraint cannot pass. These are INVARIANT GUARDS run
// against the migrated catalog: app_runtime cannot drop a constraint and the CHECK cannot be
// disabled from a test, so the deliberate break is carried by the constants test
// (role-permissions-constants.test.ts), which pins the CHECK literals to the declaration.
describe("[G-C7 raw SQL] membership holder rules (drizzle/0029, drizzle/0037)", () => {
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
      "manage_rooms",
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

  it("a plain member cannot be written with manage_rounds, manage_round_participation or create_application (membership_moderator_only_permissions)", async () => {
    hh = await registerTestHousehold();
    const member = await claimMember(hh, "PlainMember");
    for (const permission of ["manage_rounds", "manage_round_participation", "create_application"]) {
      await expectCheckViolation(
        hh,
        sql`UPDATE membership SET permissions = permissions || ARRAY[${permission}]::text[]
            WHERE account_id = ${member.accountId}::uuid`,
        "membership_moderator_only_permissions",
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
});
