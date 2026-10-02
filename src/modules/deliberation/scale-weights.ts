import { VOTE_VALUES, type VoteValue } from "./vote-values";

export type ScaleWeights = Record<VoteValue, number>;

// Reads the frozen weights out of a round's `settings_snapshot.scaleWeights` (FR-4.10, C-4.4).
// Exactly the four keys, each a finite number >= 0; extra keys are refused too. There is no
// default: a round whose frozen weights are missing or malformed is refused rather than scored
// with invented numbers (EC-4.11), because falling back would silently change the arithmetic.
export function parseScaleWeights(raw: unknown): ScaleWeights | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== VOTE_VALUES.length) return null;
  const out = {} as ScaleWeights;
  for (const value of VOTE_VALUES) {
    if (!Object.prototype.hasOwnProperty.call(record, value)) return null;
    const n = record[value];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
    out[value] = n;
  }
  return out;
}
