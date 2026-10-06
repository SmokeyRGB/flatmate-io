import { VOTE_VALUES, type VoteValue } from "./vote-values";

export type ScaleWeights = Record<VoteValue, number>;

// An exact decimal: `units / 10^scale`. The ranking computes in BigInt on these, so that no
// floating-point error moves a score across a .5 boundary or a quorum across a whole vote
// (design D1: 0.1 × 30 is 3.0000000000000004 as a float, whose ceil is 4).
export interface Scaled {
  units: bigint;
  scale: number;
}

// Plain decimal only: digits, optionally one dot and more digits. No sign, no exponent, no
// whitespace. Non-negative by construction.
const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

// Reads a value exactly from its decimal string (`String(n)` for a number, the string as given).
// Exponent notation (`1e-7`), NaN, +-Infinity and anything else give null: a frozen rule that
// cannot be read exactly is refused, never rounded (design D1, D2). There is no digit cap, since
// a cap would freeze a round holding a share like 0.3333333 as permanently unreadable.
export function toScaled(value: unknown): Scaled | null {
  let text: string;
  if (typeof value === "number") text = String(value);
  else if (typeof value === "string") text = value;
  else return null;
  if (!PLAIN_DECIMAL.test(text)) return null;
  const dot = text.indexOf(".");
  if (dot === -1) return { units: BigInt(text), scale: 0 };
  const fraction = text.slice(dot + 1);
  return { units: BigInt(text.slice(0, dot) + fraction), scale: fraction.length };
}

// 10^k as a BigInt. No BigInt literals: the target is ES2017 (tsc refuses `10n`, TS2737).
export function pow10(k: number): bigint {
  return BigInt(10) ** BigInt(k);
}

// Brings several scaled values to one common scale (the largest), so a sum never adds values of
// different scales.
export function toCommonScale(values: Scaled[]): { units: bigint[]; scale: number } {
  const scale = values.reduce((max, v) => (v.scale > max ? v.scale : max), 0);
  return { units: values.map((v) => v.units * pow10(scale - v.scale)), scale };
}

// Reads the frozen weights out of a round's `settings_snapshot.scaleWeights` (FR-4.10, C-4.4).
// Exactly the four keys, each a finite number >= 0 that reads as a plain decimal (fractions are
// fine, 4.5 is valid); extra keys are refused too, and so are weights that are all zero
// (max(weights) = 0 would divide by zero, EC-5.6). There is no default: a round whose frozen
// weights are missing or malformed is refused rather than scored with invented numbers
// (EC-4.11), because falling back would silently change the arithmetic.
export function parseScaleWeights(raw: unknown): ScaleWeights | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== VOTE_VALUES.length) return null;
  const out = {} as ScaleWeights;
  let largest = 0;
  for (const value of VOTE_VALUES) {
    if (!Object.prototype.hasOwnProperty.call(record, value)) return null;
    const n = record[value];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
    if (toScaled(n) === null) return null;
    if (n > largest) largest = n;
    out[value] = n;
  }
  if (largest <= 0) return null;
  return out;
}

export interface RoundRules {
  weights: ScaleWeights;
  quorumShare: Scaled;
  hideResultsUntilVoted: boolean;
}

// Reads all three frozen rules the ranking needs from a round's snapshot (FR-5.4, FR-5.6,
// FR-5.15; EC-5.5, EC-5.6; human decision Q-7). Null when any of them is unusable: the caller
// refuses the ranking with `rules_invalid`, and never computes it with fallback values. The
// snapshot stores the quorum share as a decimal string ("0.5", read back from `numeric`), so a
// number is accepted too.
export function parseRoundRules(snapshot: unknown): RoundRules | null {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) return null;
  const record = snapshot as Record<string, unknown>;
  const weights = parseScaleWeights(record.scaleWeights);
  if (weights === null) return null;
  const quorumShare = toScaled(record.quorumShare);
  if (quorumShare === null) return null;
  // 0 < share <= 1
  if (quorumShare.units <= BigInt(0) || quorumShare.units > pow10(quorumShare.scale)) return null;
  if (typeof record.hideResultsUntilVoted !== "boolean") return null;
  return { weights, quorumShare, hideResultsUntilVoted: record.hideResultsUntilVoted };
}
