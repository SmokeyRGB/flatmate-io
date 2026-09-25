import { de } from "@/ui/strings";
import { SkeletonForm } from "@/ui/skeletons";

// design.md Decision 6: A3's Laden state. Shown before the link is resolved, so it cannot know
// which of the two shapes (neutral/bound) follows — it is shaped like the BOUND form, the shorter
// of the two, so a neutral form only ever grows the card downward by one field row and nothing
// already visible (the heading, the chip) ever moves (§6's "kein Layoutsprung").
//
// Review fix (§12): the bars carry no text, so a visually hidden status line gives assistive tech
// something to announce, and the bars themselves are hidden from it.
//
// loading-feedback design.md D6: the card itself now comes from the shared SkeletonForm shape
// (same visual shape as before — two fields and a submit-button bar).
export default function JoinLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.join.loading}
      </p>
      <div className="space-y-6" aria-hidden="true">
        <div className="skeleton h-8 w-2/3" />
        <div className="skeleton h-7 w-1/2 rounded-full" />
        <SkeletonForm fields={2} />
      </div>
    </div>
  );
}
