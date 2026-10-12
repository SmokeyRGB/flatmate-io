import { afterEach, describe, expect, it } from "vitest";
import { ProfileRequiredError, transitionApplication } from "@/modules/casting/repository";
import {
  castVote,
  getAwaitingVoteCounts,
  getScreeningPass,
  VoteError,
  withdrawVote,
} from "@/modules/deliberation/repository";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import {
  claimPlainMember,
  grantPermissions,
  holdTransaction,
  insertApplicationAt,
  setupPipeline,
  settlesWithin,
} from "../../helpers/pipeline";
import { readVotes, setRemoved, setRoundStatus, thrownBy, voteEvents } from "../../helpers/votes";

// F4 change 2 (vote-withdrawal-and-audit) tasks 3.2: withdrawVote. The vote rules are the
// database's (vote_guard); every refusal is asserted by its typed CODE. Teardown is in afterEach.
const households: TestHousehold[] = [];
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  accountIds.length = 0;
  households.length = 0;
});

async function fixture() {
  const s = await setupPipeline(households);
  const voter = await claimPlainMember(s.hh, "Voter", accountIds);
  return { s, voter };
}

async function refusal(promise: Promise<unknown>): Promise<VoteError> {
  const err = await thrownBy(() => promise);
  expect(err).toBeInstanceOf(VoteError);
  return err as VoteError;
}

