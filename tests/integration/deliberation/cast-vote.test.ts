import { afterEach, describe, expect, it } from "vitest";
import { castVote, VoteError } from "@/modules/deliberation/repository";
import { setMovedOut } from "@/modules/identity/repository";
import { insertTestRound } from "../../helpers/applications";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import { claimPlainMember, insertApplicationAt, setupPipeline } from "../../helpers/pipeline";
import {
  addParticipation,
  readVotes,
  setCanVote,
  setRemoved,
  setRoundStatus,
  thrownBy,
} from "../../helpers/votes";
import { withSessionContext } from "@/db/session-context";

// F4 change 1 (screening-pass) tasks 6.1: castVote, the repository half. The vote rules are the
// database's (drizzle/0028 vote_guard); each refusal below is asserted by its typed CODE, so a
// refusal reached by the wrong path cannot pass. Teardown is in afterEach.
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

describe("castVote (AC-4.10)", () => {
  it("rates good then no: one row, value no, every column as written", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    const [first] = await readVotes(voter.context, app.id);
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "no" });

    const rows = await readVotes(voter.context, app.id);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.value).toBe("no");
    expect(row.stage).toBe("invite");
    expect(row.householdId).toBe(s.hh.householdId);
    expect(row.roundId).toBe(s.roundId);
    expect(row.applicationId).toBe(app.id);
    expect(row.residentProfileId).toBe(voter.profileId);
    expect(row.withdrawnAt).toBeNull();
    expect(row.id).toBe(first.id);
    expect(row.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(row.updatedAt.getTime()).toBeGreaterThan(row.createdAt.getTime());
  });

  it("re-rating clears a withdrawal (FR-4.14, V1.1)", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    await withSessionContext(voter.context, (tx) =>
      tx.execute(`UPDATE vote SET withdrawn_at = now() WHERE application_id = '${app.id}'::uuid`),
    );
    expect((await readVotes(voter.context, app.id))[0].withdrawnAt).not.toBeNull();
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "definitely" });
    const [row] = await readVotes(voter.context, app.id);
    expect(row.withdrawnAt).toBeNull();
    expect(row.value).toBe("definitely");
  });
});

describe("castVote refusals (AC-4.13, FR-4.15)", () => {
  it("refuses a round that is paused, closed or archived, names the state, keeps the earlier vote", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    for (const status of ["paused", "closed", "archived"] as const) {
      await setRoundStatus(s, s.roundId, status);
      const err = await refusal(castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "no" }));
      expect(err.code).toBe("round_not_open");
      expect(err.roundStatus).toBe(status);
      const [row] = await readVotes(voter.context, app.id);
      expect(row.value).toBe("good");
    }
  });

  it("refuses the voter's own application in screened", async () => {
    const { s, voter } = await fixture();
    const own = await insertApplicationAt(s, "screened", { becameResidentId: voter.profileId });
    const err = await refusal(castVote(voter.context, { roundId: s.roundId, applicationId: own.id, value: "good" }));
    expect(err.code).toBe("own_application");
    expect(await readVotes(voter.context, own.id)).toHaveLength(0);
  });

  it("refuses an invited application", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "invited");
    const err = await refusal(castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" }));
    expect(err.code).toBe("not_votable");
  });

  it("refuses a mismatched roundId when the voter participates in both rounds", async () => {
    const { s, voter } = await fixture();
    const otherRound = await withSessionContext(s.moderator.context, (tx) =>
      insertTestRound(tx, s.hh.householdId, "open"),
    );
    await addParticipation(s.hh, otherRound, voter.profileId);
    const app = await insertApplicationAt(s, "new"); // belongs to s.roundId
    const err = await refusal(castVote(voter.context, { roundId: otherRound, applicationId: app.id, value: "good" }));
    expect(err.code).toBe("not_found");
    expect(await readVotes(voter.context, app.id)).toHaveLength(0);
  });

  // Invariant guard, not a regression test: RLS refuses another household's application too, so
  // this holds with or without the trigger's household predicate.
  it("refuses another household's application (invariant guard: RLS holds it too)", async () => {
    const { s, voter } = await fixture();
    const foreign = await setupPipeline(households);
    const app = await insertApplicationAt(foreign, "new");
    const err = await refusal(castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" }));
    expect(err.code).toBe("not_found");
  });

  it("a stale context after setMovedOut is refused as not_eligible via the in-transaction vote check (assertAccountCanVoteTx)", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await setMovedOut(s.hh.context, s.hh.accountId, voter.accountId);
    const err = await refusal(castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" }));
    expect(err.code).toBe("not_eligible");
    // Break (tasks 6.1): remove the HouseholdAccountCannotVoteError mapping -> the raw error surfaces.
  });
});

// Unreachable in v0.1: no production path writes round_participation.can_vote after insert or
// removed_at at all (design Context; docs/review-log.md, "RoundParticipation.can_vote ist immer
// true"). The states are built with owner-style UPDATEs through the household context, so these
// are invariant guards on the trigger's step 3, not regression tests.
describe("castVote eligibility (invariant guards, unreachable states)", () => {
  it("can_vote = false is refused as not_eligible", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await setCanVote(s.hh, s.roundId, voter.profileId, false);
    const err = await refusal(castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" }));
    expect(err.code).toBe("not_eligible");
  });

  it("removed_at set is refused as not_eligible", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await setRemoved(s.hh, s.roundId, voter.profileId);
    const err = await refusal(castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" }));
    expect(err.code).toBe("not_eligible");
  });
});

describe("castVote non-participant", () => {
  it("a round built without the voter's participation refuses as not_eligible", async () => {
    const { s, voter } = await fixture();
    const roundWithoutVoter = await withSessionContext(s.moderator.context, (tx) =>
      insertTestRound(tx, s.hh.householdId, "open"),
    );
    const app = await insertApplicationAt(s, "new", {}, roundWithoutVoter);
    const err = await refusal(
      castVote(voter.context, { roundId: roundWithoutVoter, applicationId: app.id, value: "good" }),
    );
    expect(err.code).toBe("not_eligible");
  });
});
