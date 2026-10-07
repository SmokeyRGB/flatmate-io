import { VOTE_VALUES, type VoteValue } from "./vote-values";
import { pow10, toCommonScale, toScaled, type Scaled, type ScaleWeights } from "./round-rules";

// The ranking arithmetic, pure and database-free so that every number on the scoreboard can be
// checked on paper (P-3). Sources: domain/rechenmodelle.md section 8.1 (score) and 8.3 (order and
// quorum), FR-5.1, FR-5.6, FR-5.11, C-5.1.
//
// The caller passes the COUNTED votes only: the repository has already dropped withdrawn votes
// and the votes of voters who left the quorum denominator (human decision Q-6). Nothing here
// reads the clock, the database or the household's live settings.
//
// All arithmetic is exact. Weights may be fractions and the quorum share is a decimal, so floats
// would misround (0.07 * 100 is 7.000000000000001, whose ceil is 8). Each weight and the share
// are read as scaled integers and every sum is a BigInt. There are no BigInt literals, since
// the TypeScript target is ES2017.

export interface RankingCandidate {
  id: string;
  // The candidate's position in the port's full-precision (created_at, id) order: the combined
  // keys 6 and 7. A JS Date keeps milliseconds only, so two applications of one millisecond
  // could swap if this were re-derived from a Date and an id.
  order: number;
  // The counted votes' values, one entry per counted vote.
  values: VoteValue[];
}

export interface RankedEntry {
  id: string;
  // 0..100. A real score; a candidate without counted votes is never in this list (C-5.1).
  score: number;
  n: number;
  // Among the first N scored rows, N being the round's open rooms (R-6, Q-15).
  leading: boolean;
}

// An unscored row has NO `score` key at all, so a 0 cannot stand in for NO_SCORE by accident
// (AC-5.4, C-5.1).
export interface PendingEntry {
  id: string;
  n: number;
  needed: number;
}

export interface RankingInput {
  weights: ScaleWeights;
  quorumShare: Scaled;
  denominator: number;
  openRoomCount: number;
  candidates: RankingCandidate[];
}

// ceil(share * denominator), exactly (FR-5.6, FR-5.7): at the default 0.5, 7 voters need 4 and 6
// need 3.
export function quorumNeeded(quorumShare: Scaled, denominator: number): number {
  const divisor = pow10(quorumShare.scale);
  const product = quorumShare.units * BigInt(denominator);
  return Number((product + divisor - BigInt(1)) / divisor);
}

// The last step of the score, the ONE definition both `computeRanking` and `explainScore` use
// (candidate-detail design D4, so the arithmetic on a detail can never drift from the ring):
// round_half_up(mean / max * 100), exactly: floor((2 * sum * 100 + n * max) / (2 * n * max)). `sum`
// and `max` are on one common scale, `n` is the number of counted votes (> 0).
function scoreFromSum(sum: bigint, n: number, max: bigint): number {
  const bigN = BigInt(n);
  const two = BigInt(2);
  const hundred = BigInt(100);
  return Number((two * sum * hundred + bigN * max) / (two * bigN * max));
}

