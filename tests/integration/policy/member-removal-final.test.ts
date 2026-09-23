import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  createResidentProfile,
  getResidentList,
  reactivateMember,
  removeMember,
  setMovedOut,
} from "@/modules/identity/repository";
import { membership, residentProfile } from "@/modules/identity/schema";
import { InvalidResidentProfileTransitionError } from "@/modules/identity/transitions";
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

async function membershipRowFor(hh: TestHousehold, accountId: string) {
  const [row] = await withSessionContext(hh.context, (tx) =>
    tx.select().from(membership).where(eq(membership.accountId, accountId)),
  );
  return row;
}

async function movedOutOnFor(hh: TestHousehold, profileId: string): Promise<string | null> {
  const [row] = await withSessionContext(hh.context, (tx) =>
    tx.select({ movedOutOn: residentProfile.movedOutOn }).from(residentProfile).where(eq(residentProfile.id, profileId)),
  );
  return row.movedOutOn ?? null;
}

async function eventsFor(hh: TestHousehold, eventType: string) {
  return withSessionContext(hh.context, (tx) =>
    tx
      .select()
      .from(activityEvent)
      .where(
        and(eq(activityEvent.householdId, hh.householdId), eq(activityEvent.eventType, eventType)),
      ),
  );
}

// U-27/design.md Decision 1: the hard tier lands in a fourth, final status — `removed` — not in
// `moved_out` (the bug this change fixes). Both source statuses (active, moved_out) can reach it.
describe("Member removal is final (U-27, design.md Decision 1)", () => {
  it("removes an active member into `removed`, distinct from moved_out in the audit trail", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "Intruder", actor);
    const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
    accountIds.push(accountId);

    await removeMember(hh.context, hh.accountId, accountId, "Intruder");

    const { members } = await getResidentList(hh.context, hh.accountId);
    // removed -> absent from the list entirely (not present with status "removed")
    expect(members.find((m) => m.id === profile.id)).toBeUndefined();

    const removedEvents = await eventsFor(hh, "membership.removed_as_intruder");
    const revokedEvents = await eventsFor(hh, "membership.revoked");
    expect(removedEvents.length).toBeGreaterThan(0);
    expect(revokedEvents).toHaveLength(0);
  });

  it("removes an already-moved-out member into `removed`, keeping the original revoked_at", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "MovedOutThenRemoved", actor);
    const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
    accountIds.push(accountId);

    await setMovedOut(hh.context, hh.accountId, accountId);
    const revokedAtAfterMoveOut = (await membershipRowFor(hh, accountId)).revokedAt;
    expect(revokedAtAfterMoveOut).not.toBeNull();

    // A real gap so a naive re-SET would visibly change the timestamp.
    await new Promise((resolve) => setTimeout(resolve, 20));

    await removeMember(hh.context, hh.accountId, accountId, "MovedOutThenRemoved");

    const row = await membershipRowFor(hh, accountId);
    expect(row.revokedAt).not.toBeNull();
    expect(row.revokedAt!.getTime()).toBe(revokedAtAfterMoveOut!.getTime());

    // The audit event is still always written on this tier, even though the SET was a no-op.
    const removedEvents = await eventsFor(hh, "membership.removed_as_intruder");
    expect(removedEvents.length).toBeGreaterThan(0);

    const { members } = await getResidentList(hh.context, hh.accountId);
    expect(members.find((m) => m.id === profile.id)).toBeUndefined();
  });

  it("refuses to reactivate a removed member; membership stays revoked, no reactivated event", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "CannotComeBack", actor);
    const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
    accountIds.push(accountId);

    await removeMember(hh.context, hh.accountId, accountId, "CannotComeBack");

    await expect(reactivateMember(hh.context, hh.accountId, accountId)).rejects.toThrow(
      InvalidResidentProfileTransitionError,
    );

    const row = await membershipRowFor(hh, accountId);
    expect(row.revokedAt).not.toBeNull();

    const reactivatedEvents = await eventsFor(hh, "membership.reactivated");
    expect(reactivatedEvents).toHaveLength(0);
  });

  it("still reactivates a moved-out (not removed) member normally", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "ComingBack", actor);
    const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
    accountIds.push(accountId);

    await setMovedOut(hh.context, hh.accountId, accountId);
    const { members: beforeReactivate } = await getResidentList(hh.context, hh.accountId);
    expect(beforeReactivate.find((m) => m.id === profile.id)?.status).toBe("moved_out");

    await reactivateMember(hh.context, hh.accountId, accountId);

    const row = await membershipRowFor(hh, accountId);
    expect(row.revokedAt).toBeNull();
    const { members: afterReactivate } = await getResidentList(hh.context, hh.accountId);
    expect(afterReactivate.find((m) => m.id === profile.id)?.status).toBe("active");
  });

  // Copilot review fix (PR #18): transitionResidentProfileStatusTx's moved_out -> active branch
  // had lost its `patch.movedOutOn = null` assignment (repository.ts) — only the comment
  // explaining it survived a previous edit, so `moved_out_on` kept dangling on a reactivated,
  // otherwise-active profile. This asserts the full lifecycle of that one field: set on
  // setMovedOut, cleared on reactivateMember, and — the other half of the same comment's
  // guarantee — left UNTOUCHED by a moved_out -> removed transition, since removal sets no date of
  // its own (design.md Decision 5).
  it("moved_out_on is set by setMovedOut, cleared by reactivateMember, and kept by moved_out -> removed", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const profileReactivated = await createResidentProfile(hh.context, "MovedOutOnClears", actor);
    const { accountId: accountReactivated } = await claimResidentProfile(
      hh.context,
      profileReactivated.id,
      "test-password-not-real-1234",
    );
    accountIds.push(accountReactivated);

    await setMovedOut(hh.context, hh.accountId, accountReactivated);
    expect(await movedOutOnFor(hh, profileReactivated.id)).not.toBeNull();

    await reactivateMember(hh.context, hh.accountId, accountReactivated);
    expect(await movedOutOnFor(hh, profileReactivated.id)).toBeNull();

    const profileRemoved = await createResidentProfile(hh.context, "MovedOutOnKeptOnRemoval", actor);
    const { accountId: accountRemoved } = await claimResidentProfile(
      hh.context,
      profileRemoved.id,
      "test-password-not-real-1234",
    );
    accountIds.push(accountRemoved);

    await setMovedOut(hh.context, hh.accountId, accountRemoved);
    const movedOutOnBeforeRemoval = await movedOutOnFor(hh, profileRemoved.id);
    expect(movedOutOnBeforeRemoval).not.toBeNull();

    await removeMember(hh.context, hh.accountId, accountRemoved, "MovedOutOnKeptOnRemoval");
    expect(await movedOutOnFor(hh, profileRemoved.id)).toBe(movedOutOnBeforeRemoval);
  });

  it("leads with the join-code action once the household's only resident is removed (AC-1.22)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "OnlyOne", actor);
    const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
    accountIds.push(accountId);

    await removeMember(hh.context, hh.accountId, accountId, "OnlyOne");

    const { members, leadWithJoinCode } = await getResidentList(hh.context, hh.accountId);
    expect(members).toHaveLength(0);
    expect(leadWithJoinCode).toBe(true);
  });

  it("a moved-out member still appears in the resident list, labelled moved_out", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "StillListed", actor);
    const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
    accountIds.push(accountId);

    await setMovedOut(hh.context, hh.accountId, accountId);

    const { members } = await getResidentList(hh.context, hh.accountId);
    expect(members.find((m) => m.id === profile.id)?.status).toBe("moved_out");
  });
});
