import { describe, expect, it } from "vitest";
import {
  parseRoundRules,
  parseScaleWeights,
  toCommonScale,
  toScaled,
} from "@/modules/deliberation/round-rules";

const valid = { no: 0, rather_not: 1, good: 3, definitely: 5 };

describe("parseScaleWeights (EC-4.11)", () => {
  it("accepts exactly the four keys with finite non-negative numbers", () => {
    expect(parseScaleWeights(valid)).toEqual(valid);
    expect(parseScaleWeights({ no: 0, rather_not: 0, good: 4.5, definitely: 10 })).toEqual({
      no: 0,
      rather_not: 0,
      good: 4.5,
      definitely: 10,
    });
  });

  it("refuses a missing key", () => {
    expect(parseScaleWeights({ no: 0, rather_not: 1, good: 3 })).toBeNull();
  });

  it("refuses an extra key", () => {
    expect(parseScaleWeights({ ...valid, maybe: 2 })).toBeNull();
  });

  it("refuses a key replaced by a foreign one (right count, wrong names)", () => {
    expect(parseScaleWeights({ no: 0, rather_not: 1, good: 3, maybe: 5 })).toBeNull();
  });

  it("refuses a numeric string", () => {
    expect(parseScaleWeights({ ...valid, good: "3" })).toBeNull();
  });

  it("refuses NaN, Infinity and negatives", () => {
    expect(parseScaleWeights({ ...valid, good: Number.NaN })).toBeNull();
    expect(parseScaleWeights({ ...valid, good: Number.POSITIVE_INFINITY })).toBeNull();
    expect(parseScaleWeights({ ...valid, no: -1 })).toBeNull();
  });

  it("refuses null, undefined, arrays and scalars", () => {
    expect(parseScaleWeights(null)).toBeNull();
    expect(parseScaleWeights(undefined)).toBeNull();
    expect(parseScaleWeights([0, 1, 3, 5])).toBeNull();
    expect(parseScaleWeights(5)).toBeNull();
    expect(parseScaleWeights("x")).toBeNull();
  });

  it("refuses a nested object as a value", () => {
    expect(parseScaleWeights({ ...valid, good: { n: 3 } })).toBeNull();
  });

  // Break (tasks 5.1): make the parser return defaults on failure -> the malformed cases fail.

  it("refuses all-zero weights (EC-5.6: max(weights) = 0 would divide by zero)", () => {
    expect(parseScaleWeights({ no: 0, rather_not: 0, good: 0, definitely: 0 })).toBeNull();
    // one non-zero weight is enough
    expect(parseScaleWeights({ no: 0, rather_not: 0, good: 0, definitely: 1 })).not.toBeNull();
  });

  it("refuses a weight that is not readable as a plain decimal (1e-7)", () => {
    expect(parseScaleWeights({ ...valid, rather_not: 1e-7 })).toBeNull();
  });

  it("keeps 4.5 valid", () => {
    expect(parseScaleWeights({ ...valid, good: 4.5 })).toEqual({ ...valid, good: 4.5 });
  });
});

describe("toScaled (exact decimals, design D1)", () => {
  it("reads integers and fractions exactly", () => {
    expect(toScaled(5)).toEqual({ units: BigInt(5), scale: 0 });
    expect(toScaled(4.5)).toEqual({ units: BigInt(45), scale: 1 });
    expect(toScaled("0.50")).toEqual({ units: BigInt(50), scale: 2 });
  });

  it("reads 0.30000000000000004 as exactly that decimal (17 digits)", () => {
    expect(toScaled(0.1 + 0.2)).toEqual({ units: BigInt("30000000000000004"), scale: 17 });
  });

  it("refuses exponent notation, signs, whitespace and non-numbers", () => {
    expect(toScaled(1e-7)).toBeNull();
    expect(toScaled(1e21)).toBeNull();
    expect(toScaled(-1)).toBeNull();
    expect(toScaled("+1")).toBeNull();
    expect(toScaled(" 0.5")).toBeNull();
    expect(toScaled("0.5 ")).toBeNull();
    expect(toScaled("1e3")).toBeNull();
    expect(toScaled(".5")).toBeNull();
    expect(toScaled("5.")).toBeNull();
    expect(toScaled("")).toBeNull();
    expect(toScaled("abc")).toBeNull();
    expect(toScaled(Number.NaN)).toBeNull();
    expect(toScaled(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toScaled(null)).toBeNull();
    expect(toScaled(undefined)).toBeNull();
    expect(toScaled(true)).toBeNull();
  });

  it("brings values of different scales to the largest one", () => {
    const common = toCommonScale([toScaled(0)!, toScaled(1)!, toScaled(4.5)!, toScaled(5)!]);
    expect(common.scale).toBe(1);
    expect(common.units).toEqual([BigInt(0), BigInt(10), BigInt(45), BigInt(50)]);
  });
});

describe("parseRoundRules (EC-5.5, EC-5.6, Q-7)", () => {
  const snapshot = (over: Record<string, unknown> = {}) => ({
    scaleWeights: valid,
    favoriteBudgetFactor: 1.5,
    hideResultsUntilVoted: true,
    quorumShare: "0.5",
    ...over,
  });

  it("reads a well-formed snapshot", () => {
    const rules = parseRoundRules(snapshot());
    expect(rules).toEqual({
      weights: valid,
      quorumShare: { units: BigInt(5), scale: 1 },
      hideResultsUntilVoted: true,
    });
  });

  it("accepts the share as string or number, with or without trailing zeros, and 1", () => {
    expect(parseRoundRules(snapshot({ quorumShare: "0.5" }))).not.toBeNull();
    expect(parseRoundRules(snapshot({ quorumShare: "0.50" }))).not.toBeNull();
    expect(parseRoundRules(snapshot({ quorumShare: 0.5 }))).not.toBeNull();
    expect(parseRoundRules(snapshot({ quorumShare: "1" }))).not.toBeNull();
    expect(parseRoundRules(snapshot({ quorumShare: "1.00" }))).not.toBeNull();
  });

  it("refuses a share outside (0, 1] or not readable", () => {
    for (const quorumShare of ["0", "0.0", "1.01", "abc", " 0.5", null, undefined, -0.5, "1e-1"]) {
      expect(parseRoundRules(snapshot({ quorumShare })), String(quorumShare)).toBeNull();
    }
  });

  it("refuses a hide flag that is not a boolean", () => {
    for (const hideResultsUntilVoted of ["true", "yes", 1, null, undefined]) {
      expect(parseRoundRules(snapshot({ hideResultsUntilVoted })), String(hideResultsUntilVoted)).toBeNull();
    }
    expect(parseRoundRules(snapshot({ hideResultsUntilVoted: false }))).not.toBeNull();
  });

  it("refuses broken weights, including all-zero", () => {
    expect(parseRoundRules(snapshot({ scaleWeights: { no: 0, rather_not: 0, good: 0, definitely: 0 } }))).toBeNull();
    expect(parseRoundRules(snapshot({ scaleWeights: { no: 0 } }))).toBeNull();
    expect(parseRoundRules(snapshot({ scaleWeights: undefined }))).toBeNull();
  });

  it("refuses a snapshot that is not an object", () => {
    expect(parseRoundRules(null)).toBeNull();
    expect(parseRoundRules(undefined)).toBeNull();
    expect(parseRoundRules([])).toBeNull();
    expect(parseRoundRules("x")).toBeNull();
  });
});
