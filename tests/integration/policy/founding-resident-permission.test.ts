import { afterEach, describe, expect, it } from "vitest";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  PermissionDeniedError,
  assertHasPermission,
  createResidentProfile,
  setMemberRole,
} from "@/modules/identity/repository";
import { RESIDENT_PERMISSIONS } from "@/modules/identity/schema";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

// claimResidentProfile creates a plain resident, always, and that is unchanged: the founding link's
// moderator rule applies only to a JOIN through the founding link
// (founding-link-moderator, tests/integration/policy/founding-link-join.test.ts).
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

// Human decision, 2026-09-22 (docs/domain/identity.md §2.1's Rolle-Vorbelegung box; the permission was
// called close_round until F3 change 2b renamed it manage_rounds): manage_rounds is a
// role default, the same shape as manage_rooms — held by household_admin and moderator, not
// inferred from being the first claimed resident membership. This replaces the old rule this file
// used to test (the FIRST claimed resident profile got manage_rounds automatically).
describe("manage_rounds is a role default (identity/permissions capability), not a founding grant", () => {
  it("gives the first AND the second claimed resident membership the resident set (`vote`) and nothing else", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const first = await createResidentProfile(hh.context, "Founder", actor);
    const { accountId: firstAcc, membership: firstMembership } = await claimResidentProfile(
      hh.context,
      first.id,
      "test-password-not-real-1234",
    );
    firstAccountId = firstAcc;
    expect(firstMembership.permissions).not.toContain("manage_rounds");
    expect(firstMembership.permissions).toEqual([...RESIDENT_PERMISSIONS]);

    const second = await createResidentProfile(hh.context, "SecondResident", actor);
    const { accountId: secondAcc, membership: secondMembership } = await claimResidentProfile(
      hh.context,
      second.id,
      "test-password-not-real-1234",
    );
    secondAccountId = secondAcc;
    expect(secondMembership.permissions).not.toContain("manage_rounds");
    expect(secondMembership.permissions).toEqual([...RESIDENT_PERMISSIONS]);
  });

  it("a plain member cannot manage_rounds, but appointing it moderator grants manage_rounds with no individual grant", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const profile = await createResidentProfile(hh.context, "Resident", actor);
    const { accountId, membership: memberMembership } = await claimResidentProfile(
      hh.context,
      profile.id,
      "test-password-not-real-1234",
    );
    firstAccountId = accountId;
    expect(memberMembership.permissions).toEqual([...RESIDENT_PERMISSIONS]);

    // PR #19 review: assertHasPermission now derives authorization from the authenticated
    // session — exercise it with the resident's OWN SessionContext, not the admin's hh.context
    // paired with the resident's accountId (that combination is refused as a session/actor
    // mismatch, not for lacking manage_rounds, which is what this test means to show).
    const residentContext = { accountId, householdId: hh.householdId, profileId: profile.id };

    // A plain member: manage_rounds is refused, and nothing in its own permissions array grants it.
    await expect(assertHasPermission(residentContext, accountId, "manage_rounds")).rejects.toThrow(
      PermissionDeniedError,
    );

    // Appointed moderator: setMemberRole stores the moderator's set (MODERATOR_PERMISSIONS) on the
    // membership, and manage_rounds passes because it is stored there (design D3: no role is read).
    await setMemberRole(hh.context, hh.accountId, accountId, "moderator");
    await expect(assertHasPermission(residentContext, accountId, "manage_rounds")).resolves.toBeUndefined();
  });
});
