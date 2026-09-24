import { afterEach, describe, expect, it } from "vitest";
import type { SessionContext } from "@/db/session-context";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { createRoom, createRound, getStartOverview, openRound, transitionApplication } from "@/modules/casting/repository";
import { application, roundParticipation } from "@/modules/casting/schema";
import type { ApplicationState } from "@/modules/casting/transitions";
import { eq } from "drizzle-orm";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

async function claim(household: TestHousehold, name: string): Promise<{
  profileId: string;
  accountId: string;
  context: SessionContext;
}> {
  const actor = { accountId: household.accountId, profileId: null };
  const profile = await createResidentProfile(household.context, name, actor);
  const { accountId } = await claimResidentProfile(household.context, profile.id, "test-password-not-real-1234");
  accountIds.push(accountId);
  return {
    profileId: profile.id,
    accountId,
    context: { accountId, householdId: household.householdId, profileId: profile.id },
  };
}

// tasks.md 3.5: applications are inserted with a RESIDENT's own session context (profileId set),
// never the household account's — a parallel session may add a restrictive RLS policy on
// `application` refusing profile-less writes, and these tests must pass under either policy.
async function insertApplication(
  household: TestHousehold,
  writer: SessionContext,
  fields: { roundId: string; state: ApplicationState; becameResidentId?: string | null; deletedAt?: Date | null },
) {
  const [row] = await withSessionContext(writer, (tx) =>
    tx
      .insert(application)
      .values({
        householdId: household.householdId,
        roundId: fields.roundId,
        state: fields.state,
        becameResidentId: fields.becameResidentId ?? null,
        createdByAccountId: writer.accountId,
        createdByProfileId: writer.profileId as string,
        deletedAt: fields.deletedAt ?? null,
      })
      .returning(),
  );
  return row;
}

async function setCanVote(household: TestHousehold, roundId: string, residentProfileId: string, canVote: boolean) {
  await withSessionContext(household.context, (tx) =>
    tx
      .update(roundParticipation)
      .set({ canVote })
      .where(eq(roundParticipation.roundId, roundId)),
  );
}

async function setRemoved(household: TestHousehold, residentProfileId: string) {
  await withSessionContext(household.context, (tx) =>
    tx
      .update(roundParticipation)
      .set({ removedAt: new Date() })
      .where(eq(roundParticipation.residentProfileId, residentProfileId)),
  );
}

