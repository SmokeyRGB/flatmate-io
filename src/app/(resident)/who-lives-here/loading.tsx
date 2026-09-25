import { de } from "@/ui/strings";
import { SkeletonHeading, SkeletonList } from "@/ui/skeletons";

// design.md D3/D6: who-lives-here/page.tsx's shape — back-link, heading, the caution callout, and
// the member list.
export default function WhoLivesHereLoading() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-4" aria-hidden="true">
        <SkeletonHeading />
        <div className="skeleton h-12 w-full rounded-xl" />
        <SkeletonList rows={3} />
      </div>
    </div>
  );
}
