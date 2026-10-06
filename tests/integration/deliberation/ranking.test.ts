import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import {
  createAndOpenRound,
  createRoom,
  transitionRoomStatus,
  updateHouseholdSettings,
} from "@/modules/casting/repository";
import { castingRound, room } from "@/modules/casting/schema";
import { castVote, getRanking, type Ranking } from "@/modules/deliberation/repository";
import { vote } from "@/modules/deliberation/schema";
import { registerHousehold } from "@/modules/identity/auth";
import { reactivateMember, removeMember, setMovedOut } from "@/modules/identity/repository";
import { membership } from "@/modules/identity/schema";
import { insertTestRound } from "../../helpers/applications";
import {
  cleanupAll,
  cleanupHousehold,
  createTestModerator,
  deleteTestAccount,
  testEmail,
  type TestHousehold,
} from "../../helpers/identity";
import {
  claimPlainMember,
  grantPermissions,
  insertApplicationAt,
  type PipelineSetup,
} from "../../helpers/pipeline";
import { addParticipation, rawVoteInsertSql, setRoundStatus } from "../../helpers/votes";

// F5 change 1 (ranking), group 6: getRanking, the scoreboard's visibility-enforcing read.
//
// G-D2 stays `pending` in test/guarded.manifest.json (human decision 2026-10-06). The "former
// members" describe below tests its OPEN-round half (a moved-out voter leaves the quorum
// denominator). The closed-round half ("votes count on in closed rounds") needs a close path,
// which the human will build in the finalization of F3. `guarded-tests.ts` checks only entries
// marked `implemented`, so deleting this file turns nothing red until G-D2 is `implemented`.
//
// A claimed active resident is a participant of every open round, so a non-participant is built
// with insertTestRound and no participation. Multi-voter fixtures are built once per describe
// (each Auth claim costs seconds on dev). Teardown is in afterAll, never in a `finally`.

const households: TestHousehold[] = [];
const accountIds: string[] = [];

// registerTestHousehold() tracks its promise in an in-flight set that tests/setup.ts's global
// afterEach sweeps after EVERY test, which would delete a household meant to live across a whole
// describe's tests. So the shared fixtures register through registerHousehold directly, which the
// sweep does not track, and are torn down in afterAll (the pattern of authorization-matrix.test.ts).
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

// setupPipeline's shape (a moderator who is a resident, one room, one open round), over a shared
// household.
async function sharedPipeline(): Promise<PipelineSetup> {
  const hh = await registerSharedHousehold();
  const moderator = await createTestModerator(hh);
  const actor = { accountId: moderator.accountId, profileId: moderator.profileId };
  const r = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
  const round = await createAndOpenRound(moderator.context, "Round", [r.id], actor);
  return { hh, moderator, roundId: round.id };
}

afterAll(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  accountIds.length = 0;
  households.length = 0;
});

// Explicit, increasing created_at so list orders are asserted, not incidental.
const base = Date.now() - 3_600_000;
const at = (n: number) => new Date(base + n * 1000);

type Board = Extract<Ranking, { kind: "board" }>;

async function board(context: SessionContext, roundId: string | null): Promise<Board> {
  const ranking = await getRanking(context, roundId);
  expect(ranking.kind).toBe("board");
  if (ranking.kind !== "board") throw new Error(`not a board: ${JSON.stringify(ranking)}`);
  return ranking;
}

const cast = (s: PipelineSetup, context: SessionContext, applicationId: string, value: Parameters<typeof castVote>[1]["value"]) =>
  castVote(context, { roundId: s.roundId, applicationId, value });

const idsOf = (rows: { applicationId: string }[]) => rows.map((r) => r.applicationId);

async function patchSnapshot(s: PipelineSetup, patch: Record<string, unknown>, roundId = s.roundId) {
  await withSessionContext(s.moderator.context, async (tx) => {
    const [row] = await tx
      .select({ snapshot: castingRound.settingsSnapshot })
      .from(castingRound)
      .where(eq(castingRound.id, roundId));
    await tx
      .update(castingRound)
      .set({ settingsSnapshot: { ...(row.snapshot as Record<string, unknown>), ...patch } })
      .where(eq(castingRound.id, roundId));
  });
}

