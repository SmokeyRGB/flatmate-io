import { LoadingStatus } from "@/ui/loading-status";
import { SkeletonCard, SkeletonHeading, SkeletonText } from "@/ui/skeletons";

// organisation-task-list D4: organization/page.tsx's shape — context line, the status sentence, the
// progress bar, the one wide button, and the row of section tiles.
export default function OrganizationLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6" aria-busy="true">
      <LoadingStatus />
      <div className="space-y-6" aria-hidden="true">
        <SkeletonText />
        <SkeletonHeading width="w-3/4" />
        <div className="skeleton h-1.5 w-full rounded-full" />
        <div className="skeleton h-12 w-full rounded-full" />
        <div className="grid grid-cols-3 gap-2">
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </div>
      </div>
    </div>
  );
}
