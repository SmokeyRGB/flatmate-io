import type { ScoreExplanation } from "@/modules/deliberation/ranking";
import { de } from "@/ui/strings";

// The "(?)" arithmetic of the candidate detail as one line of text (FR-5.5, AC-5.6, P-3), pure.
// `explainScore` hands over plain decimals with dots; this file only localises them (de-DE comma)
// and marks what was rounded: "≈" where the shown mean or percentage is not exact. The last
// number is always the exact score the ring shows.
//
//   (0 + 3 + 3 + 5) ÷ 4 = 2,75 → 2,75 ÷ 5 × 100 = 55
//   (3 + 3 + 5) ÷ 3 ≈ 3,67 → 3,67 ÷ 5 × 100 ≈ 73,33 → 73
//   (5 + 4) ÷ 2 = 4,5 → 4,5 ÷ 6 × 100 = 75
//   (2,9 + 2,9) ÷ 2 = 2,9 → 2,9 ÷ 4 × 100 = 72,5 → 73 (x,5 aufgerundet)
const comma = (text: string) => text.replace(".", ",");

export function formatExplanation(e: ScoreExplanation): string {
  const sign = (exact: boolean) => (exact ? "=" : "≈");
  const mean = comma(e.mean.text);
  const percent = comma(e.percent.text);
  const parts = [
    `(${e.terms.map(comma).join(" + ")}) ÷ ${e.n} ${sign(e.mean.exact)} ${mean}`,
    `${mean} ÷ ${comma(e.max)} × 100 ${sign(e.percent.exact)} ${percent}`,
  ];
  // The rounding step is named only when it changed the number shown just before it.
  if (e.percent.text !== String(e.score)) {
    const halfUp = e.percent.exact && e.percent.text.endsWith(".5");
    parts.push(halfUp ? `${e.score} ${de.casting.detail.roundedUp}` : String(e.score));
  }
  return parts.join(" → ");
}
