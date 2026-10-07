import { describe, expect, it } from "vitest";
import {
  computeRanking,
  explainScore,
  quorumNeeded,
  type RankingCandidate,
  type RankingInput,
} from "@/modules/deliberation/ranking";
import { toScaled, type ScaleWeights } from "@/modules/deliberation/round-rules";
import type { VoteValue } from "@/modules/deliberation/vote-values";

const DEFAULT_WEIGHTS: ScaleWeights = { no: 0, rather_not: 1, good: 3, definitely: 5 };

// `order` is the candidate's position in the port's full-precision (created_at, id) order, so a
// test says "applied first" with a small number.
const cand = (id: string, order: number, ...values: VoteValue[]): RankingCandidate => ({
  id,
  order,
  values,
});

function run(
  candidates: RankingCandidate[],
  over: Partial<Omit<RankingInput, "candidates">> & { share?: number | string } = {},
) {
  const { share, ...rest } = over;
  return computeRanking({
    weights: DEFAULT_WEIGHTS,
    quorumShare: toScaled(share ?? "0.5")!,
    denominator: 4,
    openRoomCount: 0,
    ...rest,
    candidates,
  });
}

// Distinct ids so that the order of two candidates never rests on the id unless a test says so.
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("score (FR-5.1, FR-5.2, C-5.1)", () => {
  it("AC-5.1: No, Like, Like, Must have under default weights is 55", () => {
    const { scored } = run([cand("a", 1, "no", "good", "good", "definitely")], { denominator: 4 });
    expect(scored).toHaveLength(1);
    expect(scored[0]).toMatchObject({ id: "a", score: 55, n: 4 });
  });

  it("AC-5.2: a single Must have is 100", () => {
    const { scored } = run([cand("a", 1, "definitely")], { denominator: 1 });
    expect(scored[0].score).toBe(100);
  });

  it("AC-5.3: a single No is 0, and 0 is a real score", () => {
    const { scored, unscored } = run([cand("a", 1, "no")], { denominator: 1 });
    expect(unscored).toHaveLength(0);
    expect(scored).toHaveLength(1);
    expect(scored[0].score).toBe(0);
    expect("score" in scored[0]).toBe(true);
  });

  it("AC-5.4 / C-5.1: no counted votes is no score, not 0: the row has no score key at all", () => {
    const { scored, unscored } = run([cand("a", 1)], { denominator: 1 });
    expect(scored).toHaveLength(0);
    expect(unscored).toHaveLength(1);
    expect("score" in unscored[0]).toBe(false);
    expect(JSON.stringify(unscored[0])).not.toContain("score");
    expect(Object.keys(unscored[0]).sort()).toEqual(["id", "n", "needed"]);
  });

  it("x.5 rounds up, exactly: a float computation misrounds this case", () => {
    // Weights 0 / 0 / 0.3 / 0.4, votes No + Like: mean 0.15, 0.15 / 0.4 * 100 = 37.5 exactly.
    const weights: ScaleWeights = { no: 0, rather_not: 0, good: 0.3, definitely: 0.4 };
    const naive = Math.round(((weights.no + weights.good) / 2 / weights.definitely) * 100);
    expect(naive).toBe(37); // proof that floats get this wrong
    const { scored } = run([cand("a", 1, "no", "good")], { weights, denominator: 2 });
    expect(scored[0].score).toBe(38);
  });

  it("mixed scales: weights 0 / 1 / 4.5 / 5 give the hand-computed score", () => {
    const weights: ScaleWeights = { no: 0, rather_not: 1, good: 4.5, definitely: 5 };
    // (1 + 4.5 + 5) / 3 / 5 * 100 = 70
    expect(run([cand("a", 1, "rather_not", "good", "definitely")], { weights, denominator: 3 }).scored[0].score).toBe(70);
    // (0 + 4.5) / 2 / 5 * 100 = 45
    expect(run([cand("a", 1, "no", "good")], { weights, denominator: 2 }).scored[0].score).toBe(45);
    // (4.5 + 4.5 + 1) / 3 / 5 * 100 = 66.67 -> 67
    expect(run([cand("a", 1, "good", "good", "rather_not")], { weights, denominator: 3 }).scored[0].score).toBe(67);
  });
});

