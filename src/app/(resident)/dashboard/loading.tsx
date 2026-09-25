import { de } from "@/ui/strings";
import { SkeletonHeading, SkeletonText } from "@/ui/skeletons";

// design.md Decision 11 (G-N6): heading bar, one featured-card outline, one quiet-card outline —
// no spinner, no layout jump. loading-feedback design.md D6: now composed from the shared
// src/ui/skeletons.tsx shapes (same visual shape as before), so the lint's "imports @/ui/skeletons"
// check holds here too.
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-6" aria-hidden="true">
        <div className="space-y-2">
          <SkeletonHeading />
          <SkeletonText />
        </div>
        <div className="skeleton h-40 w-full rounded-2xl" />
        <div className="skeleton h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}
