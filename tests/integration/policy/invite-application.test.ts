import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationTransitionError, inviteApplication } from "@/modules/casting/repository";
import { application } from "@/modules/casting/schema";
import { castVote, VoteError } from "@/modules/deliberation/repository";
import { PermissionDeniedError } from "@/modules/identity/repository";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import {
  claimPlainMember,
  eventsOf,
  holdTransaction,
  insertApplicationAt,
  readApplication,
  settlesWithin,
  setupPipeline,
  type PipelineSetup,
} from "../../helpers/pipeline";
import { readVotes } from "../../helpers/votes";

// F5 `candidate-invite`, FR-5.24/FR-5.28, AC-5.10/AC-5.23, spec `casting/invitation` requirement 1
// and 2: inviteApplication takes an application from new or screened to invited in one
// transaction. Real households, a real moderator, a claimed plain resident. Every refusal asserts
// the error CLASS and CODE, and that the row and its audit trail are unchanged
// (CLAUDE.md, "Tests that can fail").
const households: TestHousehold[] = [];
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  accountIds.length = 0;
  households.length = 0;
});

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return undefined;
}

async function expectUntouched(s: PipelineSetup, before: Awaited<ReturnType<typeof readApplication>>) {
  const after = await readApplication(s, before.id);
  expect(after).toEqual(before);
  expect(await eventsOf(s, before.id)).toHaveLength(0);
}

describe("inviteApplication: the states it takes (FR-5.24)", () => {
  it("from new: invited, two chained state_changed events naming the moderator, nothing else changed", async () => {
    const s = await setupPipeline(households);
    const row = await insertApplicationAt(s, "new");

    const result = await inviteApplication(s.moderator.context, { roundId: s.roundId, applicationId: row.id });
    expect(result).toEqual({ alreadyInvited: false });

    const after = await readApplication(s, row.id);
    expect(after.state).toBe("invited");
    expect(after.stateChangedAt.getTime()).toBeGreaterThan(row.stateChangedAt.getTime());
    // Every other column is unchanged.
    expect(after).toEqual({ ...row, state: "invited", stateChangedAt: after.stateChangedAt });

    const events = await eventsOf(s, row.id, "application.state_changed");
    expect(events).toHaveLength(2);
    for (const e of events) {
      expect(e.actorAccountId).toBe(s.moderator.accountId);
      expect(e.actorProfileId).toBe(s.moderator.profileId);
    }
    // Both share the transaction time, so they are told apart by their payloads, as a chain.
    const payloads = events.map((e) => e.payload as { fromState: string; toState: string });
    expect(payloads).toEqual(
      expect.arrayContaining([
        { fromState: "new", toState: "screened" },
        { fromState: "screened", toState: "invited" },
      ]),
    );
    const first = payloads.find((p) => p.fromState === "new")!;
    const second = payloads.find((p) => p.fromState === "screened")!;
    expect(first.toState).toBe(second.fromState);
  });

  it("from a leftover screened: one event, screened -> invited", async () => {
    const s = await setupPipeline(households);
    const row = await insertApplicationAt(s, "screened");

    expect(await inviteApplication(s.moderator.context, { roundId: s.roundId, applicationId: row.id })).toEqual({
      alreadyInvited: false,
    });
    expect((await readApplication(s, row.id)).state).toBe("invited");
    const events = await eventsOf(s, row.id, "application.state_changed");
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ fromState: "screened", toState: "invited" });
  });

  it("already invited: success, no write, no event", async () => {
    const s = await setupPipeline(households);
    const row = await insertApplicationAt(s, "invited");

    const result = await inviteApplication(s.moderator.context, { roundId: s.roundId, applicationId: row.id });
    expect(result).toEqual({ alreadyInvited: true });
    await expectUntouched(s, row);
  });

  it("rejected_by_household and withdrawn are not_invitable, and nothing is written", async () => {
    const s = await setupPipeline(households);
    for (const state of ["rejected_by_household", "withdrawn"] as const) {
      const row = await insertApplicationAt(s, state);
      const err = await errorOf(inviteApplication(s.moderator.context, { roundId: s.roundId, applicationId: row.id }));
      expect(err).toBeInstanceOf(ApplicationTransitionError);
      expect((err as ApplicationTransitionError).code).toBe("not_invitable");
      await expectUntouched(s, row);
    }
  });

  // AC-5.10: the invitation reads no vote and no quorum.
  it("below quorum: with no vote, and with one vote, the invitation succeeds", async () => {
    const s = await setupPipeline(households);
    const voter = await claimPlainMember(s.hh, "Voter", accountIds);
    const unvoted = await insertApplicationAt(s, "new");
    const oneVote = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: oneVote.id, value: "good" });

    for (const row of [unvoted, oneVote]) {
      const result = await inviteApplication(s.moderator.context, { roundId: s.roundId, applicationId: row.id });
      expect(result).toEqual({ alreadyInvited: false });
      expect((await readApplication(s, row.id)).state).toBe("invited");
    }
  });
});

