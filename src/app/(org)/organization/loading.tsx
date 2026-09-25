import { de } from "@/ui/strings";
import { SkeletonCard, SkeletonHeading } from "@/ui/skeletons";

// design.md D3/D6: organization/page.tsx's shape — heading, the active-round featured card, and
// the row of secondary links below it.
export default function OrganizationLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-6" aria-hidden="true">
        <SkeletonHeading />
        <div className="skeleton h-32 w-full rounded-2xl" />
        <SkeletonCard lines={1} />
      </div>
    </div>
  );
}