const DEFAULT_WEIGHTS = { no: 0, rather_not: 1, good: 3, definitely: 5 };
const hhActor = (hh: TestHousehold) => ({ accountId: hh.accountId, profileId: null });

// ---------------------------------------------------------------------------------------------
describe("getRanking: the frozen rules (AC-5.5, F-1) and broken rules (EC-5.5, EC-5.6, Q-7)", () => {
  let s: PipelineSetup;
  let viewer: Awaited<ReturnType<typeof claimPlainMember>>;
  beforeAll(async () => {
    s = await sharedPipeline();
    viewer = await claimPlainMember(s.hh, "Prüfer", accountIds);
  });

  it("AC-5.5: weights, quorum share and hiding come from the snapshot, not from the live settings", async () => {
    const voted = await insertApplicationAt(s, "new", { createdAt: at(1) });
    const unvoted = await insertApplicationAt(s, "new", { createdAt: at(2) });
    await cast(s, viewer.context, voted.id, "good");
    const before = await board(viewer.context, s.roundId);
    // Two voters (moderator, viewer) at 0.5: one vote reaches quorum. good = 3 of max 5: 60.
    expect(before.rules).toMatchObject({ denominator: 2, needed: 1 });
    expect(before.scored.find((r) => r.applicationId === voted.id)).toMatchObject({ score: 60, n: 1 });
    expect(idsOf(before.hidden)).toContain(unvoted.id);

    await updateHouseholdSettings(
      s.hh.context,
      {
        scaleWeights: { ...DEFAULT_WEIGHTS, good: 4 },
        quorumShare: "1",
        hideResultsUntilVoted: false,
      },
      hhActor(s.hh),
    );

    const after = await board(viewer.context, s.roundId);
    expect(after.rules.weights.good).toBe(3);
    expect(after.rules.needed).toBe(1);
    expect(after.scored.find((r) => r.applicationId === voted.id)).toMatchObject({ score: 60, n: 1 });
    // Hiding still follows the frozen flag: the unvoted application stays hidden.
    expect(idsOf(after.hidden)).toContain(unvoted.id);
  });

  it("EC-5.5/5.6: broken frozen rules are refused rules_invalid, and a good snapshot is the positive control", async () => {
    const good = { scaleWeights: DEFAULT_WEIGHTS, quorumShare: "0.5", hideResultsUntilVoted: true };
    const cases: Array<[string, Record<string, unknown>]> = [
      ["all-zero weights", { scaleWeights: { no: 0, rather_not: 0, good: 0, definitely: 0 } }],
      ["a missing weight", { scaleWeights: { no: 0, rather_not: 1, good: 3 } }],
      ["share 0", { quorumShare: 0 }],
      ["share '0'", { quorumShare: "0" }],
      ["share '1.5'", { quorumShare: "1.5" }],
      ["share 'x'", { quorumShare: "x" }],
      ["hide flag 'yes'", { hideResultsUntilVoted: "yes" }],
    ];
    for (const [label, patch] of cases) {
      await withSessionContext(s.moderator.context, (tx) =>
        tx
          .update(castingRound)
          .set({ settingsSnapshot: { ...good, ...patch } })
          .where(eq(castingRound.id, s.roundId)),
      );
      expect(await getRanking(viewer.context, s.roundId), label).toEqual({ kind: "refused", reason: "rules_invalid" });
      expect(await getRanking(viewer.context, null), `${label} (no round named)`).toEqual({
        kind: "refused",
        reason: "rules_invalid",
      });
    }
    await withSessionContext(s.moderator.context, (tx) =>
      tx.update(castingRound).set({ settingsSnapshot: good }).where(eq(castingRound.id, s.roundId)),
    );
    expect((await getRanking(viewer.context, s.roundId)).kind).toBe("board");
  });
});

