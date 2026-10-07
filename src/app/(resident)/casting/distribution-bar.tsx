"use client";

import { VOTE_VALUES, type VoteValue } from "@/modules/deliberation/vote-values";
import { useStrings } from "@/ui/strings/provider";

// In the voting buttons' order, weakest to strongest, left to right (human correction 2026-10-07):
// „1× Nein, 0× Eher nicht, 1× Finde gut, 2× Unbedingt". VOTE_VALUES is that order, used as it is.

const SEGMENT_CLASS: Record<VoteValue, string> = {
  no: "dist-seg-no",
  rather_not: "dist-seg-rather-not",
  good: "dist-seg-good",
  definitely: "dist-seg-definitely",
};

// How the four ratings split for one candidate (FR-5.20, FR-5.21): four segments in the rating
// colours, and the whole of it as visible text, which is also the bar's accessible name, so colour
// is never the only signal and a screen reader gets every count. With the round's frozen
// authorship flag on, `authorship` lists the voters' display names under each rating. A server
// component: no hooks, no client state.
export function DistributionBar({
  distribution,
  authorship,
}: {
  distribution: Record<VoteValue, number>;
  authorship: Record<VoteValue, string[]> | null;
}) {
  const s = useStrings();
  const t = s.casting.detail;
  const text = VOTE_VALUES.map((v) => t.distributionPart(distribution[v], s.screening.ratings[v])).join(", ");
  return (
    <div className="space-y-2">
      <div className="distribution-bar" role="img" aria-label={t.distributionLabel(text)}>
        {VOTE_VALUES.filter((v) => distribution[v] > 0).map((v) => (
          <span key={v} className={SEGMENT_CLASS[v]} style={{ flexGrow: distribution[v] }} />
        ))}
      </div>
      <p className="text-sm" aria-hidden="true">
        {text}
      </p>
      {authorship && (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">{t.authorshipHeading}</h3>
          <ul className="space-y-0.5 text-sm">
            {VOTE_VALUES.map((v) => (
              <li key={v}>
                <span className="font-medium">{s.screening.ratings[v]}:</span>{" "}
                {authorship[v].length > 0 ? authorship[v].join(", ") : t.nobody}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
