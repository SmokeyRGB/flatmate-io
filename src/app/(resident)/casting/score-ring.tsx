"use client";

import { useStrings } from "@/ui/strings/provider";

// The circular progress ring: the score inside, a text equivalent for the whole (FR-5.10, AC-5.28).
// `pathLength` normalises the circle to 100, so the dash is the score itself. Shared by the
// scoreboard rows and the candidate detail (the second use, candidate-detail design D8).
export function ScoreRing({ score, n }: { score: number; n: number }) {
  const t = useStrings().casting;
  return (
    <div className="score-ring" role="img" aria-label={t.ringLabel(score, n)}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className="score-ring-track" cx="22" cy="22" r="19" fill="none" strokeWidth="4" />
        <circle
          className="score-ring-fill"
          cx="22"
          cy="22"
          r="19"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${score} 100`}
        />
      </svg>
      <span className="score-ring-value" aria-hidden="true">
        {score}
      </span>
    </div>
  );
}
