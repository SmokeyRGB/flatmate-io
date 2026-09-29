import { de } from "@/ui/strings";
import { SkeletonCard, SkeletonHeading } from "@/ui/skeletons";

// The application detail's shape: back-link, name and badge, a facts card, the notice block.
export default function ApplicationDetailLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-6" aria-hidden="true">
        <SkeletonHeading />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );
}
