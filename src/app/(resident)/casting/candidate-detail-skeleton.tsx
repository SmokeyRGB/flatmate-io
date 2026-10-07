import type { ReactNode } from "react";
import { de } from "@/ui/strings";
import { SkeletonCard, SkeletonCircle, SkeletonText } from "@/ui/skeletons";

// The shape of the candidate detail while it loads: the card, then a ring with two lines, then the
// distribution bar (loading-feedback design D6). Content only: the sheet's own frame is the
// intercepted segment's layout, so the skeleton and the content share one frame. `lead` is what
// sits above the card, which each loading.tsx composes from the shared shapes.
export function CandidateDetailSkeleton({ lead }: { lead?: ReactNode }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-4" aria-hidden="true">
        {lead}
        <SkeletonCard lines={3} />
        <div className="ranking-row">
          <SkeletonCircle />
          <div className="flex-1 space-y-2">
            <SkeletonText width="w-2/3" />
            <SkeletonText width="w-1/3" />
          </div>
        </div>
        <div className="skeleton h-4 w-full" />
      </div>
    </div>
  );
}