describe("inviteApplication: who may, and which row", () => {
  // The permission is checked BEFORE the row is read, so a plain resident gets the same refusal for
  // a new, an invited and a rejected row. `{alreadyInvited}` or `not_invitable` would be a state
  // oracle.
  it("a plain resident is refused on the permission for every state, and nothing is written", async () => {
    const s = await setupPipeline(households);
    const member = await claimPlainMember(s.hh, "PlainMember", accountIds);
    for (const state of ["new", "invited", "rejected_by_household"] as const) {
      const row = await insertApplicationAt(s, state);
      const err = await errorOf(inviteApplication(member.context, { roundId: s.roundId, applicationId: row.id }));
      expect(err, state).toBeInstanceOf(PermissionDeniedError);
      await expectUntouched(s, row);
    }
  });

  // INVARIANT GUARD for the household half, no break: RLS hides another household's row whatever
  // the predicate says. The round half is the predicate itself, and has its break.
  it("another household's application is not_found, and so is a matching id with another round's id", async () => {
    const s = await setupPipeline(households);
    const other = await setupPipeline(households);
    const foreign = await insertApplicationAt(other, "new");
    const err = await errorOf(inviteApplication(s.moderator.context, { roundId: s.roundId, applicationId: foreign.id }));
    expect(err).toBeInstanceOf(ApplicationTransitionError);
    expect((err as ApplicationTransitionError).code).toBe("not_found");
    await expectUntouched(other, foreign);

    // The application is the household's own, but the round id names another round.
    const own = await insertApplicationAt(s, "new");
    const wrongRound = await errorOf(
      inviteApplication(s.moderator.context, { roundId: other.roundId, applicationId: own.id }),
    );
    expect(wrongRound).toBeInstanceOf(ApplicationTransitionError);
    expect((wrongRound as ApplicationTransitionError).code).toBe("not_found");
    await expectUntouched(s, own);
  });

  it("a malformed id is not_found", async () => {
    const s = await setupPipeline(households);
    const err = await errorOf(inviteApplication(s.moderator.context, { roundId: s.roundId, applicationId: "not-a-uuid" }));
    expect(err).toBeInstanceOf(ApplicationTransitionError);
    expect((err as ApplicationTransitionError).code).toBe("not_found");
  });
});

describe("inviteApplication: serialised on the application row (design D2)", () => {
  // A regression test of the row lock: a real transaction holds the row FOR UPDATE, uncommitted.
  it("two invites at once: both wait, then one invites and the other is the no-op; exactly two events", async () => {
    const s = await setupPipeline(households);
    const row = await insertApplicationAt(s, "new");

    const held = holdTransaction(s.moderator.context, async (tx) => {
      await tx.select({ id: application.id }).from(application).where(eq(application.id, row.id)).for("update");
    });
    await held.started;

    const input = { roundId: s.roundId, applicationId: row.id };
    const a = inviteApplication(s.moderator.context, input);
    const b = inviteApplication(s.moderator.context, input);
    const settledWhileHeld = await Promise.all([settlesWithin(a, 2000), settlesWithin(b, 2000)]);
    held.release();
    await held.done;
    const results = await Promise.all([a, b]);

    expect(settledWhileHeld).toEqual([false, false]);
    expect(results.map((r) => r.alreadyInvited).sort()).toEqual([false, true]);
    expect((await readApplication(s, row.id)).state).toBe("invited");
    expect(await eventsOf(s, row.id, "application.state_changed")).toHaveLength(2);
  }, 30_000);

  // INVARIANT GUARD, not a regression test of new code: it exercises the existing vote_guard
  // (drizzle/0028), which reads the application FOR SHARE and so waits for an invitation in flight,
  // then refuses a vote on an application that has left new/screened. No break is possible without
  // a migration.
  it("a vote racing the invitation: the vote waits, then is refused not_votable; no vote row exists", async () => {
    const s = await setupPipeline(households);
    const voter = await claimPlainMember(s.hh, "Voter", accountIds);
    const row = await insertApplicationAt(s, "new");

    // The hold takes the row and sets `invited` itself, uncommitted: what an invitation in flight
    // looks like to the vote.
    const held = holdTransaction(s.moderator.context, async (tx) => {
      await tx.select({ id: application.id }).from(application).where(eq(application.id, row.id)).for("update");
      await tx.update(application).set({ state: "invited", stateChangedAt: new Date() }).where(eq(application.id, row.id));
    });
    await held.started;

    const vote = castVote(voter.context, { roundId: s.roundId, applicationId: row.id, value: "good" });
    const outcome = vote.then(() => "recorded" as const, (e: unknown) => e);
    const settledWhileHeld = await settlesWithin(outcome, 2000);
    held.release();
    await held.done;
    const result = await outcome;

    expect(settledWhileHeld).toBe(false);
    expect(result).toBeInstanceOf(VoteError);
    expect((result as VoteError).code).toBe("not_votable");
    expect(await readVotes(voter.context, row.id)).toHaveLength(0);
  }, 30_000);
});