describe("withdrawVote (AC-4.15)", () => {
  it("(a) keeps the row and every column but the withdrawal, and writes one vote.withdrawn", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    const [first] = await readVotes(voter.context, app.id);
    await withdrawVote(voter.context, { applicationId: app.id });

    const rows = await readVotes(voter.context, app.id);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.id).toBe(first.id);
    expect(row.householdId).toBe(first.householdId);
    expect(row.roundId).toBe(first.roundId);
    expect(row.applicationId).toBe(first.applicationId);
    expect(row.residentProfileId).toBe(first.residentProfileId);
    expect(row.stage).toBe("invite");
    expect(row.value).toBe("good");
    expect(row.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(row.withdrawnAt).not.toBeNull();
    expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(row.withdrawnAt!.getTime());

    const events = await voteEvents(s, app.id);
    expect(events.map((e) => e.eventType)).toEqual(["vote.cast", "vote.withdrawn"]);
    expect(events[1].payload).toEqual({ stage: "invite" });
    expect(events[1].actorAccountId).toBe(voter.accountId);
    expect(events[1].actorProfileId).toBe(voter.profileId);
  });

  it("(b) withdraw, rate no, withdraw: one row, value no, withdrawn, the first createdAt", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    const [first] = await readVotes(voter.context, app.id);
    await withdrawVote(voter.context, { applicationId: app.id });
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "no" });
    await withdrawVote(voter.context, { applicationId: app.id });

    const rows = await readVotes(voter.context, app.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("no");
    expect(rows[0].withdrawnAt).not.toBeNull();
    expect(rows[0].createdAt.getTime()).toBe(first.createdAt.getTime());
    expect((await voteEvents(s, app.id)).map((e) => e.eventType)).toEqual([
      "vote.cast",
      "vote.withdrawn",
      "vote.cast",
      "vote.withdrawn",
    ]);
  });

  it("(c) with no vote, and a second time, is not_found and writes nothing", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    expect((await refusal(withdrawVote(voter.context, { applicationId: app.id }))).code).toBe("not_found");
    expect(await readVotes(voter.context, app.id)).toHaveLength(0);
    expect(await voteEvents(s, app.id)).toHaveLength(0);

    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    await withdrawVote(voter.context, { applicationId: app.id });
    const [withdrawn] = await readVotes(voter.context, app.id);
    expect((await refusal(withdrawVote(voter.context, { applicationId: app.id }))).code).toBe("not_found");
    expect(await readVotes(voter.context, app.id)).toEqual([withdrawn]);
    expect((await voteEvents(s, app.id)).map((e) => e.eventType)).toEqual(["vote.cast", "vote.withdrawn"]);
  });

  it("(d) a paused round refuses round_not_open, naming the state, and the vote stays live", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    await setRoundStatus(s, s.roundId, "paused");
    const err = await refusal(withdrawVote(voter.context, { applicationId: app.id }));
    expect(err.code).toBe("round_not_open");
    expect(err.roundStatus).toBe("paused");
    expect((await readVotes(voter.context, app.id))[0].withdrawnAt).toBeNull();
    expect((await voteEvents(s, app.id)).map((e) => e.eventType)).toEqual(["vote.cast"]);
  });

  it("(e) an application moved to invited refuses not_votable, and the vote stays live", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "screened");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    await transitionApplication(s.moderator.context, app.id, "invited");
    const err = await refusal(withdrawVote(voter.context, { applicationId: app.id }));
    expect(err.code).toBe("not_votable");
    expect((await readVotes(voter.context, app.id))[0].withdrawnAt).toBeNull();
  });

  // Unreachable in v0.1 (no production path writes round_participation.removed_at), so an
  // invariant guard on vote_guard step 3 as seen through the withdrawal (EC-4.7).
  it("(f) participation removed after voting refuses not_eligible, and the vote stands", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    await setRemoved(s.hh, s.roundId, voter.profileId);
    const err = await refusal(withdrawVote(voter.context, { applicationId: app.id }));
    expect(err.code).toBe("not_eligible");
    expect((await readVotes(voter.context, app.id))[0].withdrawnAt).toBeNull();
  });

  it("(g) the household account is refused with ProfileRequiredError", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    const err = await thrownBy(() => withdrawVote(s.hh.context, { applicationId: app.id }));
    expect(err).toBeInstanceOf(ProfileRequiredError);
    expect((await readVotes(voter.context, app.id))[0].withdrawnAt).toBeNull();
  });

  it("(h) a resident whose `vote` permission was stripped is refused not_eligible", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    await grantPermissions(s.hh, voter.accountId, []);
    expect((await refusal(withdrawVote(voter.context, { applicationId: app.id }))).code).toBe("not_eligible");
    expect((await readVotes(voter.context, app.id))[0].withdrawnAt).toBeNull();
  });

  it("(i) after a withdrawal the application is awaited again and dealt again", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    expect((await getAwaitingVoteCounts(voter.context)).get(s.roundId)).toBe(0);
    await withdrawVote(voter.context, { applicationId: app.id });
    expect((await getAwaitingVoteCounts(voter.context)).get(s.roundId)).toBe(1);
    const pass = await getScreeningPass(voter.context, s.roundId);
    expect(pass.kind).toBe("deck");
    expect(pass.kind === "deck" ? pass.cards.map((c) => c.applicationId) : []).toEqual([app.id]);
  });

  // Deterministic, no seam: an uncommitted DELETE of the voter's own row is held while the
  // withdrawal runs. Its pre-read sees the committed row, its upsert waits on the deleter, and
  // once the delete commits the upsert INSERTS: the function must throw and roll that insert back.
  it("(j) never inserts: the row deleted between pre-read and upsert is not_found, no row, no event", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    const [row] = await readVotes(voter.context, app.id);

    const held = holdTransaction(voter.context, async (tx) => {
      await tx.execute(`DELETE FROM vote WHERE id = '${row.id}'::uuid`);
    });
    await held.started;
    const attempt = withdrawVote(voter.context, { applicationId: app.id }).then(
      () => null as null | unknown,
      (e: unknown) => e,
    );
    const settledWhileHeld = await settlesWithin(attempt, 2000);
    held.release();
    await held.done;
    const err = await attempt;
    expect(settledWhileHeld).toBe(false);
    expect(err).toBeInstanceOf(VoteError);
    expect((err as VoteError).code).toBe("not_found");
    expect(await readVotes(voter.context, app.id)).toHaveLength(0);
    expect((await voteEvents(s, app.id)).map((e) => e.eventType)).toEqual(["vote.cast"]);
  });
});
