import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InviteDialog } from "@/app/(org)/rounds/[id]/applications/invite-dialog";
import { INVITE_PERMISSION, showInvite } from "@/app/(org)/rounds/[id]/applications/invite-text";
import { holdsPermission } from "@/app/holds-permission";
import { landingPathFor } from "@/app/landing";
import { getStartOverview } from "@/modules/casting/repository";
import {
  getAwaitingVoteCounts,
  getCandidateDetail,
  type CandidateDetail,
} from "@/modules/deliberation/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { de } from "@/ui/strings";
import { shouldOpenScreening } from "../dashboard/dashboard-view";
import { CardBody } from "./candidate-card-body";
import { DistributionBar } from "./distribution-bar";
import { formatExplanation } from "./format-explanation";
import { StateLine } from "./ranking-board";
import { Refusal } from "./refusal";
import { ScoreRing } from "./score-ring";
import { SwipeToBoard } from "./swipe-to-board";
import { WeightsList } from "./weights-list";

const t = de.casting;
const d = t.detail;

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

// The pure render of what `getCandidateDetail` returned: no visibility decision is made here.
export function CandidateDetailBody({
  detail,
  canInvite,
  mode,
}: {
  detail: CandidateDetail;
  canInvite: boolean;
  mode: "sheet" | "page";
}) {
  const backHref = detail.kind === "refused" ? "/casting" : `/casting?round=${detail.round.id}`;
  const body = (
    <div className="space-y-4">
      {mode === "page" && (
        <Link href={backHref} className="back-link">
          <ArrowLeft className="size-4" /> {d.back}
          <LinkPendingHint />
        </Link>
      )}
      <Content detail={detail} canInvite={canInvite} />
    </div>
  );
  // The full page has no scoreboard beneath it: a rightward swipe leads there instead.
  return mode === "page" ? <SwipeToBoard href={backHref}>{body}</SwipeToBoard> : body;
}

function Content({ detail, canInvite }: { detail: CandidateDetail; canInvite: boolean }) {
  if (detail.kind === "refused") {
    if (detail.reason === "round_not_available") {
      return <Refusal text={t.refusal.notAvailable(de.status.round[detail.status])} />;
    }
    if (detail.reason === "rules_invalid") return <Refusal text={t.refusal.rulesInvalid} />;
    if (detail.reason === "not_eligible") return <Refusal text={t.refusal.notEligible} />;
    return <Refusal text={d.notFound} />;
  }

  if (detail.kind === "hidden") {
    return (
      <section className="card space-y-3">
        <h2 className="font-serif text-xl font-semibold">{detail.application.name}</h2>
        <StateLine state={detail.application.state} />
        <p className="text-sm">{d.hiddenExplanation}</p>
        <Link href="/casting/screening" className="btn-link">
          {d.hiddenAction}
          <LinkPendingHint />
        </Link>
      </section>
    );
  }

  const { application } = detail;
  const invite = showInvite(canInvite, application.state) && (
    <InviteDialog
      roundId={detail.round.id}
      applicationId={application.applicationId}
      applicantName={application.applicantName}
    />
  );

  if (detail.kind === "unscored") {
    return (
      <>
        <section className="card">
          <CardBody card={application} />
        </section>
        <StateLine state={application.state} />
        <p className="text-sm text-muted-foreground">{d.needed(detail.needed - detail.n, detail.needed)}</p>
        <p className="text-sm">{d.participation(detail.n, detail.denominator)}</p>
        {detail.voters && detail.voters.length > 0 && (
          <section className="space-y-1">
            <h3 className="text-sm font-semibold">{d.votersHeading}</h3>
            <p className="text-sm">{detail.voters.join(", ")}</p>
          </section>
        )}
        <FormerNote count={detail.formerCount} />
        {invite}
      </>
    );
  }

  return (
    <>
      <section className="card">
        <CardBody card={application} />
      </section>
      <StateLine state={application.state} />
      <div className="ranking-row">
        <ScoreRing score={detail.score} n={detail.n} />
        <p className="text-sm text-muted-foreground">{t.scoreOf(detail.n)}</p>
        <button
          type="button"
          className="deck-help detail-help"
          popoverTarget="detail-arithmetic-popover"
          aria-label={d.arithmeticToggleLabel}
        >
          {t.rulesToggle}
        </button>
      </div>
      <div id="detail-arithmetic-popover" popover="auto" className="weights-popover detail-popover card">
        <p className="font-semibold">{d.arithmeticHeading}</p>
        <WeightsList weights={detail.weights} />
        <p className="mt-3 text-sm">{formatExplanation(detail.explanation)}</p>
      </div>
      <DistributionBar distribution={detail.distribution} authorship={detail.authorship} />
      <p className="text-sm">{d.participation(detail.n, detail.denominator)}</p>
      <FormerNote count={detail.formerCount} />
      {invite}
    </>
  );
}


function FormerNote({ count }: { count: number }) {
  if (count === 0) return null;
  return <p className="text-sm text-muted-foreground">{d.formerNote(count)}</p>;
}
