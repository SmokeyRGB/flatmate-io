import { de } from "@/ui/strings";
import { SkeletonHeading, SkeletonText } from "@/ui/skeletons";

// loading-feedback design.md D6: now composed from the shared src/ui/skeletons.tsx shapes (same
// visual shape as before).
export default function ScreeningLoading() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-4" aria-hidden="true">
        <SkeletonText width="w-24" />
        <SkeletonHeading width="w-40" />
        <div className="skeleton h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}
