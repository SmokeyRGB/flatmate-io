import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  createResidentProfile,
  DisplayNameConfirmationMismatchError,
  reactivateMember,
  removeMember,
  setMovedOut,
} from "@/modules/identity/repository";
import { deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

async function eventsFor(hh: TestHousehold) {
  return withSessionContext(hh.context, (tx) =>
    tx
      .select()
      .from(activityEvent)
      .where(and(eq(activityEvent.householdId, hh.householdId), eq(activityEvent.actorAccountId, hh.accountId))),
  );
}

// AC-1.23/FR-1.30: every removal/moved_out/reactivation writes an ActivityEvent naming both
// account and acting profile. U-27: the two removal tiers are distinct events.
describe("Resident list actions are audited", () => {
  it("setMovedOut (soft tier) records membership.revoked; reactivateMember records membership.reactivated", async () => {
    let hh: TestHousehold | undefined;
    const accountIds: string[] = [];
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };
      const profile = await createResidentProfile(hh.context, "MovingOut", actor);
      const { accountId: targetAccountId } = await claimResidentProfile(
        hh.context,
        profile.id,
        "test-password-not-real-1234",
      );
      accountIds.push(targetAccountId);

      await setMovedOut(hh.context, hh.accountId, targetAccountId);
      await reactivateMember(hh.context, hh.accountId, targetAccountId);

      const events = await eventsFor(hh);
      expect(events.some((e) => e.eventType === "membership.revoked")).toBe(true);
      expect(events.some((e) => e.eventType === "membership.reactivated")).toBe(true);
    } finally {
      for (const id of accountIds) await deleteTestAccount(id);
      if (hh) await hh.cleanup();
    }
  });

  it("removeMember (hard tier, U-27) requires the exact display name and records membership.removed_as_intruder", async () => {
    let hh: TestHousehold | undefined;
    const accountIds: string[] = [];
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };
      const profile = await createResidentProfile(hh.context, "Intruder", actor);
      const { accountId: targetAccountId } = await claimResidentProfile(
        hh.context,
        profile.id,
        "test-password-not-real-1234",
      );
      accountIds.push(targetAccountId);

      // Wrong confirmation: refused, no event, no revocation.
      await expect(
        removeMember(hh.context, hh.accountId, targetAccountId, "Not The Right Name"),
      ).rejects.toThrow(DisplayNameConfirmationMismatchError);
      expect((await eventsFor(hh)).some((e) => e.eventType === "membership.removed_as_intruder")).toBe(false);

      // Correct confirmation: succeeds.
      await removeMember(hh.context, hh.accountId, targetAccountId, "Intruder");
      expect((await eventsFor(hh)).some((e) => e.eventType === "membership.removed_as_intruder")).toBe(true);
    } finally {
      for (const id of accountIds) await deleteTestAccount(id);
      if (hh) await hh.cleanup();
    }
  });
});