// A decimal as plain text with a dot ("2.75", "4.5", "55"), so the explanation is JSON-safe (no
// BigInt reaches a payload) and the screen only has to localise the separator.
function decimalText(units: bigint, scale: number): string {
  const digits = units.toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale).replace(/0+$/, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

// A decimal shown to `places` places, rounded half up, and whether that rounding lost anything (so
// the display can say "≈").
export interface ShownDecimal {
  text: string;
  exact: boolean;
}

function showDecimal(numerator: bigint, denominator: bigint, places: number): ShownDecimal {
  const scaled = numerator * pow10(places);
  const two = BigInt(2);
  const units = (two * scaled + denominator) / (two * denominator);
  return { text: decimalText(units, places), exact: scaled % denominator === BigInt(0) };
}

// How one candidate's score came about, for the detail's "(?)" (FR-5.5, AC-5.6, P-3). Pure, and all
// strings and numbers, so it survives JSON.
export interface ScoreExplanation {
  // The weight of each counted vote, weakest rating first, as exact decimal text.
  terms: string[];
  n: number;
  // The highest weight of the round.
  max: string;
  // The mean of the terms and the raw percentage, each shown to two places. The percentage is
  // computed from the EXACT mean, never from the shown one.
  mean: ShownDecimal;
  percent: ShownDecimal;
  score: number;
}

export function explainScore(weights: ScaleWeights, values: VoteValue[]): ScoreExplanation {
  const scaledWeights = VOTE_VALUES.map((value) => toScaled(weights[value]));
  if (scaledWeights.some((w) => w === null)) {
    throw new Error("explainScore: weights must be validated by parseScaleWeights first");
  }
  const common = toCommonScale(scaledWeights as Scaled[]);
  const unitsByValue = {} as Record<VoteValue, bigint>;
  VOTE_VALUES.forEach((value, i) => {
    unitsByValue[value] = common.units[i];
  });
  const maxUnits = common.units.reduce((a, b) => (b > a ? b : a), BigInt(0));
  if (maxUnits <= BigInt(0)) throw new Error("explainScore: max(weights) must be > 0");
  const n = values.length;
  if (n === 0) throw new Error("explainScore: a candidate without counted votes has no score");

  const ordered = [...values].sort((a, b) => VOTE_VALUES.indexOf(a) - VOTE_VALUES.indexOf(b));
  const sum = ordered.reduce((acc, v) => acc + unitsByValue[v], BigInt(0));
  const bigN = BigInt(n);
  return {
    terms: ordered.map((v) => decimalText(unitsByValue[v], common.scale)),
    n,
    max: decimalText(maxUnits, common.scale),
    mean: showDecimal(sum, bigN * pow10(common.scale), 2),
    percent: showDecimal(sum * BigInt(100), bigN * maxUnits, 2),
    score: scoreFromSum(sum, n, maxUnits),
  };
}

interface Keyed {
  id: string;
  // Constant 0 in this release (no veto exists), kept as key 1 so the comparator never changes shape.
  veto: number;
  order: number;
  n: number;
  score: number;
  definitely: number;
  no: number;
}

export function computeRanking(input: RankingInput): { scored: RankedEntry[]; unscored: PendingEntry[] } {
  const { weights, quorumShare, denominator, openRoomCount, candidates } = input;

  // One common scale for all four weights before any sum.
  const scaledWeights = VOTE_VALUES.map((value) => toScaled(weights[value]));
  if (scaledWeights.some((w) => w === null)) {
    throw new Error("computeRanking: weights must be validated by parseScaleWeights first");
  }
  const common = toCommonScale(scaledWeights as Scaled[]);
  const unitsByValue = {} as Record<VoteValue, bigint>;
  VOTE_VALUES.forEach((value, i) => {
    unitsByValue[value] = common.units[i];
  });
  const max = common.units.reduce((a, b) => (b > a ? b : a), BigInt(0));
  if (max <= BigInt(0)) throw new Error("computeRanking: max(weights) must be > 0");

  const needed = quorumNeeded(quorumShare, denominator);

  const ranked: Keyed[] = [];
  const pending: { id: string; order: number; n: number }[] = [];

  for (const c of candidates) {
    const n = c.values.length;
    if (n >= needed && n > 0) {
      let sum = BigInt(0);
      let definitely = 0;
      let no = 0;
      for (const v of c.values) {
        sum += unitsByValue[v];
        if (v === "definitely") definitely += 1;
        if (v === "no") no += 1;
      }
      const score = scoreFromSum(sum, n, max);
      ranked.push({ id: c.id, veto: 0, order: c.order, n, score, definitely, no });
    } else {
      pending.push({ id: c.id, order: c.order, n });
    }
  }

  // The seven-key order (FR-5.11, C-5.8).
  ranked.sort(
    (a, b) =>
      a.veto - b.veto || //               1. veto block sinks (inert)
      b.score - a.score || //             2. score descending
      b.definitely - a.definitely || //   3. more "Must have" wins
      a.no - b.no || //                   4. fewer "No" wins
      b.n - a.n || //                     5. broader vote base wins
      a.order - b.order, //               6+7. who applied first, then the determinism anchor: the
      //                                       port's full-precision (created_at, id) order
  );

  // Below quorum: oldest application first, never by anything vote-derived (Q-3, F-9).
  pending.sort((a, b) => a.order - b.order);

  const slots = Math.max(0, Math.min(openRoomCount, ranked.length));
  return {
    scored: ranked.map((r, i) => ({ id: r.id, score: r.score, n: r.n, leading: i < slots })),
    unscored: pending.map((p) => ({ id: p.id, n: p.n, needed })),
  };
}
