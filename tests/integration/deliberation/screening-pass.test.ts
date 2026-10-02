import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { listVoteCandidatesTx, forceChangeSettingWhileRoundOpen, ProfileRequiredError } from "@/modules/casting/repository";
import { castingRound } from "@/modules/casting/schema";
import { castVote, getAwaitingVoteCounts, getScreeningPass } from "@/modules/deliberation/repository";
import { vote } from "@/modules/deliberation/schema";
import { setMovedOut } from "@/modules/identity/repository";
import { insertTestRound, syntheticContacts } from "../../helpers/applications";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import { claimPlainMember, insertApplicationAt, setupPipeline, type PipelineSetup } from "../../helpers/pipeline";
import { addParticipation, setCanVote, setRemoved, setRoundStatus } from "../../helpers/votes";

// F4 change 1 tasks 6.5: getScreeningPass, the deck read. A claimed active resident is a
// participant of every open round, so a non-participant is built by a round created without their
// participation (insertTestRound), never assumed. Teardown is in afterEach.
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

// Explicit, increasing created_at so the deck order is asserted, not incidental.
const base = Date.now() - 3_600_000;
const at = (n: number) => new Date(base + n * 1000);

async function deckOf(s: PipelineSetup, context: Parameters<typeof getScreeningPass>[0], roundId: string | null) {
  void s;
  const pass = await getScreeningPass(context, roundId);
  expect(pass.kind).toBe("deck");
  if (pass.kind !== "deck") throw new Error("not a deck");
  return pass;
}

describe("getScreeningPass: the deck (AC-4.1, AC-4.2, AC-4.3)", () => {
  it("holds exactly the five open applications, oldest first, and nothing else", async () => {
    const { s, voter } = await fixture();
    const five = [
      await insertApplicationAt(s, "new", { createdAt: at(1) }),
      await insertApplicationAt(s, "screened", { createdAt: at(2) }),
      await insertApplicationAt(s, "new", { createdAt: at(3) }),
      await insertApplicationAt(s, "screened", { createdAt: at(4) }),
      await insertApplicationAt(s, "new", { createdAt: at(5) }),
    ];
    const invited = await insertApplicationAt(s, "invited", { createdAt: at(6) });
    const rejected = await insertApplicationAt(s, "rejected_by_household", { createdAt: at(7) });
    const own = await insertApplicationAt(s, "screened", { createdAt: at(8), becameResidentId: voter.profileId });

    const pass = await deckOf(s, voter.context, s.roundId);
    expect(pass.cards.map((c) => c.applicationId)).toEqual(five.map((a) => a.id));
    const ids = pass.cards.map((c) => c.applicationId);
    expect(ids).not.toContain(invited.id);
    expect(ids).not.toContain(rejected.id);
    expect(ids).not.toContain(own.id);
    // The same deck for the picked-round form.
    const auto = await deckOf(s, voter.context, null);
    expect(auto.cards.map((c) => c.applicationId)).toEqual(ids);
    expect(auto.round.id).toBe(s.roundId);
  });

  it("already rated cards are absent, a withdrawn vote counts as unrated", async () => {
    const { s, voter } = await fixture();
    const apps: Awaited<ReturnType<typeof insertApplicationAt>>[] = [];
    for (let i = 1; i <= 5; i++) apps.push(await insertApplicationAt(s, "new", { createdAt: at(i) }));
    await castVote(voter.context, { roundId: s.roundId, applicationId: apps[0].id, value: "good" });
    await castVote(voter.context, { roundId: s.roundId, applicationId: apps[1].id, value: "no" });
    expect((await deckOf(s, voter.context, s.roundId)).cards.map((c) => c.applicationId)).toEqual(
      apps.slice(2).map((a) => a.id),
    );

    // Withdrawal can only be set in the voter's own context while the round is open.
    await withSessionContext(voter.context, (tx) =>
      tx.update(vote).set({ withdrawnAt: new Date() }).where(eq(vote.applicationId, apps[0].id)),
    );
    expect((await deckOf(s, voter.context, s.roundId)).cards.map((c) => c.applicationId)).toEqual([
      apps[0].id,
      ...apps.slice(2).map((a) => a.id),
    ]);
  });

  // A pin, not a proof (pre-mortem M13): the held deck of a running pass lives in the client, so
  // "unchanged while running" is the reducer's (tests/unit/screening/deck-state.test.ts). What is
  // pinned here is the server half: a NEW call after a capture includes it (AC-4.5).
  it("AC-4.4/4.5: a pass started after a sixth capture holds six", async () => {
    const { s, voter } = await fixture();
    for (let i = 1; i <= 5; i++) await insertApplicationAt(s, "new", { createdAt: at(i) });
    const running = await deckOf(s, voter.context, s.roundId);
    expect(running.cards).toHaveLength(5);
    await insertApplicationAt(s, "new", { createdAt: at(6) });
    expect(running.cards).toHaveLength(5);
    expect((await deckOf(s, voter.context, s.roundId)).cards).toHaveLength(6);
  });

  it("an empty round is the empty state, and so is one whose only application is the viewer's own", async () => {
    const { s, voter } = await fixture();
    expect(await getScreeningPass(voter.context, s.roundId)).toEqual({ kind: "empty" });
    expect(await getScreeningPass(voter.context, null)).toEqual({ kind: "empty" });
    await insertApplicationAt(s, "screened", { becameResidentId: voter.profileId });
    expect(await getScreeningPass(voter.context, s.roundId)).toEqual({ kind: "empty" });
  });
});