describe("getStartOverview (start-screen design.md Decision 4)", () => {
  it("(b) counts new+screened as T-5, excludes invited/rejected", async () => {
    hh = await registerTestHousehold();
    const founder = await claim(hh, "Founder");
    const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
    const round = await createRound(hh.context, "Round", [room.id], { accountId: hh.accountId, profileId: null });
    await openRound(hh.context, round.id, { accountId: hh.accountId, profileId: null });

    await insertApplication(hh, founder.context, { roundId: round.id, state: "new" });
    await insertApplication(hh, founder.context, { roundId: round.id, state: "new" });
    await insertApplication(hh, founder.context, { roundId: round.id, state: "screened" });
    await insertApplication(hh, founder.context, { roundId: round.id, state: "invited" });
    await insertApplication(hh, founder.context, { roundId: round.id, state: "rejected_by_household" });

    const overview = await getStartOverview(founder.context);
    expect(overview?.openRounds).toHaveLength(1);
    expect(overview?.openRounds[0].canVote).toBe(true);
    expect(overview?.openRounds[0].voteCount).toBe(3);
  });

  it("(c) can_vote = false: no T-5 count, but standing is still returned", async () => {
    hh = await registerTestHousehold();
    const founder = await claim(hh, "Founder");
    const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
    const round = await createRound(hh.context, "Round", [room.id], { accountId: hh.accountId, profileId: null });
    await openRound(hh.context, round.id, { accountId: hh.accountId, profileId: null });
    await setCanVote(hh, round.id, founder.profileId, false);

    await insertApplication(hh, founder.context, { roundId: round.id, state: "new" });

    const overview = await getStartOverview(founder.context);
    expect(overview?.openRounds).toHaveLength(1);
    expect(overview?.openRounds[0].canVote).toBe(false);
    expect(overview?.openRounds[0].voteCount).toBe(0);
    expect(overview?.standing).not.toBeNull();
    expect(overview?.standing?.stateCounts.new).toBe(1);
  });

  it("(d) removed_at set: the viewer is not offered the round's T-5", async () => {
    hh = await registerTestHousehold();
    const founder = await claim(hh, "Founder");
    const second = await claim(hh, "Second");
    const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
    const round = await createRound(hh.context, "Round", [room.id], { accountId: hh.accountId, profileId: null });
    await openRound(hh.context, round.id, { accountId: hh.accountId, profileId: null });
    await setRemoved(hh, second.profileId);

    const overview = await getStartOverview(second.context);
    expect(overview?.openRounds).toHaveLength(0);
    // Founder (not removed) is unaffected.
    const founderOverview = await getStartOverview(founder.context);
    expect(founderOverview?.openRounds).toHaveLength(1);
  });

  it("(e) a resident who joined the open round after it opened is offered its T-5", async () => {
    hh = await registerTestHousehold();
    await claim(hh, "Founder"); // eligible resident, needed for openRound's EC-1.4 precondition
    const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
    const round = await createRound(hh.context, "Round", [room.id], { accountId: hh.accountId, profileId: null });
    await openRound(hh.context, round.id, { accountId: hh.accountId, profileId: null });

    // Joins AFTER the round is already open — the auto-join trigger (drizzle/0010), same path as
    // join-open-round.test.ts, fires on this claim's own membership insert.
    const late = await claim(hh, "LateJoiner");

    const overview = await getStartOverview(late.context);
    expect(overview?.openRounds).toHaveLength(1);
    expect(overview?.openRounds[0].roundId).toBe(round.id);
  });

  it("(f) V-1: a moved-in application naming the viewer is excluded from their own counts, present in another's", async () => {
    hh = await registerTestHousehold();
    const founder = await claim(hh, "Founder");
    const newFlatmate = await claim(hh, "NewFlatmate");
    const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
    const round = await createRound(hh.context, "Round", [room.id], { accountId: hh.accountId, profileId: null });
    await openRound(hh.context, round.id, { accountId: hh.accountId, profileId: null });

    await insertApplication(hh, founder.context, {
      roundId: round.id,
      state: "moved_in",
      becameResidentId: newFlatmate.profileId,
    });

    const ownOverview = await getStartOverview(newFlatmate.context);
    expect(ownOverview?.standing?.stateCounts.moved_in ?? 0).toBe(0);

    const foundersOverview = await getStartOverview(founder.context);
    expect(foundersOverview?.standing?.stateCounts.moved_in).toBe(1);
  });

  it("(f2) a moved_in application with became_resident_id NULL is counted (the NULL trap)", async () => {
    hh = await registerTestHousehold();
    const founder = await claim(hh, "Founder");
    const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
    const round = await createRound(hh.context, "Round", [room.id], { accountId: hh.accountId, profileId: null });
    await openRound(hh.context, round.id, { accountId: hh.accountId, profileId: null });

    await insertApplication(hh, founder.context, { roundId: round.id, state: "moved_in", becameResidentId: null });

    const overview = await getStartOverview(founder.context);
    expect(overview?.standing?.stateCounts.moved_in).toBe(1);
  });

  // PR #22 review (Copilot, confirmed): the T-5 count lacked the V-1 predicate on the claim that
  // `new`/`screened` never carry became_resident_id. False: the declared backward path
  // moved_in -> offer_made -> interviewed -> scheduled -> invited -> screened is ordinary app code
  // (P-4), and G-D9 guarantees became_resident_id survives it. 03-PRD.md §4.1.2 has the criterion
  // outright: an Application with became_resident_id == the active profile creates no vote task.
  it("(f5) the viewer's own application walked back to screened creates no vote task for them", async () => {
    hh = await registerTestHousehold();
    const founder = await claim(hh, "Founder");
    const other = await claim(hh, "Other");
    const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
    const round = await createRound(hh.context, "Round", [room.id], { accountId: hh.accountId, profileId: null });
    await openRound(hh.context, round.id, { accountId: hh.accountId, profileId: null });

    const own = await insertApplication(hh, other.context, {
      roundId: round.id,
      state: "moved_in",
      becameResidentId: founder.profileId,
    });
    const actor = { accountId: other.accountId, profileId: other.profileId };
    for (const to of ["offer_made", "interviewed", "scheduled", "invited", "screened"] as const) {
      await transitionApplication(other.context, own.id, to, actor);
    }
    await insertApplication(hh, other.context, { roundId: round.id, state: "new" });

    const founderView = await getStartOverview(founder.context);
    expect(founderView?.openRounds[0].voteCount).toBe(1);
    const otherView = await getStartOverview(other.context);
    expect(otherView?.openRounds[0].voteCount).toBe(2);
  });

  it("(f3) a removed participation while a round is open: anyOpenRound true, no state counts", async () => {
    hh = await registerTestHousehold();
    await claim(hh, "Founder"); // eligible resident, needed for openRound's EC-1.4 precondition
    const second = await claim(hh, "Second");
    const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
    const round = await createRound(hh.context, "Round", [room.id], { accountId: hh.accountId, profileId: null });
    await openRound(hh.context, round.id, { accountId: hh.accountId, profileId: null });
    await setRemoved(hh, second.profileId);

    const overview = await getStartOverview(second.context);
    expect(overview?.anyOpenRound).toBe(true);
    expect(overview?.openRounds).toHaveLength(0);
    expect(overview?.standing).toBeNull();
  });

  it("(g) a deleted application is absent from every count", async () => {
    hh = await registerTestHousehold();
    const founder = await claim(hh, "Founder");
    const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
    const round = await createRound(hh.context, "Round", [room.id], { accountId: hh.accountId, profileId: null });
    await openRound(hh.context, round.id, { accountId: hh.accountId, profileId: null });

    await insertApplication(hh, founder.context, { roundId: round.id, state: "new" });
    await insertApplication(hh, founder.context, { roundId: round.id, state: "new", deletedAt: new Date() });

    const overview = await getStartOverview(founder.context);
    expect(overview?.openRounds[0].voteCount).toBe(1);
    expect(overview?.standing?.stateCounts.new).toBe(1);
  });

  it("(h) a phase_deadline_at set on the round is returned", async () => {
    hh = await registerTestHousehold();
    const founder = await claim(hh, "Founder");
    const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
    const round = await createRound(hh.context, "Round", [room.id], { accountId: hh.accountId, profileId: null });
    await openRound(hh.context, round.id, { accountId: hh.accountId, profileId: null });

    const deadline = new Date("2026-11-01T00:00:00Z");
    await withSessionContext(hh.context, (tx) =>
      tx.execute(
        `UPDATE casting_round SET phase_deadline_at = '${deadline.toISOString()}' WHERE id = '${round.id}'::uuid`,
      ),
    );

    const overview = await getStartOverview(founder.context);
    expect(overview?.openRounds[0].phaseDeadlineAt?.toISOString()).toBe(deadline.toISOString());
  });

  // Review finding (planning session, 2026-09-24): the standing was taken from the household's most
  // recent open round regardless of the viewer's participation, so a viewer taking part only in an
  // OLDER open round got no standing — and B1 then told them the round runs without them, which is
  // false. The standing must come from the most recent open round the viewer takes part in.
  it("(f4) viewer only in an older open round: standing is that round's, not null", async () => {
    hh = await registerTestHousehold();
    const founder = await claim(hh, "Founder");
    const actor = { accountId: hh.accountId, profileId: null };
    const roomA = await createRoom(hh.context, "Room A", actor);
    const roomB = await createRoom(hh.context, "Room B", actor);
    const older = await createRound(hh.context, "Older", [roomA.id], actor);
    await openRound(hh.context, older.id, actor);
    const newer = await createRound(hh.context, "Newer", [roomB.id], actor);
    await openRound(hh.context, newer.id, actor);
    await withSessionContext(hh.context, (tx) =>
      tx
        .update(roundParticipation)
        .set({ removedAt: new Date() })
        .where(eq(roundParticipation.roundId, newer.id)),
    );
    await insertApplication(hh, founder.context, { roundId: older.id, state: "interviewed" });

    const overview = await getStartOverview(founder.context);
    expect(overview?.openRounds.map((r) => r.roundId)).toEqual([older.id]);
    expect(overview?.standing?.roundId).toBe(older.id);
    expect(overview?.standing?.stateCounts.interviewed).toBe(1);
  });

  it("(i) no open round: the open-round list is empty and nothing throws", async () => {
    hh = await registerTestHousehold();
    const founder = await claim(hh, "Founder");

    const overview = await getStartOverview(founder.context);
    expect(overview?.openRounds).toEqual([]);
    expect(overview?.anyOpenRound).toBe(false);
    expect(overview?.standing).toBeNull();
  });

  // Breaks (tasks.md 3.5), applied and reverted by hand, reported in the apply summary:
  // (d) drop the removed_at IS NULL predicate -> case (d)/(f3) fail;
  // (f) remove the became_resident_id predicate -> case (f) fails;
  // (f2) replace it with Drizzle ne() -> case (f2) fails;
  // (g) remove deleted_at IS NULL -> case (g) fails.
});

