import { LoadingStatus } from "@/ui/loading-status";
import { SkeletonText } from "@/ui/skeletons";

// The shape of the deck: a thin progress bar, one tall card, and a row of four pill buttons at the
// bottom (composed from the shared src/ui/skeletons.tsx shapes, loading-feedback design.md D6).
export default function ScreeningLoading() {
  return (
    <div className="deck-screen mx-auto flex max-w-md flex-col gap-3 px-4 pt-3" aria-busy="true">
      <LoadingStatus />
      <SkeletonText width="w-full" />
      <div className="skeleton min-h-0 w-full flex-1 rounded-2xl" aria-hidden="true" />
      <div className="rating-bar" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
