import { describe, expect, it } from "vitest";
import { formatExplanation } from "@/app/(resident)/casting/format-explanation";
import { explainScore } from "@/modules/deliberation/ranking";

// The four lines of candidate-detail design D4, with de-DE decimals.
describe("formatExplanation", () => {
  it("an exact mean and an exact percentage end on the score without a rounding arrow", () => {
    const e = explainScore({ no: 0, rather_not: 1, good: 3, definitely: 5 }, ["no", "good", "good", "definitely"]);
    expect(formatExplanation(e)).toBe("(0 + 3 + 3 + 5) ÷ 4 = 2,75 → 2,75 ÷ 5 × 100 = 55");
  });

  it("a mean that does not terminate is marked ≈ and ends on the exact score", () => {
    const e = explainScore({ no: 0, rather_not: 1, good: 3, definitely: 5 }, ["good", "good", "definitely"]);
    expect(formatExplanation(e)).toBe("(3 + 3 + 5) ÷ 3 ≈ 3,67 → 3,67 ÷ 5 × 100 ≈ 73,33 → 73");
  });

  it("another highest weight is shown as such", () => {
    const e = explainScore({ no: 0, rather_not: 4, good: 5, definitely: 6 }, ["rather_not", "good"]);
    expect(formatExplanation(e)).toBe("(4 + 5) ÷ 2 = 4,5 → 4,5 ÷ 6 × 100 = 75");
  });

  it("an exact x.5 percentage names the rounding", () => {
    const e = explainScore({ no: 0, rather_not: 2.9, good: 2.9, definitely: 4 }, ["rather_not", "good"]);
    expect(formatExplanation(e)).toBe("(2,9 + 2,9) ÷ 2 = 2,9 → 2,9 ÷ 4 × 100 = 72,5 → 73 (x,5 aufgerundet)");
  });
});
