import type { ScaleWeights } from "@/modules/deliberation/round-rules";
import { VOTE_VALUES } from "@/modules/deliberation/vote-values";
import { de } from "@/ui/strings";

const t = de.screening;

// The round's frozen weights, one line per rating, with the favourite note on the top one. Shared
// by the screening pass's "(?)" pop-over and the scoreboard's, so the two cannot word the same
// weights differently (DRY). Server-safe: no hooks, no client state.
export function WeightsList({ weights }: { weights: ScaleWeights }) {
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
