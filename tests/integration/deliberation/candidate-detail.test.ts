import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import {
  createAndOpenRound,
  createRoom,
  getVoteCandidateCardTx,
  transitionApplication,
  updateHouseholdSettings,
} from "@/modules/casting/repository";
import { castingRound } from "@/modules/casting/schema";
import {
  castVote,
  getCandidateDetail,
  getRanking,
  type CandidateDetail,
} from "@/modules/deliberation/repository";
import { registerHousehold } from "@/modules/identity/auth";
import { getHouseholdSettings, reactivateMember, setMovedOut } from "@/modules/identity/repository";
import { insertTestRound, syntheticContacts } from "../../helpers/applications";
import {
  cleanupAll,
  cleanupHousehold,
  createTestModerator,
  deleteTestAccount,
  testEmail,
  type TestHousehold,
} from "../../helpers/identity";
import { claimPlainMember, grantPermissions, insertApplicationAt, type PipelineSetup } from "../../helpers/pipeline";
import { setRoundStatus } from "../../helpers/votes";

// F5 candidate-detail, task 6.4: getCandidateDetail, the detail card's one read. It runs the same
// core and the same candidate predicate as the scoreboard, so most cases compare the two. Shared
// households are registered through registerHousehold directly (tests/setup.ts's global sweep
// would delete a tracked one between tests) and torn down in afterAll; per-test state a case
// changes (the snapshot, the round status, the settings) is put back in afterEach.

const households: TestHousehold[] = [];
const accountIds: string[] = [];

async function registerSharedHousehold(): Promise<TestHousehold> {
  const email = testEmail();
  const { household, context } = await registerHousehold(email, "test-password-not-real-1234", "WG");
  const hh: TestHousehold = {
    context,
    accountId: context.accountId,
    householdId: household.id,
    email,
    cleanup: async () => {
      await cleanupHousehold(context, household.id);
      await deleteTestAccount(context.accountId);
    },
  };
  households.push(hh);
  return hh;
}

const hhActor = (hh: TestHousehold) => ({ accountId: hh.accountId, profileId: null });

// A household with a moderator (who is a voter), one open room and one open round; the round is
// opened with `reveal` already stored in the household settings, so it is frozen into the snapshot.
async function pipeline(opts: { reveal: boolean; moderatorName: string }): Promise<PipelineSetup> {
  const hh = await registerSharedHousehold();
  if (opts.reveal) await updateHouseholdSettings(hh.context, { revealVoteAuthorship: true }, hhActor(hh));
  const moderator = await createTestModerator(hh, opts.moderatorName);
  const room = await createRoom(hh.context, "Room A", hhActor(hh));
  const round = await createAndOpenRound(moderator.context, "Round", [room.id], {
    accountId: moderator.accountId,
    profileId: moderator.profileId,
  });
  return { hh, moderator, roundId: round.id };
}

afterAll(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  accountIds.length = 0;
  households.length = 0;
});

const cast = (
  s: PipelineSetup,
  context: SessionContext,
  applicationId: string,
  value: Parameters<typeof castVote>[1]["value"],
) => castVote(context, { roundId: s.roundId, applicationId, value });

function expectKind<K extends CandidateDetail["kind"]>(
  result: CandidateDetail,
  kind: K,
): Extract<CandidateDetail, { kind: K }> {
  expect(result.kind, JSON.stringify(result)).toBe(kind);
  return result as Extract<CandidateDetail, { kind: K }>;
}

const NOT_FOUND = { kind: "refused", reason: "not_found" } as const;

async function readSnapshot(s: PipelineSetup): Promise<Record<string, unknown>> {
  const [row] = await withSessionContext(s.moderator.context, (tx) =>
    tx.select({ snapshot: castingRound.settingsSnapshot }).from(castingRound).where(eq(castingRound.id, s.roundId)),
  );
  return row.snapshot as Record<string, unknown>;
}

async function writeSnapshot(s: PipelineSetup, snapshot: Record<string, unknown>) {
  await withSessionContext(s.moderator.context, (tx) =>
    tx.update(castingRound).set({ settingsSnapshot: snapshot }).where(eq(castingRound.id, s.roundId)),
  );
}

