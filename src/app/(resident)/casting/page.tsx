import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStartOverview } from "@/modules/casting/repository";
import { getAwaitingVoteCounts } from "@/modules/deliberation/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { landingPathFor } from "@/app/landing";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { shouldOpenScreening } from "../dashboard/dashboard-view";

const t = de.casting;

// The Casting tab (spec `ui/resident-frame`): takes a resident with applications awaiting their
// vote straight to the screening step; otherwise it is the D1 shell (F4 change 1) until F5 builds
// the ranking: a heading and one sentence, no scores.
export default async function CastingPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");
  if (current.context.profileId === null) redirect(landingPathFor(current.context));

  const [overview, awaitingVotes] = await Promise.all([
    getStartOverview(current.context),
    getAwaitingVoteCounts(current.context),
  ]);
  if (shouldOpenScreening(overview, awaitingVotes)) redirect("/casting/screening");

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <Link href="/dashboard" className="back-link">
        <ArrowLeft className="size-4" /> {t.backToStart}
        <LinkPendingHint />
      </Link>
      <h1 className="font-serif text-2xl font-semibold">{t.rankingHeading}</h1>
      <p className="text-sm text-muted-foreground">{t.rankingBody}</p>
    </div>
  );
}
