import { de } from "@/ui/strings";
import { SkeletonText } from "@/ui/skeletons";

// The shape of the deck: a thin progress bar, one tall card, and a row of four pill buttons at the
// bottom (composed from the shared src/ui/skeletons.tsx shapes, loading-feedback design.md D6).
export default function ScreeningLoading() {
  return (
    <div className="deck-screen mx-auto flex max-w-md flex-col gap-3 px-4 pt-3" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-3" aria-hidden="true">
        <SkeletonText width="w-full" />
        <div className="skeleton h-72 w-full rounded-2xl" />
      </div>
      <div className="rating-bar" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
