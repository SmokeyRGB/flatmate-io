"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { InviteDialog } from "@/app/(org)/rounds/[id]/applications/invite-dialog";
import { showInvite } from "@/app/(org)/rounds/[id]/applications/invite-text";
import type { CandidateDetail } from "@/modules/deliberation/repository";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { useLocale, useStrings } from "@/ui/strings/provider";
import { CardBody } from "./candidate-card-body";
import { DistributionBar } from "./distribution-bar";
import { formatExplanation } from "./format-explanation";
import { StateLine } from "./ranking-board";
import { Refusal } from "./refusal";
import { ScoreRing } from "./score-ring";
import { SwipeToBoard } from "./swipe-to-board";
import { WeightsList } from "./weights-list";

// language-switch D3: the pure render of the candidate detail lives apart from the async server
// component in candidate-detail-view.tsx, as a client component that reads the language with
// useStrings. The server component cannot hold a hook, and this part must stay renderable in tests.
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
  const d = useStrings().casting.detail;
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
  const s = useStrings();
  const locale = useLocale();
  const t = s.casting;
  const d = t.detail;
  if (detail.kind === "refused") {
    if (detail.reason === "round_not_available") {
      return <Refusal text={t.refusal.notAvailable(s.status.round[detail.status])} />;
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
        <p className="mt-3 text-sm">{formatExplanation(detail.explanation, s, locale)}</p>
      </div>
      <DistributionBar distribution={detail.distribution} authorship={detail.authorship} />
      <p className="text-sm">{d.participation(detail.n, detail.denominator)}</p>
      <FormerNote count={detail.formerCount} />
      {invite}
    </>
  );
}


function FormerNote({ count }: { count: number }) {
  const d = useStrings().casting.detail;
  if (count === 0) return null;
  return <p className="text-sm text-muted-foreground">{d.formerNote(count)}</p>;
}
