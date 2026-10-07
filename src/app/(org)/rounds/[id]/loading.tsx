import { LoadingStatus } from "@/ui/loading-status";
import { SkeletonHeading, SkeletonList } from "@/ui/skeletons";

// design.md D3/D6, application-pipeline D2: rounds/[id]/page.tsx's shape — one panel-round holding
// the header (title and status) and the list of applications.
export default function RoundDetailLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6" aria-busy="true">
      <LoadingStatus />
      <div className="space-y-6" aria-hidden="true">
        <div className="panel-round space-y-5">
          <SkeletonHeading />
          <SkeletonList rows={3} />
        </div>
      </div>
    </div>
  );
}
