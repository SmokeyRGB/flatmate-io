import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { claimResidentProfile, joinHousehold } from "@/modules/identity/auth";
import {
  createRoom,
  createRound,
  openRound,
  removeRoom,
  RoomInUseByOpenRoundError,
  RoundOpenPreconditionError,
  transitionRoomStatus,
  updateHouseholdSettings,
} from "@/modules/casting/repository";
import { castingRound, room, roundParticipation } from "@/modules/casting/schema";
import { castVote } from "@/modules/deliberation/repository";
import {
  createResidentProfile,
  getHouseholdSettings,
  issueJoinCode,
  PermissionDeniedError,
  reactivateMember,
  setMemberRole,
  setMovedOut,
} from "@/modules/identity/repository";
import { householdSettings, membership } from "@/modules/identity/schema";
import {
  cleanupAll,
  createTestModerator,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";
import { insertApplicationAt } from "../../helpers/pipeline";
import { readVotes } from "../../helpers/votes";

// The tx type withSessionContext's callback receives.
type Tx = Parameters<Parameters<typeof withSessionContext>[1]>[0];

type Hold = {
  applied: Promise<void>;
  release: () => void;
  done: Promise<void>;
};

// Stand-in transaction: run `fn`, then hold the transaction open until `release`.
// Shape from revoked-membership-sign-in.test.ts. `untilHeld` also rejects if the
// stand-in fails before it has taken its lock (a CHECK refusal must surface, not hang).
function holdOpen(context: SessionContext, fn: (tx: Tx) => Promise<void>): Hold {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markApplied = () => {};
  const applied = new Promise<void>((resolve) => {
    markApplied = resolve;
  });
  const done = withSessionContext(context, async (tx) => {
    await fn(tx);
    markApplied();
    await gate;
  });
  return { applied, release, done };
}

async function untilHeld(hold: Hold): Promise<void> {
  await Promise.race([
    hold.applied,
    hold.done.then(
      () => {
        throw new Error("stand-in finished before its lock was held");
      },
      (err: unknown) => Promise.reject(err),
    ),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let hh: TestHousehold | undefined;
let joinerAccountId: string | undefined;
const extraAccountIds: string[] = [];

afterEach(async () => {
  const joiner = joinerAccountId;
  const extras = extraAccountIds.splice(0);
  await cleanupAll(
    joiner ? deleteTestAccount(joiner) : undefined,
    ...extras.map((accountId) => deleteTestAccount(accountId)),
    hh?.cleanup(),
  );
  joinerAccountId = undefined;
  hh = undefined;
});

async function draftRound() {
  const household = await registerTestHousehold();
  hh = household;
  const actor = { accountId: household.accountId, profileId: null as string | null };
  const moderator = await createTestModerator(household, "Resident1");
  const modActor = { accountId: moderator.accountId, profileId: moderator.profileId };
  const roomRow = await createRoom(household.context, "Room A", actor);
  const round = await createRound(moderator.context, "Round", [roomRow.id], modActor);
  return { household, actor, moderator, modActor, roomRow, round };
}

// Claimed, then moved out, before any round is open. Not eligible for the opening snapshot.
async function claimedThenMovedOut(
  household: TestHousehold,
  actor: { accountId: string; profileId: string | null },
) {
  const profile = await createResidentProfile(
    household.context,
    `Moved ${randomUUID().slice(0, 8)}`,
    actor,
  );
  const { accountId } = await claimResidentProfile(
    household.context,
    profile.id,
    "test-password-not-real-1234", "de",
  );
  extraAccountIds.push(accountId);
  await setMovedOut(household.context, household.accountId, accountId);
  return { profileId: profile.id, accountId };
}

function liveRowsFor(household: TestHousehold, roundId: string, profileId: string) {
  return withSessionContext(household.context, (tx) =>
    tx
      .select()
      .from(roundParticipation)
      .where(
        and(
          eq(roundParticipation.roundId, roundId),
          eq(roundParticipation.residentProfileId, profileId),
          isNull(roundParticipation.removedAt),
        ),
      ),
  );
}

function participantAddedFor(household: TestHousehold, profileId: string) {
  return withSessionContext(household.context, (tx) =>
    tx
      .select()
      .from(activityEvent)
      .where(
        and(
          eq(activityEvent.eventType, "casting_round.participant_added"),
          eq(activityEvent.actorProfileId, profileId),
        ),
      ),
  );
}

describe("Casting lock order", () => {
  it("a settings change with no open round still succeeds and an open round with no concurrent change still snapshots the live values", async () => {
    const { household, actor, moderator, modActor, round } = await draftRound();

    await expect(
      updateHouseholdSettings(household.context, { quorumShare: "0.6" }, actor),
    ).resolves.toMatchObject({ quorumShare: "0.6" });

    const opened = await openRound(moderator.context, round.id, modActor);
    expect(opened.status).toBe("open");
    expect((opened.settingsSnapshot as { quorumShare: string }).quorumShare).toBe("0.6");
    const live = await getHouseholdSettings(household.context);
    expect(live?.quorumShare).toBe("0.6");
  });

  // Finding #3, opener side. The stand-in is a settings writer that already passed its
  // open-round check and holds the settings row uncommitted.
  it("C1: openRound waits for an in-flight settings change and snapshots that value", async () => {
    const { household, moderator, modActor, round } = await draftRound();
    const hold = holdOpen(household.context, async (tx) => {
      await tx
        .update(householdSettings)
        .set({ quorumShare: "0.9" })
        .where(eq(householdSettings.householdId, household.householdId));
    });
    await untilHeld(hold);

    let settled = false;
    const real = openRound(moderator.context, round.id, modActor).finally(() => {
      settled = true;
    });
    await sleep(1500);
    const settledBeforeRelease = settled;
    hold.release();
    await hold.done;
    const opened = await real;

    expect(opened.status).toBe("open");
    expect((opened.settingsSnapshot as { quorumShare: string }).quorumShare).toBe("0.9");
    const live = await getHouseholdSettings(household.context);
    expect(live?.quorumShare).toBe((opened.settingsSnapshot as { quorumShare: string }).quorumShare);
    expect(settledBeforeRelease).toBe(false);
  });

  // Finding #3, writer side. The stand-in models openRoundTx: settings FOR SHARE, then the
  // round status written to open, uncommitted.
  // FR-1.21 relaxed (human decision 2026-10-05): the writer is no longer refused. It still has to
  // wait for the opener, and then applies to the settings row only.
  it("C2: a settings change waits for an in-flight opener and then succeeds", async () => {
    const { household, actor, round } = await draftRound();
    const hold = holdOpen(household.context, async (tx) => {
      await tx
        .select()
        .from(householdSettings)
        .where(eq(householdSettings.householdId, household.householdId))
        .for("share");
      await tx
        .update(castingRound)
        .set({ status: "open", openedAt: sql`now()` })
        .where(eq(castingRound.id, round.id));
    });
    await untilHeld(hold);

    let settled = false;
    const real = updateHouseholdSettings(household.context, { quorumShare: "0.7" }, actor).finally(
      () => {
        settled = true;
      },
    );
    await sleep(1500);
    const settledBeforeRelease = settled;
    hold.release();
    await hold.done;

    const outcome = await real.then(
      (value) => ({ ok: true as const, value }),
      (err: unknown) => ({ ok: false as const, err }),
    );
    const result = outcome.ok ? outcome.value : outcome.err;
    expect(outcome.ok).toBe(true);
    expect(result).toMatchObject({ quorumShare: "0.7" });
    const live = await getHouseholdSettings(household.context);
    expect(live?.quorumShare).toBe("0.7");
    expect(settledBeforeRelease).toBe(false);
  });

  // Finding #4, direction 1. The stand-in holds the room FOR SHARE and has marked the round
  // open, uncommitted.
  it("C3: removeRoom waits for an in-flight opener and is refused", async () => {
    const { household, actor, roomRow, round } = await draftRound();
    await transitionRoomStatus(household.context, roomRow.id, "open", actor);
    const hold = holdOpen(household.context, async (tx) => {
      await tx.select({ id: room.id }).from(room).where(eq(room.id, roomRow.id)).for("share");
      await tx
        .update(castingRound)
        .set({ status: "open", openedAt: sql`now()` })
        .where(eq(castingRound.id, round.id));
    });
    await untilHeld(hold);

    let settled = false;
    const real = removeRoom(household.context, roomRow.id, actor).finally(() => {
      settled = true;
    });
    await sleep(1500);
    const settledBeforeRelease = settled;
    hold.release();
    await hold.done;

    const outcome = await real.then(
      (value) => ({ ok: true as const, value }),
      (err: unknown) => ({ ok: false as const, err }),
    );
    const result = outcome.ok ? outcome.value : outcome.err;
    expect(result).toBeInstanceOf(RoomInUseByOpenRoundError);
    const [roomAfter] = await withSessionContext(household.context, (tx) =>
      tx.select().from(room).where(eq(room.id, roomRow.id)),
    );
    expect(roomAfter?.deletedAt).toBeNull();
    const removedEvents = await withSessionContext(household.context, (tx) =>
      tx
        .select()
        .from(activityEvent)
        .where(and(eq(activityEvent.eventType, "room.removed"), eq(activityEvent.subjectId, roomRow.id))),
    );
    expect(removedEvents).toHaveLength(0);
    expect(settledBeforeRelease).toBe(false);
  });

  // Finding #4, direction 2. The stand-in has removed the only covered room, uncommitted.
  it("C4: openRound waits for an in-flight room removal and refuses with rooms_unavailable", async () => {
    const { household, actor, moderator, modActor, roomRow, round } = await draftRound();
    await transitionRoomStatus(household.context, roomRow.id, "open", actor);
    const hold = holdOpen(household.context, async (tx) => {
      await tx.update(room).set({ deletedAt: sql`now()` }).where(eq(room.id, roomRow.id));
    });
    await untilHeld(hold);

    let settled = false;
    const real = openRound(moderator.context, round.id, modActor).finally(() => {
      settled = true;
    });
    await sleep(1500);
    const settledBeforeRelease = settled;
    hold.release();
    await hold.done;

    const outcome = await real.then(
      (value) => ({ ok: true as const, value }),
      (err: unknown) => ({ ok: false as const, err }),
    );
    const result = outcome.ok ? outcome.value : outcome.err;
    expect(result).toBeInstanceOf(RoundOpenPreconditionError);
    expect((result as RoundOpenPreconditionError).code).toBe("rooms_unavailable");
    const [roundAfter] = await withSessionContext(household.context, (tx) =>
      tx.select().from(castingRound).where(eq(castingRound.id, round.id)),
    );
    expect(roundAfter?.status).toBe("draft");
    const participants = await withSessionContext(household.context, (tx) =>
      tx.select().from(roundParticipation).where(eq(roundParticipation.roundId, round.id)),
    );
    expect(participants).toHaveLength(0);
    expect(settledBeforeRelease).toBe(false);
  });

  // Permission moves into the write transaction. The stand-in revokes the household admin
  // uncommitted. membership_revoked_holds_nothing (drizzle/0024) allows revoked_at set together
  // with an empty permission list when the role is not moderator.
  it("C5: the settings writer sees a revocation that commits inside its write transaction", async () => {
    const household = await registerTestHousehold();
    hh = household;
    const actor = { accountId: household.accountId, profileId: null };
    const hold = holdOpen(household.context, async (tx) => {
      await tx
        .update(membership)
        .set({ revokedAt: sql`now()`, permissions: sql`'{}'::text[]` })
        .where(eq(membership.accountId, household.accountId));
    });
    await untilHeld(hold);

    let settled = false;
    const real = updateHouseholdSettings(household.context, { quorumShare: "0.6" }, actor).finally(
      () => {
        settled = true;
      },
    );
    await sleep(1500);
    const settledBeforeRelease = settled;
    hold.release();
    await hold.done;

    const outcome = await real.then(
      (value) => ({ ok: true as const, value }),
      (err: unknown) => ({ ok: false as const, err }),
    );
    const result = outcome.ok ? outcome.value : outcome.err;
    expect(result).toBeInstanceOf(PermissionDeniedError);
    const [live] = await withSessionContext(household.context, (tx) =>
      tx.select().from(householdSettings).where(eq(householdSettings.householdId, household.householdId)),
    );
    expect(live?.quorumShare).toBe("0.5");
    expect(settledBeforeRelease).toBe(false);
  });

  // Same window for openRound: a moderator demotion that commits inside the write transaction.
  it("C6: openRound sees a moderator demotion that commits inside its write transaction", async () => {
    const { household, moderator, modActor, round } = await draftRound();
    const hold = holdOpen(household.context, async (tx) => {
      await tx
        .update(membership)
        .set({ role: "member", permissions: sql`'{}'::text[]` })
        .where(eq(membership.accountId, moderator.accountId));
    });
    await untilHeld(hold);

    let settled = false;
    const real = openRound(moderator.context, round.id, modActor).finally(() => {
      settled = true;
    });
    await sleep(1500);
    const settledBeforeRelease = settled;
    hold.release();
    await hold.done;

    const outcome = await real.then(
      (value) => ({ ok: true as const, value }),
      (err: unknown) => ({ ok: false as const, err }),
    );
    const result = outcome.ok ? outcome.value : outcome.err;
    expect(result).toBeInstanceOf(PermissionDeniedError);
    const [roundAfter] = await withSessionContext(household.context, (tx) =>
      tx.select().from(castingRound).where(eq(castingRound.id, round.id)),
    );
    expect(roundAfter?.status).toBe("draft");
    const participants = await withSessionContext(household.context, (tx) =>
      tx.select().from(roundParticipation).where(eq(roundParticipation.roundId, round.id)),
    );
    expect(participants).toHaveLength(0);
    expect(settledBeforeRelease).toBe(false);
  });

  // invariant guard; the pooler may serialise this by accident (CLAUDE.md hazards), C1-C4 are the regression tests.
  // Either order is legitimate now that an open round no longer blocks a settings change: the
  // snapshot is the whole old value (opener first) or the whole new one (writer first), the round
  // opens either way, and the live value ends at the new one.
  it("C7: an opener and a settings writer both succeed and the snapshot is one whole settings state", async () => {
    const { household, actor, moderator, modActor, round } = await draftRound();
    const [opened, settingsWrite] = await Promise.allSettled([
      openRound(moderator.context, round.id, modActor),
      updateHouseholdSettings(household.context, { quorumShare: "0.7" }, actor),
    ]);

    expect(opened.status).toBe("fulfilled");
    expect(settingsWrite.status).toBe("fulfilled");
    const [roundAfter] = await withSessionContext(household.context, (tx) =>
      tx.select().from(castingRound).where(eq(castingRound.id, round.id)),
    );
    const live = await getHouseholdSettings(household.context);
    const snapshotShare = (roundAfter?.settingsSnapshot as { quorumShare?: string } | null)?.quorumShare;
    expect(roundAfter?.status).toBe("open");
    expect(live?.quorumShare).toBe("0.7");
    expect(["0.5", "0.7"]).toContain(snapshotShare);
  });

  // The stand-in is openRoundTx after its unlocked eligibility read: settings FOR SHARE,
  // the round FOR UPDATE, status written to open, and the existing resident already
  // snapshotted — none of it committed. joinHousehold's membership INSERT fires
  // auto_join_open_rounds. The trigger has to wait on that round lock; releasing at a
  // fixed 1500ms is too early, because the join talks to the auth provider before the
  // insert. Poll until the join settles or 20s passes (dev statement_timeout is 120s).
  it(
    "a late joiner waits for an opening round and is added with source joined_after_open",
    async () => {
      const { household, moderator, round } = await draftRound();
      const link = await issueJoinCode(household.context, household.accountId, { validDays: 7, maxUses: 1 });
      const hold = holdOpen(household.context, async (tx) => {
        await tx
          .select()
          .from(householdSettings)
          .where(eq(householdSettings.householdId, household.householdId))
          .for("share");
        await tx.select().from(castingRound).where(eq(castingRound.id, round.id)).for("update");
        await tx
          .update(castingRound)
          .set({ status: "open", openedAt: sql`now()` })
          .where(eq(castingRound.id, round.id));
        await tx.insert(roundParticipation).values({
          roundId: round.id,
          householdId: household.householdId,
          residentProfileId: moderator.profileId,
          source: "snapshot_at_open",
          canVote: true,
        });
      });
      await untilHeld(hold);

      let settled = false;
      const real = joinHousehold(link.code, {
        displayName: `Late ${randomUUID().slice(0, 8)}`,
        password: "test-password-not-real-1234",
      }, "de").finally(() => {
        settled = true;
      });
      const deadline = Date.now() + 20_000;
      while (!settled && Date.now() < deadline) {
        await sleep(250);
      }
      const settledBeforeRelease = settled;
      hold.release();
      await hold.done;
      const result = await real;
      joinerAccountId = result.context.accountId;
      const joinerProfileId = result.context.profileId;
      expect(typeof joinerProfileId).toBe("string");
      if (typeof joinerProfileId !== "string") return;

      const [roundAfter] = await withSessionContext(household.context, (tx) =>
        tx.select().from(castingRound).where(eq(castingRound.id, round.id)),
      );
      const joinerRows = await withSessionContext(household.context, (tx) =>
        tx
          .select()
          .from(roundParticipation)
          .where(
            and(
              eq(roundParticipation.roundId, round.id),
              eq(roundParticipation.residentProfileId, joinerProfileId),
              isNull(roundParticipation.removedAt),
            ),
          ),
      );

      expect(
        settledBeforeRelease,
        `joinerLiveRows=${joinerRows.length} roundStatus=${roundAfter?.status ?? "missing"}`,
      ).toBe(false);
      expect(roundAfter?.status).toBe("open");
      expect(joinerRows).toHaveLength(1);
      expect(joinerRows[0]?.source).toBe("joined_after_open");
      expect(joinerRows[0]?.canVote).toBe(true);
    },
    90_000,
  );

  // Moved out before the round opens, so the snapshot does not include them. reactivateMember
  // is an UPDATE of revoked_at. The applied trigger is still AFTER INSERT only.
  it("a reactivated resident joins an already open round as joined_after_open", async () => {
    const { household, actor, moderator, modActor, round } = await draftRound();
    const resident = await claimedThenMovedOut(household, actor);
    await openRound(moderator.context, round.id, modActor);

    await reactivateMember(household.context, household.accountId, resident.accountId);

    const rows = await liveRowsFor(household, round.id, resident.profileId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("joined_after_open");
    expect(rows[0]?.canVote).toBe(true);
    const events = await participantAddedFor(household, resident.profileId);
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ source: "joined_after_open" });
    expect(events[0]?.subjectId).toBe(rows[0]?.id);
  });

  // Same stand-in as the late joiner: openRoundTx after its eligibility read, uncommitted.
  // reactivateMember takes no auth-provider call, so 1500ms is enough to see the wait.
  it("a reactivated resident waits for an opening round and is added", async () => {
    const { household, actor, moderator, round } = await draftRound();
    const resident = await claimedThenMovedOut(household, actor);
    const hold = holdOpen(household.context, async (tx) => {
      await tx
        .select()
        .from(householdSettings)
        .where(eq(householdSettings.householdId, household.householdId))
        .for("share");
      await tx.select().from(castingRound).where(eq(castingRound.id, round.id)).for("update");
      await tx
        .update(castingRound)
        .set({ status: "open", openedAt: sql`now()` })
        .where(eq(castingRound.id, round.id));
      await tx.insert(roundParticipation).values({
        roundId: round.id,
        householdId: household.householdId,
        residentProfileId: moderator.profileId,
        source: "snapshot_at_open",
        canVote: true,
      });
    });
    await untilHeld(hold);

    let settled = false;
    const real = reactivateMember(household.context, household.accountId, resident.accountId).finally(() => {
      settled = true;
    });
    await sleep(1500);
    const settledBeforeRelease = settled;
    hold.release();
    await hold.done;
    await real;

    const [roundAfter] = await withSessionContext(household.context, (tx) =>
      tx.select().from(castingRound).where(eq(castingRound.id, round.id)),
    );
    const rows = await liveRowsFor(household, round.id, resident.profileId);
    expect(
      settledBeforeRelease,
      `reactivatedLiveRows=${rows.length} roundStatus=${roundAfter?.status ?? "missing"}`,
    ).toBe(false);
    expect(roundAfter?.status).toBe("open");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("joined_after_open");
    expect(rows[0]?.canVote).toBe(true);
  });

  // setMemberRole writes role and permissions only. The resident is already in the snapshot.
  // A trigger body without the OLD/NEW test cannot be shown red here without applying SQL:
  // this UPDATE does not mention is_resident, resident_profile_id, or revoked_at, and a join
  // loop that did run would hit ON CONFLICT DO NOTHING on the existing live row.
  it("an unrelated role change of a live resident does not add a second participation", async () => {
    const { household, actor, moderator, modActor, round } = await draftRound();
    const profile = await createResidentProfile(
      household.context,
      `Role ${randomUUID().slice(0, 8)}`,
      actor,
    );
    const { accountId } = await claimResidentProfile(
      household.context,
      profile.id,
      "test-password-not-real-1234", "de",
    );
    extraAccountIds.push(accountId);
    await openRound(moderator.context, round.id, modActor);

    const before = await liveRowsFor(household, round.id, profile.id);
    const eventsBefore = await participantAddedFor(household, profile.id);
    await setMemberRole(household.context, household.accountId, accountId, "moderator");
    const after = await liveRowsFor(household, round.id, profile.id);
    const eventsAfter = await participantAddedFor(household, profile.id);

    expect(before).toHaveLength(1);
    expect(before[0]?.source).toBe("snapshot_at_open");
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(before[0]?.id);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
    expect(eventsAfter).toHaveLength(0);
  });

  // Members UI "moved out" is setMovedOutAction, which calls setMovedOut. removeMember is final
  // and cannot be reactivated. Move-out does not write round_participation.removed_at (human
  // decision 2026-09-22, comment above getRoundParticipants). Reactivation's INSERT then hits
  // ON CONFLICT DO NOTHING on the live snapshot row, so the participation is not replaced.
  it("a mistaken move-out and reactivation keeps the snapshot participation", async () => {
    const { household, actor, moderator, modActor, round } = await draftRound();
    const profile = await createResidentProfile(
      household.context,
      `Keep ${randomUUID().slice(0, 8)}`,
      actor,
    );
    const { accountId } = await claimResidentProfile(
      household.context,
      profile.id,
      "test-password-not-real-1234", "de",
    );
    extraAccountIds.push(accountId);
    await openRound(moderator.context, round.id, modActor);

    const before = await liveRowsFor(household, round.id, profile.id);
    expect(before).toHaveLength(1);
    expect(before[0]?.source).toBe("snapshot_at_open");
    const participationId = before[0]?.id;
    const canVoteBefore = before[0]?.canVote;

    const application = await insertApplicationAt(
      { hh: household, moderator, roundId: round.id },
      "new",
    );
    const residentContext = {
      accountId,
      householdId: household.householdId,
      profileId: profile.id,
    };
    await castVote(residentContext, {
      roundId: round.id,
      applicationId: application.id,
      value: "good",
    });
    const votesBefore = await readVotes(residentContext, application.id);
    expect(votesBefore).toHaveLength(1);

    await setMovedOut(household.context, household.accountId, accountId);
    await reactivateMember(household.context, household.accountId, accountId);

    const after = await liveRowsFor(household, round.id, profile.id);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(participationId);
    expect(after[0]?.source).toBe("snapshot_at_open");
    expect(after[0]?.canVote).toBe(canVoteBefore);
    expect(after[0]?.removedAt).toBeNull();
    const events = await participantAddedFor(household, profile.id);
    expect(events).toHaveLength(0);

    const votesAfter = await readVotes(residentContext, application.id);
    expect(votesAfter).toHaveLength(1);
    expect(votesAfter[0]?.id).toBe(votesBefore[0]?.id);
    expect(votesAfter[0]?.value).toBe("good");
    expect(votesAfter[0]?.withdrawnAt).toBeNull();
    expect(votesAfter[0]?.createdAt.getTime()).toBe(votesBefore[0]?.createdAt.getTime());
    expect(votesAfter[0]?.updatedAt.getTime()).toBe(votesBefore[0]?.updatedAt.getTime());
  });
});
