import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
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

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  for (const id of accountIds) await deleteTestAccount(id);
  accountIds.length = 0;
  if (hh) await hh.cleanup();
  hh = undefined;
});

// AC-1.23/FR-1.30: every removal/moved_out/reactivation writes an ActivityEvent naming both
// account and acting profile. U-27: the two removal tiers are distinct events.
describe("Resident list actions are audited", () => {
  it("setMovedOut (soft tier) records membership.revoked; reactivateMember records membership.reactivated", async () => {
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
  });

  it("removeMember (hard tier, U-27) requires the exact display name and records membership.removed_as_intruder", async () => {
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
  });

  // 003-remove-resident-modal, T015: pins the exact failure mode removeMemberAction's broadened
  // catch (src/app/(org)/members/actions.ts) must handle gracefully — a target that no longer
  // has a Membership row (spec.md's edge case: "someone else already removed them") throws a
  // plain Error distinct from DisplayNameConfirmationMismatchError, not the mismatch error.
  it("removeMember throws a plain (non-mismatch) error for a target with no Membership row", async () => {
    hh = await registerTestHousehold();
    const bogusAccountId = "00000000-0000-0000-0000-000000000000";
    let caught: unknown;
    try {
      await removeMember(hh.context, hh.accountId, bogusAccountId, "Anything");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(DisplayNameConfirmationMismatchError);
  });
});