// ---------------------------------------------------------------------------------------------
describe("getRanking: results hidden until the viewer's own vote (V-4)", () => {
  let s: PipelineSetup;
  let viewer: Awaited<ReturnType<typeof claimPlainMember>>;
  beforeAll(async () => {
    s = await sharedPipeline();
    viewer = await claimPlainMember(s.hh, "Prüferin", accountIds);
  });

  it("AC-5.15/5.16: an unvoted candidate is listed by name with exactly three keys and no result", async () => {
    const a = await insertApplicationAt(s, "new", { createdAt: at(1) });
    const ranking = await board(viewer.context, s.roundId);
    const hiddenRow = ranking.hidden.find((r) => r.applicationId === a.id);
    expect(hiddenRow).toBeDefined();
    expect(Object.keys(hiddenRow!).sort()).toEqual(["applicantName", "applicationId", "state"]);
    expect(hiddenRow!.applicantName).toBe(a.applicantName);
    expect(idsOf(ranking.scored)).not.toContain(a.id);
    expect(idsOf(ranking.unscored)).not.toContain(a.id);
  });

  it("AC-5.17: casting a vote reveals that candidate on the next read", async () => {
    const a = await insertApplicationAt(s, "new", { createdAt: at(2) });
    expect(idsOf((await board(viewer.context, s.roundId)).hidden)).toContain(a.id);
    await cast(s, viewer.context, a.id, "good");
    const after = await board(viewer.context, s.roundId);
    expect(idsOf(after.hidden)).not.toContain(a.id);
    expect(after.scored.find((r) => r.applicationId === a.id)).toMatchObject({ score: 60, n: 1 });
  });

  it("AC-5.18: voted on A but not on B: A is visible, B is hidden", async () => {
    const a = await insertApplicationAt(s, "new", { createdAt: at(3) });
    const b = await insertApplicationAt(s, "new", { createdAt: at(4) });
    await cast(s, viewer.context, a.id, "rather_not");
    const ranking = await board(viewer.context, s.roundId);
    expect([...idsOf(ranking.scored), ...idsOf(ranking.unscored)]).toContain(a.id);
    expect(idsOf(ranking.hidden)).toContain(b.id);
    expect(idsOf(ranking.hidden)).not.toContain(a.id);
  });

  it("AC-5.19: a vote at another stage alone reveals nothing", async () => {
    const c = await insertApplicationAt(s, "new", { createdAt: at(5) });
    await withSessionContext(viewer.context, (tx) =>
      tx.execute(
        rawVoteInsertSql({
          householdId: s.hh.householdId,
          roundId: s.roundId,
          applicationId: c.id,
          residentProfileId: viewer.profileId,
          stage: "offer",
        }),
      ),
    );
    const ranking = await board(viewer.context, s.roundId);
    expect(idsOf(ranking.hidden)).toContain(c.id);
    expect(idsOf(ranking.scored)).not.toContain(c.id);
    expect(idsOf(ranking.unscored)).not.toContain(c.id);
  });

  it("EC-5.12: withdrawing the viewer's vote hides the candidate again", async () => {
    const d = await insertApplicationAt(s, "new", { createdAt: at(6) });
    await cast(s, viewer.context, d.id, "good");
    expect(idsOf((await board(viewer.context, s.roundId)).hidden)).not.toContain(d.id);
    await withSessionContext(viewer.context, (tx) =>
      tx.update(vote).set({ withdrawnAt: new Date() }).where(eq(vote.applicationId, d.id)),
    );
    expect(idsOf((await board(viewer.context, s.roundId)).hidden)).toContain(d.id);
  });

  it("hidden rows come back oldest first, then by id, whatever the insertion order", async () => {
    const late = await insertApplicationAt(s, "new", { createdAt: at(30) });
    const early = await insertApplicationAt(s, "new", { createdAt: at(10) });
    const middle = await insertApplicationAt(s, "new", { createdAt: at(20) });
    const ranking = await board(viewer.context, s.roundId);
    const ours = idsOf(ranking.hidden).filter((id) => [late.id, early.id, middle.id].includes(id));
    expect(ours).toEqual([early.id, middle.id, late.id]);
  });

  it("R-7: a candidate invited before the viewer voted stays hidden, also after the viewer's other votes", async () => {
    const invited = await insertApplicationAt(s, "invited", { createdAt: at(40) });
    const other = await insertApplicationAt(s, "new", { createdAt: at(41) });
    expect(idsOf((await board(viewer.context, s.roundId)).hidden)).toContain(invited.id);
    await cast(s, viewer.context, other.id, "good");
    const after = await board(viewer.context, s.roundId);
    expect(idsOf(after.hidden)).toContain(invited.id);
    expect(after.hidden.find((r) => r.applicationId === invited.id)!.state).toBe("invited");
    expect(idsOf(after.scored)).not.toContain(invited.id);
    expect(idsOf(after.unscored)).not.toContain(invited.id);
  });

  it("R-7: an unvoted `new` candidate in a paused round stays hidden", async () => {
    const waiting = await insertApplicationAt(s, "new", { createdAt: at(50) });
    await setRoundStatus(s, s.roundId, "paused");
    const ranking = await board(viewer.context, null); // the newest open or paused round
    expect(ranking.round.status).toBe("paused");
    expect(idsOf(ranking.hidden)).toContain(waiting.id);
    await setRoundStatus(s, s.roundId, "open");
  });

  it("with hiding off in the snapshot every candidate is visible, voted or not", async () => {
    const unvoted = await insertApplicationAt(s, "new", { createdAt: at(60) });
    await patchSnapshot(s, { hideResultsUntilVoted: false });
    const ranking = await board(viewer.context, s.roundId);
    expect(ranking.hidden).toEqual([]);
    expect([...idsOf(ranking.scored), ...idsOf(ranking.unscored)]).toContain(unvoted.id);
    await patchSnapshot(s, { hideResultsUntilVoted: true });
  });
});

