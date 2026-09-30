import { describe, expect, it } from "vitest";
import { parseScaleWeights } from "@/modules/deliberation/scale-weights";

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
});
