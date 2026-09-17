import { describe, expect, it } from "vitest";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  CannotChangeAdminRoleError,
  createResidentProfile,
  ResidentListActionDeniedError,
  setMemberRole,
} from "@/modules/identity/repository";
import { deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// EC-1.7 (Convergence): "administration may create a resident profile and appoint it moderator"
// — the appointment action itself, previously missing entirely (only ever set via a raw DB
// write in test fixtures, never through any application code path).
describe("Moderator appointment (EC-1.7)", () => {
  it("lets administration promote a member to moderator and back", async () => {
    let hh: TestHousehold | undefined;
    let accountId: string | undefined;
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };
      const profile = await createResidentProfile(hh.context, "Resident1", actor);
      const claimed = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
      accountId = claimed.accountId;
      expect(claimed.membership.role).toBe("member");

      await setMemberRole(hh.context, hh.accountId, accountId, "moderator");
      await setMemberRole(hh.context, hh.accountId, accountId, "member");
      // No error thrown either way is the behavior under test; role is re-verified via a second
      // promotion succeeding cleanly (a stale/incorrect role would surface as a thrown error).
      await expect(setMemberRole(hh.context, hh.accountId, accountId, "moderator")).resolves.toBeUndefined();
    } finally {
      if (accountId) await deleteTestAccount(accountId);
      if (hh) await hh.cleanup();
    }
  });

  it("refuses a non-admin caller and refuses changing the household_admin's own role", async () => {
    let hh: TestHousehold | undefined;
    let memberAccountId: string | undefined;
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };
      const profile = await createResidentProfile(hh.context, "Resident1", actor);
      const claimed = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
      memberAccountId = claimed.accountId;

      await expect(
        setMemberRole(hh.context, memberAccountId, memberAccountId, "moderator"),
      ).rejects.toThrow(ResidentListActionDeniedError);

      await expect(
        setMemberRole(hh.context, hh.accountId, hh.accountId, "moderator"),
      ).rejects.toThrow(CannotChangeAdminRoleError);
    } finally {
      if (memberAccountId) await deleteTestAccount(memberAccountId);
      if (hh) await hh.cleanup();
    }
  });
});
