import { LoadingStatus } from "@/ui/loading-status";
import { SkeletonHeading, SkeletonList, SkeletonText } from "@/ui/skeletons";

// design.md D3/D6: members/page.tsx's shape — back-link, heading, and the member list.
export default function MembersLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6" aria-busy="true">
      <LoadingStatus />
      <div className="space-y-6" aria-hidden="true">
        <SkeletonText width="w-24" />
        <SkeletonHeading />
        <SkeletonList rows={4} />
      </div>
    </div>
  );
}
