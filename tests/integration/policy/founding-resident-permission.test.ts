import { afterEach, describe, expect, it } from "vitest";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  PermissionDeniedError,
  assertHasPermission,
  createResidentProfile,
  setMemberRole,
} from "@/modules/identity/repository";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

let hh: TestHousehold | undefined;
let firstAccountId: string | undefined;
let secondAccountId: string | undefined;

afterEach(async () => {
  await cleanupAll(
    firstAccountId ? deleteTestAccount(firstAccountId) : undefined,
    secondAccountId ? deleteTestAccount(secondAccountId) : undefined,
    hh?.cleanup(),
  );
  firstAccountId = undefined;
  secondAccountId = undefined;
  hh = undefined;
});

// Human decision, 2026-09-22 (docs/domain/identity.md §2.1's close_round note): close_round is a
// role default, the same shape as manage_rooms — held by household_admin and moderator, not
// inferred from being the first claimed resident membership. This replaces the old rule this file
// used to test (the FIRST claimed resident profile got close_round automatically).
describe("close_round is a role default (identity/permissions capability), not a founding grant", () => {
  it("gives the first AND the second claimed resident membership no permissions at all", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const first = await createResidentProfile(hh.context, "Founder", actor);
    const { accountId: firstAcc, membership: firstMembership } = await claimResidentProfile(
      hh.context,
      first.id,
      "test-password-not-real-1234",
    );
    firstAccountId = firstAcc;
    expect(firstMembership.permissions).not.toContain("close_round");
    expect(firstMembership.permissions).toEqual([]);

    const second = await createResidentProfile(hh.context, "SecondResident", actor);
    const { accountId: secondAcc, membership: secondMembership } = await claimResidentProfile(
      hh.context,
      second.id,
      "test-password-not-real-1234",
    );
    secondAccountId = secondAcc;
    expect(secondMembership.permissions).not.toContain("close_round");
    expect(secondMembership.permissions).toEqual([]);
  });

  it("a plain member cannot close_round, but appointing it moderator grants close_round with no individual grant", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const profile = await createResidentProfile(hh.context, "Resident", actor);
    const { accountId, membership: memberMembership } = await claimResidentProfile(
      hh.context,
      profile.id,
      "test-password-not-real-1234",
    );
    firstAccountId = accountId;
    expect(memberMembership.permissions).toEqual([]);

    // PR #19 review: assertHasPermission now derives authorization from the authenticated
    // session — exercise it with the resident's OWN SessionContext, not the admin's hh.context
    // paired with the resident's accountId (that combination is refused as a session/actor
    // mismatch, not for lacking close_round, which is what this test means to show).
    const residentContext = { accountId, householdId: hh.householdId, profileId: profile.id };

    // A plain member: close_round is refused, and nothing in its own permissions array grants it.
    await expect(assertHasPermission(residentContext, accountId, "close_round")).rejects.toThrow(
      PermissionDeniedError,
    );

    // Appointed moderator: close_round now passes via MODERATOR_DEFAULT_PERMISSIONS — the
    // permissions array itself is still empty, nothing was granted to it individually.
    await setMemberRole(hh.context, hh.accountId, accountId, "moderator");
    await expect(assertHasPermission(residentContext, accountId, "close_round")).resolves.toBeUndefined();
  });
});