describe("quorum (FR-5.6, FR-5.7)", () => {
  it("AC-5.7: 7 voters at 0.5 need 4: 3 votes are unscored, 4 are scored", () => {
    const three = run([cand("a", 1, "good", "good", "good")], { denominator: 7 });
    expect(three.scored).toHaveLength(0);
    expect(three.unscored[0]).toMatchObject({ id: "a", n: 3, needed: 4 });
    const four = run([cand("a", 1, "good", "good", "good", "good")], { denominator: 7 });
    expect(four.scored).toHaveLength(1);
  });

  it("AC-5.8: 6 voters at 0.5 need exactly 3", () => {
    const { scored } = run([cand("a", 1, "good", "good", "good")], { denominator: 6 });
    expect(scored).toHaveLength(1);
  });

  it("EC-5.1: one Must have among 7 voters is shown without a score", () => {
    const { scored, unscored } = run([cand("a", 1, "definitely")], { denominator: 7 });
    expect(scored).toHaveLength(0);
    expect(unscored[0]).toMatchObject({ id: "a", n: 1, needed: 4 });
  });

  // design D1 names 0.1 x 30 as the float trap, but in JS that product is exactly 3; the real trap
  // of the same kind is 0.07 x 100 (7.000000000000001, whose float ceil is 8).
  it("a share of 0.07 over 100 voters needs 7, not 8 (a float ceil gives 8)", () => {
    expect(Math.ceil(0.07 * 100)).toBe(8); // proof that floats get this wrong
    expect(quorumNeeded(toScaled("0.07")!, 100)).toBe(7);
    expect(quorumNeeded(toScaled(0.07)!, 100)).toBe(7);
    const seven = Array.from({ length: 7 }, () => "good" as const);
    const { scored } = run([cand("a", 1, ...seven)], { share: "0.07", denominator: 100 });
    expect(scored).toHaveLength(1);
  });

  it("a share of 1 needs every voter, and 0.30 equals 0.3", () => {
    expect(quorumNeeded(toScaled("1")!, 7)).toBe(7);
    expect(quorumNeeded(toScaled("0.30")!, 10)).toBe(quorumNeeded(toScaled("0.3")!, 10));
  });
});

describe("order (FR-5.11 .. FR-5.13, C-5.7, C-5.8)", () => {
  it("score descending is key 2", () => {
    const { scored } = run([cand("low", 1, "rather_not", "rather_not"), cand("high", 2, "good", "good")], { denominator: 2 });
    expect(ids(scored)).toEqual(["high", "low"]);
  });

  it("AC-5.11: equal score, more Must have wins", () => {
    // Weights 0 / 1 / 2 / 4: [Must have, No] = [Like, Like] = 50, but the first holds a Must have.
    const weights: ScaleWeights = { no: 0, rather_not: 1, good: 2, definitely: 4 };
    // The one with more Must haves is created LATER and has the larger id, so only key 3 can put it first.
    const { scored } = run([cand("a", 1, "good", "good"), cand("b", 2, "definitely", "no")], { weights, denominator: 2 });
    expect(scored.map((r) => r.score)).toEqual([50, 50]);
    expect(ids(scored)).toEqual(["b", "a"]);
  });

  it("AC-5.12: equal score and Must haves, fewer No wins", () => {
    // Weights 0 / 1 / 2 / 4: [Rather not, Rather not] = [No, Like] = 25, no Must have in either.
    const weights: ScaleWeights = { no: 0, rather_not: 1, good: 2, definitely: 4 };
    const { scored } = run([cand("a", 1, "no", "good"), cand("b", 2, "rather_not", "rather_not")], { weights, denominator: 2 });
    expect(scored.map((r) => r.score)).toEqual([25, 25]);
    // "a" is older and has the smaller id, so only key 4 can put "b" first.
    expect(ids(scored)).toEqual(["b", "a"]);
  });

  it("AC-5.13: equal on score, Must have and No, the broader base wins", () => {
    const { scored } = run(
      [cand("a", 1, "good", "good"), cand("b", 2, "good", "good", "good", "good")],
      { denominator: 4 },
    );
    expect(scored.map((r) => r.score)).toEqual([60, 60]);
    expect(ids(scored)).toEqual(["b", "a"]);
  });

  it("key 6: identical on keys 1-5, the earlier application is first", () => {
    const { scored } = run([cand("a", 5, "good", "good"), cand("b", 1, "good", "good")], { denominator: 2 });
    expect(ids(scored)).toEqual(["b", "a"]);
  });

  it("AC-5.14 / keys 6+7: identical on keys 1-5, the port's order decides, on every read", () => {
    const input = [cand("c", 3, "good", "good"), cand("a", 1, "good", "good"), cand("b", 2, "good", "good")];
    expect(ids(run(input, { denominator: 2 }).scored)).toEqual(["a", "b", "c"]);
    expect(ids(run([...input].reverse(), { denominator: 2 }).scored)).toEqual(["a", "b", "c"]);
  });

  it("determinism: shuffled input gives the same output", () => {
    const input = [
      cand("a", 4, "good", "good", "definitely"),
      cand("b", 2, "no", "good"),
      cand("c", 3, "good", "good", "good"),
      cand("d", 1, "definitely", "rather_not"),
      cand("e", 5),
      cand("f", 0, "good"),
    ];
    const baseline = run(input, { denominator: 4, openRoomCount: 2 });
    const permutations = [
      [...input].reverse(),
      [input[3], input[0], input[5], input[1], input[4], input[2]],
      [...input.slice(2), ...input.slice(0, 2)],
    ];
    for (const p of permutations) expect(run(p, { denominator: 4, openRoomCount: 2 })).toEqual(baseline);
  });
});

