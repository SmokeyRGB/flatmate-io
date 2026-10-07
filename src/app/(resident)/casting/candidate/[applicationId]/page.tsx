import { CandidateDetailView } from "../../candidate-detail-view";

// The candidate detail as a full page: a direct link, a reload, a shared address. The same server
// component as the sliding sheet, so the two cannot differ in what they show (design D1).
export default async function CandidatePage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  return (
    <div className="mx-auto max-w-md p-6">
      <CandidateDetailView applicationId={applicationId} mode="page" />
    </div>
  );
}
