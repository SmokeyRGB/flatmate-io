import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { transitionApplication } from "@/modules/casting/repository";
import { castVote, getAwaitingVoteCounts, getScreeningPass } from "@/modules/deliberation/repository";
import { vote } from "@/modules/deliberation/schema";
import { insertTestRound } from "../../helpers/applications";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import { claimPlainMember, grantPermissions, insertApplicationAt, setupPipeline } from "../../helpers/pipeline";

// F4 change 1 tasks 6.6: T-5, "awaiting my vote" per round, from deliberation. The deck and the
// count share one definition (awaitingVoteTx), so the map must equal the deck size. The cases
// (f5) and (g) come from tests/integration/policy/start-overview.test.ts, whose count assertions
// moved here with T-5 itself.
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

describe("getAwaitingVoteCounts", () => {
  it("equals the deck size per round, drops by one per vote, and counts a withdrawn vote again", async () => {
    const { s, voter } = await fixture();
    const apps = [
      await insertApplicationAt(s, "new"),
      await insertApplicationAt(s, "screened"),
      await insertApplicationAt(s, "new"),
    ];
    await insertApplicationAt(s, "invited");
    await insertApplicationAt(s, "rejected_by_household");
    await insertApplicationAt(s, "screened", { becameResidentId: voter.profileId });

    const deck = await getScreeningPass(voter.context, s.roundId);
    expect(deck.kind).toBe("deck");
    const deckSize = deck.kind === "deck" ? deck.cards.length : -1;
    expect((await getAwaitingVoteCounts(voter.context)).get(s.roundId)).toBe(deckSize);
    expect(deckSize).toBe(3);

    await castVote(voter.context, { roundId: s.roundId, applicationId: apps[0].id, value: "good" });
    expect((await getAwaitingVoteCounts(voter.context)).get(s.roundId)).toBe(2);

    // A withdrawn vote counts as unrated (pre-mortem M14). Withdrawal is set in the voter's own
    // context while the round is open.
    await withSessionContext(voter.context, (tx) =>
      tx.update(vote).set({ withdrawnAt: new Date() }).where(eq(vote.applicationId, apps[0].id)),
    );
    expect((await getAwaitingVoteCounts(voter.context)).get(s.roundId)).toBe(3);
  });

  // Ported from start-overview.test.ts (f5), PR #22: an application that became the viewer and
  // walked back to `screened` creates no vote task for that profile (03-PRD.md §4.1.2), and
  // became_resident_id survives the walk-back (G-D9).
  it("(f5) the viewer's own application walked back to screened is not awaited by them, but is by others", async () => {
    const { s, voter } = await fixture();
    const own = await insertApplicationAt(s, "invited", { becameResidentId: voter.profileId });
    await transitionApplication(s.moderator.context, own.id, "screened");
    await insertApplicationAt(s, "new");

    expect((await getAwaitingVoteCounts(voter.context)).get(s.roundId)).toBe(1);
    expect((await getAwaitingVoteCounts(s.moderator.context)).get(s.roundId)).toBe(2);
  });

  // Case (g), a deleted application absent from the count, is not ported as a test: nothing sets
  // `application.deleted_at` (F3 change 3 D1) and F3 change 4 drops the column, so no new read
  // names it (design Risks).

  // Copilot round on PR #54: Start's acknowledgement needs an explicit 0 to tell "nothing
  // awaits" from "the count was refused", so the two must differ in the map.
  it("an eligible voter with nothing awaiting gets an explicit 0, and a voter stripped of `vote` gets no entry", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    const rated = await getAwaitingVoteCounts(voter.context);
    expect(rated.has(s.roundId)).toBe(true);
    expect(rated.get(s.roundId)).toBe(0);

    // Positive control: the same voter with an application awaiting is counted, so the empty map
    // below comes from the missing permission and not from an empty round.
    await insertApplicationAt(s, "new");
    expect((await getAwaitingVoteCounts(voter.context)).get(s.roundId)).toBe(1);

    await grantPermissions(s.hh, voter.accountId, []);
    const refused = await getAwaitingVoteCounts(voter.context);
    expect(refused.has(s.roundId)).toBe(false);
    expect(refused.size).toBe(0);
  });

  it("a round without the viewer's participation is absent from the map", async () => {
    const { s, voter } = await fixture();
    const round = await withSessionContext(s.moderator.context, (tx) => insertTestRound(tx, s.hh.householdId, "open"));
    await insertApplicationAt(s, "new", {}, round);
    await insertApplicationAt(s, "new");
    const counts = await getAwaitingVoteCounts(voter.context);
    expect(counts.has(round)).toBe(false);
    expect(counts.get(s.roundId)).toBe(1);
  });
});
// Break (tasks 6.6): make awaitingVoteTx ignore `withdrawn_at` -> the withdrawn case fails.
// The household account gets an empty map with no query: tests/integration/policy/vote-household-account.test.ts.