describe("sub-millisecond creation order (Copilot round on PR #54)", () => {
  it("two candidates of one millisecond, ids in the 'wrong' order, follow `order`, scored and unscored", () => {
    // "z" sorts after "a" by id and is the same millisecond; only the port's `order` puts it first.
    const scoredRun = run([cand("a", 2, "good", "good"), cand("z", 1, "good", "good")], { denominator: 2 });
    expect(ids(scoredRun.scored)).toEqual(["z", "a"]);
    const pendingRun = run([cand("a", 2), cand("z", 1)], { denominator: 4 });
    expect(ids(pendingRun.unscored)).toEqual(["z", "a"]);
  });
});

describe("unscored rows (Q-3, EC-5.2, EC-5.3)", () => {
  it("are ordered by the port's order (oldest first), never by anything vote-derived", () => {
    const { scored, unscored } = run(
      [cand("z", 1), cand("y", 4, "good"), cand("b", 3), cand("a", 2, "no")],
      { denominator: 4 }, // needs 2
    );
    expect(scored).toHaveLength(0);
    expect(ids(unscored)).toEqual(["z", "a", "b", "y"]);
    expect(unscored.map((u) => u.n)).toEqual([0, 1, 0, 1]);
  });

  it("EC-5.2: when everyone is below quorum nothing is scored and no placeholder order is invented", () => {
    const { scored, unscored } = run([cand("b", 2, "good"), cand("a", 1, "good")], { denominator: 4 });
    expect(scored).toEqual([]);
    expect(ids(unscored)).toEqual(["a", "b"]);
  });

  it("EC-5.3: with no votes at all every row is unscored with n = 0", () => {
    const { scored, unscored } = run([cand("a", 1), cand("b", 2)], { denominator: 4 });
    expect(scored).toEqual([]);
    expect(unscored.map((u) => u.n)).toEqual([0, 0]);
  });
});

describe("leading rows (R-6, Q-15)", () => {
  const four = () => [
    cand("a", 1, "definitely", "definitely"),
    cand("b", 2, "good", "good"),
    cand("c", 3, "rather_not", "rather_not"),
    cand("d", 4, "no", "no"),
  ];

  it("exactly N rows lead", () => {
    const { scored } = run(four(), { denominator: 2, openRoomCount: 2 });
    expect(scored.map((r) => r.leading)).toEqual([true, true, false, false]);
  });

  it("N = 0 highlights nothing", () => {
    const { scored } = run(four(), { denominator: 2, openRoomCount: 0 });
    expect(scored.every((r) => !r.leading)).toBe(true);
  });

  it("N greater than the number of scored rows highlights every scored row", () => {
    const { scored } = run(four(), { denominator: 2, openRoomCount: 9 });
    expect(scored.every((r) => r.leading)).toBe(true);
  });

  it("a tie at the boundary is decided by the order: exactly N lead", () => {
    const tied = [cand("c", 3, "good", "good"), cand("b", 2, "good", "good"), cand("a", 1, "good", "good")];
    const { scored } = run(tied, { denominator: 2, openRoomCount: 2 });
    expect(ids(scored)).toEqual(["a", "b", "c"]);
    expect(scored.map((r) => r.leading)).toEqual([true, true, false]);
  });

  it("unscored rows never take a slot", () => {
    const { scored, unscored } = run([cand("a", 1, "good", "good"), cand("b", 2, "definitely")], {
      denominator: 4,
      openRoomCount: 2,
    });
    expect(ids(scored)).toEqual(["a"]);
    expect(unscored).toHaveLength(1);
    expect(scored.filter((r) => r.leading)).toHaveLength(1);
  });
});

