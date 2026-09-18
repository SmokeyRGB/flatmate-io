import { describe, expect, it } from "vitest";
import { claimResidentProfile, signIn } from "@/modules/identity/auth";
import {
  createResidentProfile,
  reactivateMember,
  removeMember,
  resolveSessionContext,
  setMovedOut,
} from "@/modules/identity/repository";
import { deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// V-3 (docs/domain/invarianten.md §5.3): "moved_out" revokes access immediately — a Session
// already issued before the move-out must stop resolving, not remain valid until it naturally
// expires (bug: revokeMembershipForProfile only revoked Membership, never Session).
describe("moved-out resident's pre-existing session (V-3)", () => {
  it("stops resolving once setMovedOut runs, and is not revived by reactivateMember", async () => {
    let hh: TestHousehold | undefined;
    const accountIds: string[] = [];
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };

      const profile = await createResidentProfile(hh.context, "AboutToMove", actor);
      const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
      accountIds.push(accountId);

      const { session: residentSession } = await signIn({
        kind: "resident",
        householdId: hh.householdId,
        displayName: "AboutToMove",
        password: "test-password-not-real-1234",
      });

      expect(await resolveSessionContext(residentSession.id, hh.householdId)).not.toBeNull();

      await setMovedOut(hh.context, hh.accountId, accountId);

      expect(await resolveSessionContext(residentSession.id, hh.householdId)).toBeNull();

      // Reactivation restores access on a fresh sign-in, not by reviving the stale session.
      await reactivateMember(hh.context, hh.accountId, accountId);
      expect(await resolveSessionContext(residentSession.id, hh.householdId)).toBeNull();
    } finally {
      for (const id of accountIds) await deleteTestAccount(id);
      if (hh) await hh.cleanup();
    }
  });

  it("also revokes the session on the hard removal tier (removeMember)", async () => {
    let hh: TestHousehold | undefined;
    const accountIds: string[] = [];
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };

      const profile = await createResidentProfile(hh.context, "Intruder", actor);
      const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
      accountIds.push(accountId);

      const { session: residentSession } = await signIn({
        kind: "resident",
        householdId: hh.householdId,
        displayName: "Intruder",
        password: "test-password-not-real-1234",
      });

      await removeMember(hh.context, hh.accountId, accountId, "Intruder");

      expect(await resolveSessionContext(residentSession.id, hh.householdId)).toBeNull();
    } finally {
      for (const id of accountIds) await deleteTestAccount(id);
      if (hh) await hh.cleanup();
    }
  });
});
