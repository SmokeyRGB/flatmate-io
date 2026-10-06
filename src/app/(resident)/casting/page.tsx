import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isUuid } from "@/db/session-context";
import { getStartOverview } from "@/modules/casting/repository";
import { getAwaitingVoteCounts, getRanking } from "@/modules/deliberation/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { landingPathFor } from "@/app/landing";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { holdsPermission } from "@/app/holds-permission";
import { INVITE_PERMISSION } from "@/app/(org)/rounds/[id]/applications/invite-text";
import { shouldOpenScreening } from "../dashboard/dashboard-view";
import { RankingBoard } from "./ranking-board";

const t = de.casting;

// The Casting tab (spec `ui/resident-frame`): takes a resident with applications awaiting their
// vote straight to the screening step; otherwise it is the D1 scoreboard (F5 change 1, spec
// `deliberation/ranking`).
//
// The redirect wins over `?round=` (design D7, human decision Q-2): a resident with anything
// awaiting in ANY open round is sent to the pass even when the address names another round. That
// is "vote first, then see results", and it is why the scoreboard needs no hint about hidden
// results and no can-still-vote notice. Past it, `?round=` is read like the pass reads it (an
// array or a non-UUID counts as absent, so the newest open or paused round the resident takes
// part in is shown). Every visibility rule is applied inside `getRanking`; this page only renders.
export default async function CastingPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string | string[] }>;
}) {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");
  if (current.context.profileId === null) redirect(landingPathFor(current.context));

  const [overview, awaitingVotes] = await Promise.all([
    getStartOverview(current.context),
    getAwaitingVoteCounts(current.context),
  ]);
  if (shouldOpenScreening(overview, awaitingVotes)) redirect("/casting/screening");

  const { round } = await searchParams;
  const roundId = typeof round === "string" && isUuid(round) ? round : null;
  // „Einladen" is offered from the stored permission, never from a role. The repository function
  // behind it refuses again on its own (F5 candidate-invite, design D5). Read beside the ranking,
  // not after it: the two are independent.
  const [ranking, holdsInvite] = await Promise.all([
    getRanking(current.context, roundId),
    holdsPermission(current.context, INVITE_PERMISSION),
  ]);
  const canInvite = ranking.kind === "board" && holdsInvite;

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <Link href="/dashboard" className="back-link">
        <ArrowLeft className="size-4" /> {t.backToStart}
        <LinkPendingHint />
      </Link>
      <h1 className="font-serif text-2xl font-semibold">{t.rankingHeading}</h1>
      <RankingBoard ranking={ranking} canInvite={canInvite} />
    </div>
  );
}