// Breaks (tasks 3.2), run by hand against ranking.ts:
// - swap keys 3 and 4 -> AC-5.11 / AC-5.12 fail;
// - replace the BigInt score with Math.round on floats -> the "x.5 rounds up, exactly" case fails;
// - replace `needed` with Math.ceil(share * d) on floats -> the 0.07 over 100 case fails;
// - give unscored rows `score: 0` -> the AC-5.4 case fails.

// F5 candidate-detail D4: the arithmetic of the "(?)" must end on the ring's exact score.
describe("explainScore (FR-5.5, AC-5.6, P-3)", () => {

  it("the spec's first worked example: (0 + 3 + 3 + 5) / 4 = 2.75, then 55, both exact", () => {
    const e = explainScore(DEFAULT_WEIGHTS, ["no", "good", "good", "definitely"]);
    expect(e.terms).toEqual(["0", "3", "3", "5"]);
    expect(e.n).toBe(4);
    expect(e.mean.text).toBe("2.75");
    expect(e.mean.exact).toBe(true);
    expect(e.percent.text).toBe("55");
    expect(e.percent.exact).toBe(true);
    expect(e.score).toBe(55);
  });

  it("the spec's second worked example: 3, 3, 5 is about 3.67 and 73.33, score 73, both inexact", () => {
    const e = explainScore(DEFAULT_WEIGHTS, ["good", "good", "definitely"]);
    expect(e.mean.text).toBe("3.67");
    expect(e.mean.exact).toBe(false);
    expect(e.percent.text).toBe("73.33");
    expect(e.percent.exact).toBe(false);
    expect(e.score).toBe(73);
  });

  it("2.75 is exact and 11/3 is not", () => {
    expect(explainScore(DEFAULT_WEIGHTS, ["no", "good", "good", "definitely"]).mean.exact).toBe(true);
    expect(explainScore(DEFAULT_WEIGHTS, ["good", "good", "definitely"]).mean.exact).toBe(false);
  });

  it("an exact x.5 percentage is shown as such and rounds up", () => {
    const w: ScaleWeights = { no: 0, rather_not: 2.9, good: 2.9, definitely: 4 };
    const e = explainScore(w, ["rather_not", "good"]);
    expect(e.percent.text).toBe("72.5");
    expect(e.percent.exact).toBe(true);
    expect(e.score).toBe(73);
  });

  it("agrees with computeRanking over every multiset of 1..6 votes, decimal weights and x.5 included", () => {
    const weightSets: ScaleWeights[] = [
      DEFAULT_WEIGHTS,
      { no: 0, rather_not: 1, good: 4.5, definitely: 5 },
      { no: 0, rather_not: 0.5, good: 2.5, definitely: 5 },
      { no: 0, rather_not: 2.9, good: 2.9, definitely: 4 },
      { no: 1, rather_not: 1, good: 1, definitely: 1 },
      { no: 0, rather_not: 0.07, good: 0.33, definitely: 7 },
    ];
    const kinds: VoteValue[] = ["no", "rather_not", "good", "definitely"];
    let checked = 0;
    const walk = (weights: ScaleWeights, picked: VoteValue[], from: number, size: number) => {
      if (picked.length === size) {
        const { scored } = computeRanking({
          weights,
          quorumShare: toScaled("0.01")!,
          denominator: 1,
          openRoomCount: 0,
          candidates: [{ id: "x", order: 0, values: picked }],
        });
        expect(explainScore(weights, picked).score, JSON.stringify([weights, picked])).toBe(scored[0].score);
        checked += 1;
        return;
      }
      for (let i = from; i < kinds.length; i++) walk(weights, [...picked, kinds[i]], i, size);
    };
    for (const weights of weightSets) for (let size = 1; size <= 6; size++) walk(weights, [], 0, size);
    expect(checked).toBe(weightSets.length * (4 + 10 + 20 + 35 + 56 + 84));
  });
});
