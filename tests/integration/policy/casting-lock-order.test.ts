import { and, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import {
  createRoom,
  createRound,
  openRound,
  ProcedureLockedError,
  removeRoom,
  RoomInUseByOpenRoundError,
  RoundOpenPreconditionError,
  transitionRoomStatus,
  updateHouseholdSettingsWithProcedureLock,
} from "@/modules/casting/repository";
import { castingRound, room, roundParticipation } from "@/modules/casting/schema";
import { getHouseholdSettings, PermissionDeniedError } from "@/modules/identity/repository";
import { householdSettings, membership } from "@/modules/identity/schema";
import { createTestModerator, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

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

afterEach(async () => {
  await hh?.cleanup();
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

describe("Casting lock order", () => {
  it("a settings change with no open round still succeeds and an open round with no concurrent change still snapshots the live values", async () => {
    const { household, actor, moderator, modActor, round } = await draftRound();

    await expect(
      updateHouseholdSettingsWithProcedureLock(household.context, { quorumShare: "0.6" }, actor),
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
  it("C2: a settings change waits for an in-flight opener and is refused", async () => {
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
    const real = updateHouseholdSettingsWithProcedureLock(household.context, { quorumShare: "0.7" }, actor).finally(
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
    expect(result).toBeInstanceOf(ProcedureLockedError);
    expect(result).toMatchObject({ openRoundId: round.id });
    const live = await getHouseholdSettings(household.context);
    expect(live?.quorumShare).toBe("0.5");
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
    const real = updateHouseholdSettingsWithProcedureLock(household.context, { quorumShare: "0.6" }, actor).finally(
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
  it("C7: an opener and a settings writer cannot leave a snapshot that differs from live settings", async () => {
    const { household, actor, moderator, modActor, round } = await draftRound();
    const [opened, settingsWrite] = await Promise.allSettled([
      openRound(moderator.context, round.id, modActor),
      updateHouseholdSettingsWithProcedureLock(household.context, { quorumShare: "0.7" }, actor),
    ]);

    const [roundAfter] = await withSessionContext(household.context, (tx) =>
      tx.select().from(castingRound).where(eq(castingRound.id, round.id)),
    );
    const live = await getHouseholdSettings(household.context);
    const snapshotShare = (roundAfter?.settingsSnapshot as { quorumShare?: string } | null)?.quorumShare;
    const writerRejected =
      settingsWrite.status === "rejected" &&
      settingsWrite.reason instanceof ProcedureLockedError &&
      settingsWrite.reason.openRoundId === round.id;
    const openerWon = roundAfter?.status === "open" && writerRejected && snapshotShare === live?.quorumShare;
    const writerWon = settingsWrite.status === "fulfilled" && snapshotShare === live?.quorumShare;
    if (!(openerWon || writerWon)) {
      const openerDetail = opened.status === "rejected" ? String(opened.reason) : opened.status;
      const writerDetail =
        settingsWrite.status === "rejected" ? String(settingsWrite.reason) : settingsWrite.status;
      expect.fail(
        `invariant broken: opener ${openerDetail}; writer ${writerDetail}; snapshot ${snapshotShare}; live ${live?.quorumShare}`,
      );
    }
    expect(openerWon || writerWon).toBe(true);
  });
});