// ---------------------------------------------------------------------------------------------
describe("getCandidateDetail: the setting off (the default)", () => {
  let s: PipelineSetup;
  let base: Record<string, unknown>;
  let viewer: Awaited<ReturnType<typeof claimPlainMember>>;
  let w: Awaited<ReturnType<typeof claimPlainMember>>;
  let x: Awaited<ReturnType<typeof claimPlainMember>>;
  let stripped: Awaited<ReturnType<typeof claimPlainMember>>;
  let a1: Awaited<ReturnType<typeof insertApplicationAt>>; // scored 2/1/0/1
  let a2: Awaited<ReturnType<typeof insertApplicationAt>>; // unscored, the viewer voted
  let a3: Awaited<ReturnType<typeof insertApplicationAt>>; // rejected, results visible
  let a4: Awaited<ReturnType<typeof insertApplicationAt>>; // hidden from the viewer
  let own: Awaited<ReturnType<typeof insertApplicationAt>>;
  const m = () => s.moderator.context;
  const detail = (id: string, context = viewer.context) => getCandidateDetail(context, id);

  beforeAll(async () => {
    s = await pipeline({ reveal: false, moderatorName: "Mona" });
    viewer = await claimPlainMember(s.hh, "Vera", accountIds);
    w = await claimPlainMember(s.hh, "Wanda", accountIds);
    x = await claimPlainMember(s.hh, "Xaver", accountIds);
    stripped = await claimPlainMember(s.hh, "Ohnerecht", accountIds);
    await grantPermissions(s.hh, stripped.accountId, []);
    base = await readSnapshot(s);
    // Voters: Mona, Vera, Wanda, Xaver (Ohnerecht is a participant too, so the denominator is 5).
    a1 = await insertApplicationAt(s, "new", {
      age: 27,
      messageRaw: "Hallo, ich suche ein Zimmer.",
      attributes: [{ label: "Beruf", value: "Lehrerin" }],
      ...syntheticContacts(),
    });
    a2 = await insertApplicationAt(s, "new");
    a3 = await insertApplicationAt(s, "new");
    a4 = await insertApplicationAt(s, "new");
    own = await insertApplicationAt(s, "new", { becameResidentId: viewer.profileId });
    await cast(s, m(), a1.id, "definitely");
    await cast(s, viewer.context, a1.id, "definitely");
    await cast(s, w.context, a1.id, "good");
    await cast(s, x.context, a1.id, "no");
    await cast(s, viewer.context, a2.id, "good");
    await cast(s, m(), a3.id, "good");
    await cast(s, w.context, a3.id, "good");
    await cast(s, x.context, a3.id, "good");
    await cast(s, m(), a4.id, "good");
  });

  afterEach(async () => {
    await writeSnapshot(s, base);
    await setRoundStatus(s, s.roundId, "open");
    await updateHouseholdSettings(s.hh.context, { revealVoteAuthorship: false }, hhActor(s.hh));
  });

  it("shows the same numbers as the scoreboard, for a scored and an unscored candidate", async () => {
    const board = await getRanking(viewer.context, s.roundId);
    if (board.kind !== "board") throw new Error("not a board");
    const row = board.decided.scored.find((r) => r.applicationId === a1.id)!;
    const scored = expectKind(await detail(a1.id), "scored");
    expect(scored.score).toBe(row.score);
    expect(scored.n).toBe(row.n);
    expect(scored.denominator).toBe(board.rules.denominator);
    expect(scored.explanation.score).toBe(row.score);
    const pending = board.decided.unscored.find((r) => r.applicationId === a2.id)!;
    const unscored = expectKind(await detail(a2.id), "unscored");
    expect(unscored.n).toBe(pending.n);
    expect(unscored.needed).toBe(pending.needed);
  });

  it("an exact x.5 score rounds up on the detail exactly as on the board", async () => {
    // Weights 0 / 2.9 / 2.9 / 4: one "Eher nicht" and one "Finde gut" are a mean of 2.9, so 2.9 / 4 * 100 =
    // 72.5, which the rule rounds up to 73. A share of 0.2 makes one vote enough.
    await writeSnapshot(s, {
      ...base,
      scaleWeights: { no: 0, rather_not: 2.9, good: 2.9, definitely: 4 },
      quorumShare: "0.2",
    });
    const half = await insertApplicationAt(s, "new");
    await cast(s, viewer.context, half.id, "rather_not");
    await cast(s, w.context, half.id, "good");
    const board = await getRanking(viewer.context, s.roundId);
    if (board.kind !== "board") throw new Error("not a board");
    const row = board.decided.scored.find((r) => r.applicationId === half.id)!;
    expect(row.score).toBe(73);
    const scored = expectKind(await detail(half.id), "scored");
    expect(scored.score).toBe(73);
    expect(scored.explanation.percent).toEqual({ text: "72.5", exact: true });
  });

  it("a scored candidate carries the distribution 2/1/0/1, no former votes and the participation", async () => {
    const scored = expectKind(await detail(a1.id), "scored");
    expect(scored.distribution).toEqual({ no: 1, rather_not: 0, good: 1, definitely: 2 });
    expect(scored.formerCount).toBe(0);
    expect(scored.denominator).toBe(5);
    expect(scored.score).toBe(65);
  });

  it("an unscored candidate has no distribution, no score and no explanation key", async () => {
    const unscored = expectKind(await detail(a2.id), "unscored");
    for (const key of ["distribution", "score", "explanation", "authorship"]) expect(key in unscored).toBe(false);
    expect(unscored.n).toBe(1);
    expect(unscored.needed).toBe(3);
  });

  it("the own application is not_found, with hiding on and off and the setting on and off", async () => {
    for (const hide of [true, false]) {
      for (const reveal of [true, false]) {
        await writeSnapshot(s, { ...base, hideResultsUntilVoted: hide, revealVoteAuthorship: reveal });
        expect(await detail(own.id), `hide ${hide}, reveal ${reveal}`).toEqual(NOT_FOUND);
      }
    }
  });

  it("a rejected application opens with its state and its results, without an own vote", async () => {
    await transitionApplication(m(), a3.id, "rejected_by_household");
    const scored = expectKind(await detail(a3.id), "scored");
    expect(scored.application.state).toBe("rejected_by_household");
    expect(scored.score).toBe(60);
    expect(scored.n).toBe(3);
    // Back to `new` for the other cases (a reopened candidate is hidden again for a non-voter).
    await transitionApplication(m(), a3.id, "new");
    expectKind(await detail(a3.id), "hidden");
    await transitionApplication(m(), a3.id, "rejected_by_household");
  });

  it("offer_made and archived are not_found: the board does not hold them", async () => {
    const offer = await insertApplicationAt(s, "offer_made");
    expect(await detail(offer.id)).toEqual(NOT_FOUND);
    // `archived` marks data at the end of its retention and stays off the board (D9).
    const archived = await insertApplicationAt(s, "archived");
    expect(await detail(archived.id)).toEqual(NOT_FOUND);
  });

  it("a round the viewer takes no part in, another household, and a malformed id are all not_found", async () => {
    const outsider = await withSessionContext(m(), (tx) => insertTestRound(tx, s.hh.householdId, "open"));
    const foreign = await insertApplicationAt(s, "new", {}, outsider);
    expect(await detail(foreign.id)).toEqual(NOT_FOUND);

    const other = await pipeline({ reveal: false, moderatorName: "Fremd" });
    const otherApp = await insertApplicationAt(other, "new");
    expect(await detail(otherApp.id)).toEqual(NOT_FOUND);

    expect(await detail("not-a-uuid")).toEqual(NOT_FOUND);
  });

  it("the card port alone refuses a round the viewer takes no part in, whatever the detail does", async () => {
    const outsider = await withSessionContext(m(), (tx) => insertTestRound(tx, s.hh.householdId, "open"));
    const app = await insertApplicationAt(s, "new", {}, outsider);
    const viaOutsider = await withSessionContext(viewer.context, (tx) =>
      getVoteCandidateCardTx(tx, viewer.context, [outsider], app.id),
    );
    expect(viaOutsider).toBeNull();
    // A round the viewer does take part in, but that the caller did not list, is not served either.
    const notListed = await withSessionContext(viewer.context, (tx) =>
      getVoteCandidateCardTx(tx, viewer.context, [outsider], a1.id),
    );
    expect(notListed).toBeNull();
    const own = await withSessionContext(viewer.context, (tx) =>
      getVoteCandidateCardTx(tx, viewer.context, [s.roundId], a1.id),
    );
    expect(own?.applicationId).toBe(a1.id);
  });

  it("a resident without the vote permission is refused not_eligible", async () => {
    expect(await detail(a1.id, stripped.context)).toEqual({ kind: "refused", reason: "not_eligible" });
  });

  it("a round that is not open or paused is refused with its status", async () => {
    await setRoundStatus(s, s.roundId, "closed");
    expect(await detail(a1.id)).toEqual({ kind: "refused", reason: "round_not_available", status: "closed" });
  });

  it("a broken frozen snapshot is rules_invalid on the detail and on the board", async () => {
    await writeSnapshot(s, { ...base, scaleWeights: { no: 0 } });
    expect(await detail(a1.id)).toEqual({ kind: "refused", reason: "rules_invalid" });
    expect(await getRanking(viewer.context, s.roundId)).toEqual({ kind: "refused", reason: "rules_invalid" });
  });

  it("a hidden candidate carries exactly the round and the name and state, and no vote-derived key", async () => {
    const hidden = expectKind(await detail(a4.id), "hidden");
    expect(Object.keys(hidden).sort()).toEqual(["application", "kind", "round"]);
    expect(Object.keys(hidden.application).sort()).toEqual(["id", "name", "state"]);
    expect(hidden.application.state).toBe("new");
  });

  it("with the setting off the payload holds no voter id and no voter name", async () => {
    const scored = expectKind(await detail(a1.id), "scored");
    expect(scored.authorship).toBeNull();
    const unscored = expectKind(await detail(a2.id), "unscored");
    expect(unscored.voters).toBeNull();
    const text = JSON.stringify([scored, unscored]);
    for (const id of [s.moderator.profileId, viewer.profileId, w.profileId, x.profileId]) {
      expect(text).not.toContain(id);
    }
    for (const name of ["Mona", "Vera", "Wanda", "Xaver"]) expect(text).not.toContain(name);
  });

  it("the card has age, message and attributes, and no contact detail", async () => {
    const scored = expectKind(await detail(a1.id), "scored");
    expect(Object.keys(scored.application).sort()).toEqual([
      "age",
      "applicantName",
      "applicationId",
      "attributes",
      "messageRaw",
      "state",
    ]);
    expect(scored.application.age).toBe(27);
    expect(scored.application.attributes).toEqual([{ label: "Beruf", value: "Lehrerin" }]);
    const text = JSON.stringify(scored);
    expect(text).not.toContain("@example.test");
    expect(text).not.toContain("23125");
  });

  it("a household that turns the setting on after opening still gets no names (frozen per round)", async () => {
    await updateHouseholdSettings(s.hh.context, { revealVoteAuthorship: true }, hhActor(s.hh));
    const scored = expectKind(await detail(a1.id), "scored");
    expect(scored.authorship).toBeNull();
  });

  it("a snapshot without the key reads as off, and a string value is rules_invalid on both reads", async () => {
    const withoutKey = { ...base };
    delete withoutKey.revealVoteAuthorship;
    await writeSnapshot(s, withoutKey);
    expect(expectKind(await detail(a1.id), "scored").authorship).toBeNull();

    await writeSnapshot(s, { ...base, revealVoteAuthorship: "true" });
    expect(await detail(a1.id)).toEqual({ kind: "refused", reason: "rules_invalid" });
    expect(await getRanking(viewer.context, s.roundId)).toEqual({ kind: "refused", reason: "rules_invalid" });
  });

  it("the settings write refuses a non-boolean that Postgres would coerce, and leaves the row unchanged", async () => {
    for (const value of ["on", "yes"]) {
      await expect(
        updateHouseholdSettings(s.hh.context, { revealVoteAuthorship: value }, hhActor(s.hh)),
      ).rejects.toThrow(/boolean/);
    }
    const settings = await getHouseholdSettings(s.hh.context);
    expect(settings?.revealVoteAuthorship).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe("getCandidateDetail: the setting on", () => {
  let s: PipelineSetup;
  let viewer: Awaited<ReturnType<typeof claimPlainMember>>;
  let w: Awaited<ReturnType<typeof claimPlainMember>>;
  let b1: Awaited<ReturnType<typeof insertApplicationAt>>;
  let b2: Awaited<ReturnType<typeof insertApplicationAt>>;
  let b3: Awaited<ReturnType<typeof insertApplicationAt>>;
  let own: Awaited<ReturnType<typeof insertApplicationAt>>;
  const m = () => s.moderator.context;

  beforeAll(async () => {
    s = await pipeline({ reveal: true, moderatorName: "Mona" });
    viewer = await claimPlainMember(s.hh, "Vera", accountIds);
    w = await claimPlainMember(s.hh, "Willi", accountIds);
    b1 = await insertApplicationAt(s, "new");
    b2 = await insertApplicationAt(s, "new");
    b3 = await insertApplicationAt(s, "new");
    own = await insertApplicationAt(s, "new", { becameResidentId: viewer.profileId });
    await cast(s, m(), b1.id, "definitely");
    await cast(s, viewer.context, b1.id, "good");
    await cast(s, w.context, b1.id, "good");
    await cast(s, viewer.context, b2.id, "rather_not");
    await cast(s, m(), b3.id, "good");
  });

  afterEach(async () => {
    await updateHouseholdSettings(s.hh.context, { revealVoteAuthorship: true }, hhActor(s.hh));
  });

  it("a scored candidate shows each rating with the voters' names, sorted", async () => {
    const scored = expectKind(await getCandidateDetail(viewer.context, b1.id), "scored");
    expect(scored.authorship).toEqual({ no: [], rather_not: [], good: ["Vera", "Willi"], definitely: ["Mona"] });
  });

  it("an unscored candidate lists who has voted, without any rating", async () => {
    const unscored = expectKind(await getCandidateDetail(viewer.context, b2.id), "unscored");
    expect(unscored.voters).toEqual(["Vera"]);
    expect(JSON.stringify(unscored)).not.toContain("rather_not");
  });

  it("the own application stays not_found with the setting on", async () => {
    expect(await getCandidateDetail(viewer.context, own.id)).toEqual(NOT_FOUND);
  });

  it("a hidden candidate names nobody", async () => {
    const hidden = expectKind(await getCandidateDetail(viewer.context, b3.id), "hidden");
    expect(JSON.stringify(hidden)).not.toContain("Mona");
  });

  it("turning the setting off after opening still shows the names (frozen per round)", async () => {
    await updateHouseholdSettings(s.hh.context, { revealVoteAuthorship: false }, hhActor(s.hh));
    const scored = expectKind(await getCandidateDetail(viewer.context, b1.id), "scored");
    expect(scored.authorship).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe("getCandidateDetail: former members (Q-6, R-4)", () => {
  let s: PipelineSetup;
  let viewer: Awaited<ReturnType<typeof claimPlainMember>>;
  let y: Awaited<ReturnType<typeof claimPlainMember>>;
  let z: Awaited<ReturnType<typeof claimPlainMember>>;
  let c1: Awaited<ReturnType<typeof insertApplicationAt>>;

  beforeAll(async () => {
    s = await pipeline({ reveal: true, moderatorName: "Mona" });
    viewer = await claimPlainMember(s.hh, "Vera", accountIds);
    y = await claimPlainMember(s.hh, "Yoko", accountIds);
    z = await claimPlainMember(s.hh, "Zora", accountIds);
    c1 = await insertApplicationAt(s, "new");
    await cast(s, s.moderator.context, c1.id, "good");
    await cast(s, viewer.context, c1.id, "good");
    await cast(s, y.context, c1.id, "no");
    await cast(s, z.context, c1.id, "definitely");
  });

  afterEach(async () => {
    await reactivateMember(s.hh.context, s.hh.accountId, y.accountId).catch(() => undefined);
  });

  it("a move-out drops the vote, the name and the voter from the denominator; reactivation restores them", async () => {
    const before = expectKind(await getCandidateDetail(viewer.context, c1.id), "scored");
    expect(before.n).toBe(4);
    expect(before.denominator).toBe(4);
    expect(before.formerCount).toBe(0);
    expect(before.authorship!.no).toEqual(["Yoko"]);

    await setMovedOut(s.hh.context, s.hh.accountId, y.accountId);
    const out = expectKind(await getCandidateDetail(viewer.context, c1.id), "scored");
    expect(out.n).toBe(3);
    expect(out.denominator).toBe(3);
    expect(out.formerCount).toBe(1);
    expect(out.distribution.no).toBe(0);
    expect(JSON.stringify(out)).not.toContain("Yoko");
    expect(JSON.stringify(out)).not.toContain(y.profileId);

    // The card port, called for the moved-out viewer themselves, hands nothing back.
    const gone = await withSessionContext(y.context, (tx) =>
      getVoteCandidateCardTx(tx, y.context, [s.roundId], c1.id),
    );
    expect(gone).toBeNull();

    await reactivateMember(s.hh.context, s.hh.accountId, y.accountId);
    const back = expectKind(await getCandidateDetail(viewer.context, c1.id), "scored");
    expect(back.n).toBe(4);
    expect(back.formerCount).toBe(0);
    expect(back.authorship!.no).toEqual(["Yoko"]);
  });
});