// ---------------------------------------------------------------------------------------------
describe("getRanking: the viewer's own application does not exist (V-1)", () => {
  let s: PipelineSetup;
  let viewer: Awaited<ReturnType<typeof claimPlainMember>>;
  let other: Awaited<ReturnType<typeof claimPlainMember>>;
  let own: Awaited<ReturnType<typeof insertApplicationAt>>;
  let control: Awaited<ReturnType<typeof insertApplicationAt>>;
  beforeAll(async () => {
    s = await sharedPipeline();
    viewer = await claimPlainMember(s.hh, "Eigentümerin", accountIds);
    other = await claimPlainMember(s.hh, "Zweiter", accountIds);
    // One open room, so exactly one row leads (N = 1).
    const [r] = await withSessionContext(s.hh.context, (tx) => tx.select({ id: room.id }).from(room));
    await transitionRoomStatus(s.hh.context, r.id, "open", hhActor(s.hh));
    own = await insertApplicationAt(s, "new", { createdAt: at(1), becameResidentId: viewer.profileId });
    control = await insertApplicationAt(s, "new", { createdAt: at(2) });
    // Three voters (moderator, viewer, other): quorum needs 2. The own application gets two
    // 'Must have' votes, so without V-1 it would be the first, leading row.
    await cast(s, s.moderator.context, own.id, "definitely");
    await cast(s, other.context, own.id, "definitely");
    await cast(s, s.moderator.context, control.id, "good");
    await cast(s, other.context, control.id, "good");
    await cast(s, viewer.context, control.id, "good");
  });

  async function expectAbsent(context: SessionContext, label: string) {
    const ranking = await board(context, null);
    const all = [...idsOf(ranking.scored), ...idsOf(ranking.unscored), ...idsOf(ranking.hidden)];
    expect(all, label).not.toContain(own.id);
    expect(JSON.stringify(ranking), label).not.toContain(own.applicantName);
    // It takes no highlight slot: the one open room goes to the control row.
    expect(ranking.scored.map((r) => [r.applicationId, r.leading]), label).toEqual([[control.id, true]]);
  }

  it("AC-5.24/5.27: absent from every list, with no leading slot, open or paused, hiding on or off", async () => {
    for (const status of ["open", "paused"] as const) {
      await setRoundStatus(s, s.roundId, status);
      for (const hide of [true, false]) {
        await patchSnapshot(s, { hideResultsUntilVoted: hide });
        await expectAbsent(viewer.context, `${status}, hide=${hide}`);
      }
    }
    await setRoundStatus(s, s.roundId, "open");
    await patchSnapshot(s, { hideResultsUntilVoted: true });
  });

  it("AC-5.25: everyone else sees it scored, first and leading", async () => {
    const ranking = await board(other.context, null);
    expect(ranking.scored.map((r) => [r.applicationId, r.score, r.leading])).toEqual([
      [own.id, 100, true],
      [control.id, 60, false],
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("getRanking: former members leave the quorum denominator (G-D2 open-round half, Q-6, R-4)", () => {
  let s: PipelineSetup;
  let v1: Awaited<ReturnType<typeof claimPlainMember>>;
  let v2: Awaited<ReturnType<typeof claimPlainMember>>;
  let v3: Awaited<ReturnType<typeof claimPlainMember>>;
  let x: Awaited<ReturnType<typeof insertApplicationAt>>;
  let y: Awaited<ReturnType<typeof insertApplicationAt>>;
  let z: Awaited<ReturnType<typeof insertApplicationAt>>;
  let w: Awaited<ReturnType<typeof insertApplicationAt>>;
  const m = () => s.moderator.context;

  beforeAll(async () => {
    s = await sharedPipeline();
    // Four voters (moderator + three) at 0.5: quorum needs 2.
    v1 = await claimPlainMember(s.hh, "Eins", accountIds);
    v2 = await claimPlainMember(s.hh, "Zwei", accountIds);
    v3 = await claimPlainMember(s.hh, "Drei", accountIds);
    x = await insertApplicationAt(s, "new", { createdAt: at(1) });
    z = await insertApplicationAt(s, "new", { createdAt: at(2) });
    y = await insertApplicationAt(s, "new", { createdAt: at(3) });
    w = await insertApplicationAt(s, "new", { createdAt: at(4) });
    await cast(s, m(), x.id, "good");
    await cast(s, v1.context, x.id, "no");
    await cast(s, m(), z.id, "good");
    await cast(s, v1.context, z.id, "no");
    await cast(s, v3.context, z.id, "good");
    await cast(s, m(), y.id, "good");
    await cast(s, v2.context, y.id, "good");
    await cast(s, m(), w.id, "good");
    await cast(s, v3.context, w.id, "good");
  });

  const row = (b: Board, id: string) =>
    b.scored.find((r) => r.applicationId === id) ?? b.unscored.find((r) => r.applicationId === id);

  it("a move-out takes the vote out of score, count and numerator, and the voter out of the denominator; reactivation restores it", async () => {
    const before = await board(m(), s.roundId);
    expect(before.rules).toMatchObject({ denominator: 4, needed: 2 });
    expect(before.scored.find((r) => r.applicationId === x.id)).toMatchObject({ score: 30, n: 2 });
    expect(before.scored.find((r) => r.applicationId === z.id)).toMatchObject({ score: 40, n: 3 });

    await setMovedOut(s.hh.context, s.hh.accountId, v1.accountId);
    const out = await board(m(), s.roundId);
    expect(out.rules).toMatchObject({ denominator: 3, needed: 2 });
    // X had 2 votes, now 1 < 2: it falls back to unscored, with the real count.
    expect(row(out, x.id)).toMatchObject({ n: 1, needed: 2 });
    expect(out.unscored.map((r) => r.applicationId)).toContain(x.id);
    expect("score" in row(out, x.id)!).toBe(false);
    // Z loses the 'No' vote: (3 + 3) / 2 / 5 = 60 from two votes, not 40 from three.
    expect(out.scored.find((r) => r.applicationId === z.id)).toMatchObject({ score: 60, n: 2 });

    await reactivateMember(s.hh.context, s.hh.accountId, v1.accountId);
    const back = await board(m(), s.roundId);
    expect(back.rules).toMatchObject({ denominator: 4, needed: 2 });
    expect(back.scored.find((r) => r.applicationId === x.id)).toMatchObject({ score: 30, n: 2 });
    expect(back.scored.find((r) => r.applicationId === z.id)).toMatchObject({ score: 40, n: 3 });
  });

  it("a removed member's vote leaves in the same way", async () => {
    expect((await board(m(), s.roundId)).scored.map((r) => r.applicationId)).toContain(y.id);
    await removeMember(s.hh.context, s.hh.accountId, v2.accountId, "Zwei");
    const out = await board(m(), s.roundId);
    expect(out.rules).toMatchObject({ denominator: 3, needed: 2 });
    expect(out.unscored.find((r) => r.applicationId === y.id)).toMatchObject({ n: 1, needed: 2 });
    expect(out.scored.map((r) => r.applicationId)).not.toContain(y.id);
  });

  it("EC-5.12: withdrawing a vote moves a candidate from scored to unscored and back", async () => {
    expect((await board(m(), s.roundId)).scored.map((r) => r.applicationId)).toContain(w.id);
    await withSessionContext(v3.context, (tx) =>
      tx.update(vote).set({ withdrawnAt: new Date() }).where(eq(vote.applicationId, w.id)),
    );
    const down = await board(m(), s.roundId);
    expect(down.unscored.find((r) => r.applicationId === w.id)).toMatchObject({ n: 1 });
    expect(down.scored.map((r) => r.applicationId)).not.toContain(w.id);
    await cast(s, v3.context, w.id, "good");
    expect((await board(m(), s.roundId)).scored.find((r) => r.applicationId === w.id)).toMatchObject({ n: 2 });
  });
});

// ---------------------------------------------------------------------------------------------
describe("getRanking: the highlight follows the round's open rooms (Q-15)", () => {
  let hh: TestHousehold;
  let s: PipelineSetup;
  let rooms: { id: string }[];
  const leadingCount = async () => {
    const ranking = await board(s.moderator.context, s.roundId);
    return { ranking, leading: ranking.scored.filter((r) => r.leading).length };
  };

  beforeAll(async () => {
    hh = await registerSharedHousehold();
    const moderator = await createTestModerator(hh);
    rooms = [];
    for (const label of ["Zimmer A", "Zimmer B", "Zimmer C"]) {
      rooms.push(await createRoom(hh.context, label, hhActor(hh)));
    }
    const round = await createAndOpenRound(
      moderator.context,
      "Runde",
      rooms.map((r) => r.id),
      { accountId: moderator.accountId, profileId: moderator.profileId },
    );
    s = { hh, moderator, roundId: round.id };
    // One voter (the moderator), so one vote reaches quorum; three distinct scores.
    const values = ["definitely", "good", "rather_not"] as const;
    for (const [i, value] of values.entries()) {
      const app = await insertApplicationAt(s, "new", { createdAt: at(i + 1) });
      await cast(s, moderator.context, app.id, value);
    }
  });

  it("exactly one row leads per open room, and only open, undeleted rooms count", async () => {
    expect((await leadingCount()).leading).toBe(0); // all three rooms are planned
    await transitionRoomStatus(hh.context, rooms[0].id, "open", hhActor(hh));
    await transitionRoomStatus(hh.context, rooms[1].id, "open", hhActor(hh));
    const two = await leadingCount();
    expect(two.ranking.openRoomCount).toBe(2);
    expect(two.ranking.scored.map((r) => r.leading)).toEqual([true, true, false]);

    await transitionRoomStatus(hh.context, rooms[1].id, "on_hold", hhActor(hh));
    const one = await leadingCount();
    expect(one.ranking.openRoomCount).toBe(1);
    expect(one.ranking.scored.map((r) => r.leading)).toEqual([true, false, false]);

    await transitionRoomStatus(hh.context, rooms[2].id, "open", hhActor(hh));
    expect((await leadingCount()).leading).toBe(2);
    await transitionRoomStatus(hh.context, rooms[2].id, "not_available", hhActor(hh));
    expect((await leadingCount()).leading).toBe(1);
  });
  // `promised` and `deleted_at` cannot be reached through real paths for a room in an open round
  // (removeRoom refuses it, open -> promised is not F1-reachable). Both are invariant guards
  // covered by the `status = 'open' AND deleted_at IS NULL` predicate of getRoundTallyBasisTx.
});

// ---------------------------------------------------------------------------------------------
describe("getRanking: who may ask, and a stale context (V-2)", () => {
  let s: PipelineSetup;
  let viewer: Awaited<ReturnType<typeof claimPlainMember>>;
  let stripped: Awaited<ReturnType<typeof claimPlainMember>>;
  let revoked: Awaited<ReturnType<typeof claimPlainMember>>;
  beforeAll(async () => {
    s = await sharedPipeline();
    viewer = await claimPlainMember(s.hh, "Teilnehmerin", accountIds);
    stripped = await claimPlainMember(s.hh, "Ohnerecht", accountIds);
    revoked = await claimPlainMember(s.hh, "Widerrufen", accountIds);
  });

  it("a round the viewer does not take part in, and a malformed id, get the same bare refusal", async () => {
    const outsider = await withSessionContext(s.moderator.context, (tx) => insertTestRound(tx, s.hh.householdId, "open"));
    await insertApplicationAt(s, "new", {}, outsider);
    expect(await getRanking(viewer.context, outsider)).toEqual({ kind: "refused", reason: "not_eligible" });
    expect(await getRanking(viewer.context, "not-a-uuid")).toEqual({ kind: "refused", reason: "not_eligible" });
  });

  it("a draft or closed round by address is refused with its status named", async () => {
    for (const status of ["draft", "closed"] as const) {
      const round = await withSessionContext(s.moderator.context, (tx) => insertTestRound(tx, s.hh.householdId, status));
      await addParticipation(s.hh, round, viewer.profileId);
      expect(await getRanking(viewer.context, round), status).toEqual({
        kind: "refused",
        reason: "round_not_available",
        status,
      });
    }
  });

  it("a resident without the vote permission is refused not_eligible", async () => {
    await grantPermissions(s.hh, stripped.accountId, []);
    expect(await getRanking(stripped.context, s.roundId)).toEqual({ kind: "refused", reason: "not_eligible" });
    expect(await getRanking(stripped.context, null)).toEqual({ kind: "refused", reason: "not_eligible" });
  });

  it("a context whose membership was revoked after it was built is refused not_eligible (design D5)", async () => {
    expect((await getRanking(revoked.context, s.roundId)).kind).toBe("board");
    await withSessionContext(s.hh.context, (tx) =>
      tx
        .update(membership)
        .set({ revokedAt: new Date(), permissions: [] })
        .where(eq(membership.accountId, revoked.accountId)),
    );
    expect(await getRanking(revoked.context, s.roundId)).toEqual({ kind: "refused", reason: "not_eligible" });
    expect(await getRanking(revoked.context, null)).toEqual({ kind: "refused", reason: "not_eligible" });
  });

  it("with no open or paused round the answer is none, and a closed one by address is named", async () => {
    expect((await getRanking(viewer.context, null)).kind).toBe("board");
    await setRoundStatus(s, s.roundId, "closed");
    expect(await getRanking(viewer.context, null)).toEqual({ kind: "none" });
    expect(await getRanking(viewer.context, s.roundId)).toEqual({
      kind: "refused",
      reason: "round_not_available",
      status: "closed",
    });
  });
});
