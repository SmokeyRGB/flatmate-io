import { SkeletonHeading } from "@/ui/skeletons";
import { CandidateDetailSkeleton } from "../../../candidate-detail-skeleton";

// The card's skeleton: content only, inside the layout's sheet frame.
export default function InterceptedCandidateLoading() {
  return <CandidateDetailSkeleton lead={<SkeletonHeading width="w-40" />} />;
}
