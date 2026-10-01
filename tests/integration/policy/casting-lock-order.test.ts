import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import {
  createRoom,
  createRound,
  openRound,
  updateHouseholdSettingsWithProcedureLock,
} from "@/modules/casting/repository";
import { castingRound, roundParticipation } from "@/modules/casting/schema";
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
});
