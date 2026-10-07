import { redirect } from "next/navigation";
import { INVITE_PERMISSION } from "@/app/(org)/rounds/[id]/applications/invite-text";
import { holdsPermission } from "@/app/holds-permission";
import { landingPathFor } from "@/app/landing";
import { getStartOverview } from "@/modules/casting/repository";
import { getAwaitingVoteCounts, getCandidateDetail } from "@/modules/deliberation/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { shouldOpenScreening } from "../dashboard/dashboard-view";
import { CandidateDetailBody } from "./candidate-detail-body";

// F5 candidate-detail, screen D2. ONE server component for both of its frames (design D1): the
// sliding sheet (`mode: "sheet"`, the intercepted route) and the full page (`mode: "page"`, a direct
// link or a reload). It reads through `getCandidateDetail`, so visibility cannot differ between the
// two, and it applies the same "vote first" redirect as the scoreboard (Q-2). It must NOT import
// `DetailSheet` or anything that imports `ViewTransition`: that element is missing from the React
// vitest loads, which would leave this module unrenderable in tests (design D1, finding 10).
export async function CandidateDetailView({
  applicationId,
  mode,
}: {
  applicationId: string;
  mode: "sheet" | "page";
}) {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");
  if (current.context.profileId === null) redirect(landingPathFor(current.context));

  // One round of reads: the redirect check and the detail are independent, so a card opens after one
  // round trip; the detail read is wasted only in the rare case that redirects. „Einladen" is offered
  // from the stored permission, never from a role; the repository function behind it refuses again.
  const [overview, awaitingVotes, detail, holdsInvite] = await Promise.all([
    getStartOverview(current.context),
    getAwaitingVoteCounts(current.context),
    getCandidateDetail(current.context, applicationId),
    holdsPermission(current.context, INVITE_PERMISSION),
  ]);
  if (shouldOpenScreening(overview, awaitingVotes)) redirect("/casting/screening");
  return <CandidateDetailBody detail={detail} canInvite={holdsInvite} mode={mode} />;
}
