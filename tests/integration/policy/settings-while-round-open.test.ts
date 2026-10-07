import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  createResidentProfile,
  getHouseholdSettings,
  PermissionDeniedError,
} from "@/modules/identity/repository";
import { createRoom, createRound, openRound, updateHouseholdSettings } from "@/modules/casting/repository";
import { castingRound } from "@/modules/casting/schema";
import {
  cleanupAll,
  createTestModerator,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

async function claim(hh: TestHousehold, name: string) {
  const actor = { accountId: hh.accountId, profileId: null };
  const profile = await createResidentProfile(hh.context, name, actor);
  const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234", "de");
  return { profileId: profile.id, accountId };
}

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

const DEFAULT_WEIGHTS = { no: 0, rather_not: 1, good: 3, definitely: 5 };
const NEW_WEIGHTS = { no: 0, rather_not: 2, good: 4, definitely: 6 };

async function snapshotOf(h: TestHousehold, roundId: string) {
  const [row] = await withSessionContext(h.context, (tx) =>
    tx.select().from(castingRound).where(eq(castingRound.id, roundId)),
  );
  return row?.settingsSnapshot;
}

// FR-1.21 relaxed by the human decision of 2026-10-05: a voting-procedure change is allowed while a
// round is open and reaches only rounds opened afterwards (FR-1.15: an open round keeps its snapshot).
describe("Voting-procedure settings while a round is open", () => {
  it("accepts a change of all four settings while a round is open and writes exactly the changed columns (AC-1.13)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const moderator = await createTestModerator(hh, "Resident1");
    const modActor = { accountId: moderator.accountId, profileId: moderator.profileId };
    const roomA = await createRoom(hh.context, "Room A", actor);
    const round = await createRound(moderator.context, "Round", [roomA.id], modActor);
    await openRound(moderator.context, round.id, modActor);
    const before = await getHouseholdSettings(hh.context);

    const updated = await updateHouseholdSettings(
      hh.context,
      {
        scaleWeights: NEW_WEIGHTS,
        favoriteBudgetFactor: "2.5",
        hideResultsUntilVoted: false,
        quorumShare: "0.7",
      },
      actor,
    );

    expect(updated).toMatchObject({
      householdId: hh.householdId,
      scaleWeights: NEW_WEIGHTS,
      favoriteBudgetFactor: "2.5",
      hideResultsUntilVoted: false,
      quorumShare: "0.7",
      updatedByAccountId: hh.accountId,
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime());
    const events = await withSessionContext(hh.context, (tx) =>
      tx
        .select()
        .from(activityEvent)
        .where(and(eq(activityEvent.eventType, "household_settings.changed"), eq(activityEvent.subjectId, hh!.householdId))),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({
      field: "scaleWeights,favoriteBudgetFactor,hideResultsUntilVoted,quorumShare",
    });
  });

  it("leaves the open round's snapshot unchanged, and a round opened afterwards takes the new values (FR-1.15, AC-1.9)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const moderator = await createTestModerator(hh, "Resident1");
    const modActor = { accountId: moderator.accountId, profileId: moderator.profileId };
    const roomA = await createRoom(hh.context, "Room A", actor);
    const roomB = await createRoom(hh.context, "Room B", actor);
    const first = await createRound(moderator.context, "First", [roomA.id], modActor);
    await openRound(moderator.context, first.id, modActor);
    const frozen = {
      scaleWeights: DEFAULT_WEIGHTS,
      favoriteBudgetFactor: "1.5",
      hideResultsUntilVoted: true,
      quorumShare: "0.5",
      revealVoteAuthorship: false,
    };
    expect(await snapshotOf(hh, first.id)).toEqual(frozen);

    await updateHouseholdSettings(
      hh.context,
      { scaleWeights: NEW_WEIGHTS, favoriteBudgetFactor: "2.5", hideResultsUntilVoted: false, quorumShare: "0.9" },
      actor,
    );

    expect(await snapshotOf(hh, first.id)).toEqual(frozen);
    const second = await createRound(moderator.context, "Second", [roomB.id], modActor);
    await openRound(moderator.context, second.id, modActor);
    expect(await snapshotOf(hh, second.id)).toEqual({
      scaleWeights: NEW_WEIGHTS,
      favoriteBudgetFactor: "2.5",
      hideResultsUntilVoted: false,
      quorumShare: "0.9",
      revealVoteAuthorship: false,
    });
    expect(await snapshotOf(hh, first.id)).toEqual(frozen);
  });

  it("freezes revealVoteAuthorship per round: turning it on after opening leaves the snapshot's false (R-1)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const moderator = await createTestModerator(hh, "Resident1");
    const modActor = { accountId: moderator.accountId, profileId: moderator.profileId };
    const room = await createRoom(hh.context, "Room A", actor);
    const round = await createRound(moderator.context, "First", [room.id], modActor);
    await openRound(moderator.context, round.id, modActor);
    expect(await snapshotOf(hh, round.id)).toMatchObject({ revealVoteAuthorship: false });
    await updateHouseholdSettings(hh.context, { revealVoteAuthorship: true }, actor);
    expect(await snapshotOf(hh, round.id)).toMatchObject({ revealVoteAuthorship: false });
  });

  it("still accepts a change when no round is open (AC-1.15)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    await expect(updateHouseholdSettings(hh.context, { quorumShare: "0.6" }, actor)).resolves.toMatchObject({
      quorumShare: "0.6",
    });
  });

  // FR-1.8/G-C (Convergence, found via manual UI testing): a plain resident with no granted
  // permissions must not be able to change household settings at all.
  it("refuses a plain resident with no manage_voting_procedure permission", async () => {
    hh = await registerTestHousehold();
    const resident = await claim(hh, "Resident1");
    accountIds.push(resident.accountId);
    const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
    // PR #19 review: authorization derives from the authenticated session — the resident's OWN
    // SessionContext, not hh.context (the admin's) paired with the resident's accountId, which
    // would now be refused as a spoofed session rather than for lacking manage_voting_procedure.
    const residentContext = {
      accountId: resident.accountId,
      householdId: hh.householdId,
      profileId: resident.profileId,
    };

    const outcome = await updateHouseholdSettings(residentContext, { quorumShare: "0.6" }, residentActor).then(
      () => null,
      (err: unknown) => err,
    );
    expect(outcome).toBeInstanceOf(PermissionDeniedError);
    expect((outcome as Error).message).toBe("Missing permission: manage_voting_procedure");
    expect((await getHouseholdSettings(hh.context))?.quorumShare).toBe("0.5");
  });
});
