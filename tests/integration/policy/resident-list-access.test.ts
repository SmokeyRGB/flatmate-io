import { afterEach, describe, expect, it } from "vitest";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  createResidentProfile,
  getResidentList,
  PermissionDeniedError,
  setMemberRole,
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

async function claim(household: TestHousehold, name: string) {
  const actor = { accountId: household.accountId, profileId: null };
  const profile = await createResidentProfile(household.context, name, actor);
  const { accountId } = await claimResidentProfile(household.context, profile.id, "test-password-not-real-1234");
  accountIds.push(accountId);
  return {
    accountId,
    profileId: profile.id,
    context: { accountId, householdId: household.householdId, profileId: profile.id },
  };
}

// FR-1.25/FR-1.26/FR-1.27 (revised 2026-09-17, U-30)/AC-1.20/AC-1.21; since F3 change 2b the list is
// decided by the stored member-administration permissions, and returns one capability flag per
// permission-gated control (design D6).
describe("Resident list access by stored permission", () => {
  it("administration and a moderator both get full data (parity, U-30); the flags differ only by issue_password_reset_link", async () => {
    hh = await registerTestHousehold();
    const moderator = await claim(hh, "Moderator");
    // Appointed through setMemberRole so the moderator's permission set is stored with the role
    // (drizzle/0024 refuses a moderator without it); setup only.
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");
    const member = await claim(hh, "PlainMember");

    // Each caller reads with its OWN session: getResidentList refuses an accountId that is not the
    // session's own (design D4), so the old calls that paired hh.context with another account's id
    // are gone.
    const asAdmin = await getResidentList(hh.context, hh.accountId);
    expect(asAdmin).toMatchObject({
      canManageMembers: true,
      canManageJoinCodes: true,
      canCreateProfile: true,
      canAppointModerator: true,
      canIssueResetLink: true,
    });
    expect(asAdmin.members.length).toBeGreaterThanOrEqual(2);

    const asModerator = await getResidentList(moderator.context, moderator.accountId);
    expect(asModerator).toMatchObject({
      canManageMembers: true,
      canManageJoinCodes: true,
      canCreateProfile: true,
      canAppointModerator: true,
      canIssueResetLink: false, // household only (O-16)
    }); // U-30: full parity, not read-only
    expect(asModerator.members.length).toBe(asAdmin.members.length);

    // Parity means a moderator can actually act, not just see the flags.
    await expect(setMovedOut(moderator.context, moderator.accountId, member.accountId)).resolves.not.toThrow();
  });

  it("AC-1.21: a plain member is refused by the one function this list has", async () => {
    hh = await registerTestHousehold();
    const member = await claim(hh, "PlainMember");
    await expect(getResidentList(member.context, member.accountId)).rejects.toThrow(PermissionDeniedError);
  });

  // Hardening (audit finding #1, the PR #19 hole): not a visibility rule — who may see the list is
  // unchanged. A caller used to be able to name another account's id and borrow its rights. The
  // accountId must be the session's own.
  it("refuses an accountId that is not the session's own, so a plain resident cannot borrow the moderator's rights", async () => {
    hh = await registerTestHousehold();
    const moderator = await claim(hh, "Moderator");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");
    const member = await claim(hh, "PlainMember");

    const err = await getResidentList(member.context, moderator.accountId).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(PermissionDeniedError);
    // ... and the household account's own id is no more borrowable than the moderator's
    await expect(getResidentList(member.context, hh.accountId)).rejects.toThrow(PermissionDeniedError);
  });

  it("a demotion committed first takes the list away from the next call", async () => {
    hh = await registerTestHousehold();
    const moderator = await claim(hh, "SoonDemoted");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");
    await expect(getResidentList(moderator.context, moderator.accountId)).resolves.not.toThrow();

    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "member");

    await expect(getResidentList(moderator.context, moderator.accountId)).rejects.toThrow(PermissionDeniedError);
  });
});
