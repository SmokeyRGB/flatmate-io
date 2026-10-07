"use client";

import type { ScaleWeights } from "@/modules/deliberation/round-rules";
import { VOTE_VALUES } from "@/modules/deliberation/vote-values";
import { useStrings } from "@/ui/strings/provider";

// The round's frozen weights, one line per rating, with the favourite note on the top one. Shared
// by the screening pass's "(?)" pop-over and the scoreboard's, so the two cannot word the same
// weights differently (DRY). A client component: it reads the language with useStrings.
export function WeightsList({ weights }: { weights: ScaleWeights }) {
  const t = useStrings().screening;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {VOTE_VALUES.map((v) => (
        <li key={v}>
          {t.ratings[v]}: {t.points(weights[v])}
          {v === "definitely" && <> {t.favouriteNote}</>}
        </li>
      ))}
    </ul>
  );
}
