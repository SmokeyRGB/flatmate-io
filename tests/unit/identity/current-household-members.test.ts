import { afterEach, describe, expect, it } from "vitest";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  createResidentProfile,
  getCurrentHouseholdMembers,
  PermissionDeniedError,
  setMovedOut,
} from "@/modules/identity/repository";
import {
  cleanupAll,
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

// FR-1.31/AC-1.24/U-30: every resident sees current (`active`) members only, names only, no
// actions — refused for a profile-less (household-account) session.
describe("getCurrentHouseholdMembers (screen B5, FR-1.31)", () => {
  it("shows only active members' display names, excludes moved_out, refuses a profile-less session", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const activeProfile = await createResidentProfile(hh.context, "StillHere", actor);
    const { accountId: activeAccountId } = await claimResidentProfile(
      hh.context,
      activeProfile.id,
      "test-password-not-real-1234",
    );
    accountIds.push(activeAccountId);

    const movedOutProfile = await createResidentProfile(hh.context, "MovedOut", actor);
    const { accountId: movedOutAccountId } = await claimResidentProfile(
      hh.context,
      movedOutProfile.id,
      "test-password-not-real-1234",
    );
    accountIds.push(movedOutAccountId);
    await setMovedOut(hh.context, hh.accountId, movedOutAccountId);

    // A resident session (any active profile) sees current members only.
    const residentContext = { ...hh.context, profileId: activeProfile.id };
    const members = await getCurrentHouseholdMembers(residentContext);

    expect(members.map((m) => m.displayName)).toContain("StillHere");
    expect(members.map((m) => m.displayName)).not.toContain("MovedOut");
    expect(Object.keys(members[0])).toEqual(["displayName"]); // names only, no other field

    // The household (profile-less) account is refused this view (distinct from O16's admin list).
    await expect(getCurrentHouseholdMembers(hh.context)).rejects.toThrow(PermissionDeniedError);
  });
});
