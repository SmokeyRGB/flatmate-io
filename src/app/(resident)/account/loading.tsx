import { de } from "@/ui/strings";
import { SkeletonHeading, SkeletonText } from "@/ui/skeletons";

// design.md Decision 11 (G-N6): a skeleton in the shape of heading and body, no spinner.
// loading-feedback design.md D6: now composed from the shared src/ui/skeletons.tsx shapes (same
// visual shape as before).
export default function AccountLoading() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-4" aria-hidden="true">
        <SkeletonText width="w-24" />
        <SkeletonHeading width="w-40" />
        <div className="skeleton h-16 w-full" />
      </div>
    </div>
  );
}