describe("getScreeningPass: the frozen weights (AC-4.9, EC-4.11)", () => {
  it("AC-4.9: a weight changed through the audited override after opening is not shown", async () => {
    const { s, voter } = await fixture();
    await insertApplicationAt(s, "new");
    await forceChangeSettingWhileRoundOpen(
      s.hh.context,
      "scaleWeights",
      { no: 0, rather_not: 1, good: 4, definitely: 5 },
      s.roundId,
      { accountId: s.hh.accountId, profileId: null },
    );
    const pass = await deckOf(s, voter.context, s.roundId);
    expect(pass.weights).toEqual({ no: 0, rather_not: 1, good: 3, definitely: 5 });
  });

  it("EC-4.11: a malformed snapshot is refused, with no cards, whichever way the round is named", async () => {
    const { s, voter } = await fixture();
    await insertApplicationAt(s, "new");
    await withSessionContext(s.moderator.context, (tx) =>
      tx
        .update(castingRound)
        .set({ settingsSnapshot: { scaleWeights: { no: 0, rather_not: 1, good: "3" } } })
        .where(eq(castingRound.id, s.roundId)),
    );
    expect(await getScreeningPass(voter.context, s.roundId)).toEqual({ kind: "refused", reason: "rules_invalid" });
    expect(await getScreeningPass(voter.context, null)).toEqual({ kind: "refused", reason: "rules_invalid" });
  });
});

describe("getScreeningPass: eligibility (FR-4.15, EC-4.3, V-2)", () => {
  it("a non-participant is refused not_eligible and nothing of the round leaks", async () => {
    const { s, voter } = await fixture();
    const round = await withSessionContext(s.moderator.context, (tx) => insertTestRound(tx, s.hh.householdId, "open"));
    await insertApplicationAt(s, "new", {}, round);
    const pass = await getScreeningPass(voter.context, round);
    expect(pass).toEqual({ kind: "refused", reason: "not_eligible" });
    expect(Object.keys(pass).sort()).toEqual(["kind", "reason"]);
  });

  it("a round that is not open is refused round_not_open, naming the status", async () => {
    const { s, voter } = await fixture();
    await insertApplicationAt(s, "new");
    await setRoundStatus(s, s.roundId, "paused");
    expect(await getScreeningPass(voter.context, s.roundId)).toEqual({
      kind: "refused",
      reason: "round_not_open",
      status: "paused",
    });
    // A pass with no round named ignores a round that is not open.
    expect(await getScreeningPass(voter.context, null)).toEqual({ kind: "empty" });
  });

  it("a malformed round id is the same refusal as no participation", async () => {
    const { voter } = await fixture();
    expect(await getScreeningPass(voter.context, "not-a-uuid")).toEqual({ kind: "refused", reason: "not_eligible" });
  });

  it("a moved-out profile called directly gets nothing (the port re-applies status = active)", async () => {
    const { s, voter } = await fixture();
    await insertApplicationAt(s, "new");
    await setMovedOut(s.hh.context, s.hh.accountId, voter.accountId);
    expect(await getScreeningPass(voter.context, s.roundId)).toEqual({ kind: "refused", reason: "not_eligible" });
    // role-permissions: the moved-out membership holds no `vote` any more, so the pass refuses
    // before it looks for a round (it used to fall through to "empty"). Either way no card leaves.
    expect(await getScreeningPass(voter.context, null)).toEqual({ kind: "refused", reason: "not_eligible" });
    expect((await getAwaitingVoteCounts(voter.context)).size).toBe(0);
    // The candidates port itself, called directly: no card data reaches the caller.
    const leaked = await withSessionContext(voter.context, (tx) =>
      listVoteCandidatesTx(tx, voter.context, [s.roundId], { withCard: true }),
    );
    expect(leaked).toEqual([]);
  });

  it("the candidates port gives a non-participant no row and no card", async () => {
    const { s, voter } = await fixture();
    const round = await withSessionContext(s.moderator.context, (tx) => insertTestRound(tx, s.hh.householdId, "open"));
    await insertApplicationAt(s, "new", {}, round);
    const rows = await withSessionContext(voter.context, (tx) =>
      listVoteCandidatesTx(tx, voter.context, [round], { withCard: true }),
    );
    expect(rows).toEqual([]);
    const withoutCard = await withSessionContext(voter.context, (tx) =>
      listVoteCandidatesTx(tx, voter.context, [round], { withCard: false }),
    );
    expect(withoutCard).toEqual([]);
  });

  // Invariant guards, not regression tests: no production path writes can_vote = false or
  // removed_at (design Context; docs/review-log.md "RoundParticipation.can_vote ist immer true").
  it("invariant guard: can_vote = false, and removed_at set, are refused not_eligible", async () => {
    const { s, voter } = await fixture();
    await insertApplicationAt(s, "new");
    await setCanVote(s.hh, s.roundId, voter.profileId, false);
    expect(await getScreeningPass(voter.context, s.roundId)).toEqual({ kind: "refused", reason: "not_eligible" });
    await setCanVote(s.hh, s.roundId, voter.profileId, true);
    await setRemoved(s.hh, s.roundId, voter.profileId);
    expect(await getScreeningPass(voter.context, s.roundId)).toEqual({ kind: "refused", reason: "not_eligible" });
  });
});

