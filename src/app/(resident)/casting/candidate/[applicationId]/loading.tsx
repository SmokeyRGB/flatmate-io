import { SkeletonText } from "@/ui/skeletons";
import { CandidateDetailSkeleton } from "../../candidate-detail-skeleton";

// The full page's skeleton (a direct link or a reload): the back link's shape, then the card's.
export default function CandidateLoading() {
  return (
    <div className="mx-auto max-w-md p-6">
      <CandidateDetailSkeleton lead={<SkeletonText width="w-40" />} />
    </div>
  );
}
