import { de } from "@/ui/strings";
import { SkeletonForm, SkeletonHeading } from "@/ui/skeletons";

// design.md D3/D6: rounds/new/page.tsx's shape — back-link, heading, and RoundForm's own card.
export default function NewRoundLoading() {
  return (
    <div className="mx-auto max-w-md space-y-6 p-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-6" aria-hidden="true">
        <SkeletonHeading />
        <SkeletonForm fields={1} />
      </div>
    </div>
  );
}
