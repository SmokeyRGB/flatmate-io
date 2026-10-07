import { CandidateDetailView } from "../../../candidate-detail-view";

// The intercepted candidate: content only, the frame is this segment's layout.tsx.
export default async function InterceptedCandidatePage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  return <CandidateDetailView applicationId={applicationId} mode="sheet" />;
}