describe("getScreeningPass: which round (roundId = null)", () => {
  it("picks the newest open round that awaits the viewer; none awaiting gives empty", async () => {
    const { s, voter } = await fixture();
    const second = await withSessionContext(s.moderator.context, (tx) => insertTestRound(tx, s.hh.householdId, "open"));
    await withSessionContext(s.moderator.context, (tx) =>
      tx
        .update(castingRound)
        .set({ settingsSnapshot: { scaleWeights: { no: 0, rather_not: 1, good: 3, definitely: 5 } } })
        .where(eq(castingRound.id, second)),
    );
    await addParticipation(s.hh, second, voter.profileId);
    const olderApp = await insertApplicationAt(s, "new");
    const newerApp = await insertApplicationAt(s, "new", {}, second);

    const first = await deckOf(s, voter.context, null);
    expect(first.round.id).toBe(second);
    expect(first.cards.map((c) => c.applicationId)).toEqual([newerApp.id]);

    await castVote(voter.context, { roundId: second, applicationId: newerApp.id, value: "good" });
    const next = await deckOf(s, voter.context, null);
    expect(next.round.id).toBe(s.roundId);
    expect(next.cards.map((c) => c.applicationId)).toEqual([olderApp.id]);

    await castVote(voter.context, { roundId: s.roundId, applicationId: olderApp.id, value: "no" });
    expect(await getScreeningPass(voter.context, null)).toEqual({ kind: "empty" });
  });
});

describe("the card (FR-4.7, Q-2)", () => {
  it("has exactly the five keys, passes the attributes through, and carries no contact detail", async () => {
    const { s, voter } = await fixture();
    const contacts = syntheticContacts();
    await insertApplicationAt(s, "new", {
      ...contacts,
      age: 27,
      messageRaw: "Hallo, ich suche ein Zimmer.",
      attributes: [{ label: "Beruf", value: "Lehrerin" }],
    });
    const pass = await deckOf(s, voter.context, s.roundId);
    const [card] = pass.cards;
    expect(Object.keys(card).sort()).toEqual(["age", "applicantName", "applicationId", "attributes", "messageRaw"]);
    expect(card.age).toBe(27);
    expect(card.messageRaw).toBe("Hallo, ich suche ein Zimmer.");
    expect(card.attributes).toEqual([{ label: "Beruf", value: "Lehrerin" }]);
    const serialised = JSON.stringify(pass);
    expect(serialised).not.toContain(contacts.contactEmail);
    expect(serialised).not.toContain(contacts.contactPhone);
  });

  it("the candidates port itself selects only the card columns", async () => {
    const { s, voter } = await fixture();
    await insertApplicationAt(s, "new", { ...syntheticContacts() });
    const rows = await withSessionContext(voter.context, (tx) =>
      listVoteCandidatesTx(tx, voter.context, [s.roundId], { withCard: true }),
    );
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["applicationId", "card", "createdAt", "roundId"]);
    expect(Object.keys(rows[0].card ?? {}).sort()).toEqual(["age", "applicantName", "attributes", "messageRaw"]);
  });
});

describe("profile-less", () => {
  it("the port refuses a profile-less context", async () => {
    const { s } = await fixture();
    const profileless = { ...s.hh.context, profileId: null };
    await expect(
      withSessionContext(s.moderator.context, (tx) =>
        listVoteCandidatesTx(tx, profileless, [s.roundId], { withCard: true }),
      ),
    ).rejects.toBeInstanceOf(ProfileRequiredError);
  });
});

