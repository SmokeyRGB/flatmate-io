import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStartOverview, listOrganisationTasks } from "@/modules/casting/repository";
import { getAwaitingVoteCounts } from "@/modules/deliberation/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { getRequestLocale, getStrings } from "@/ui/strings/request";
import { landingPathFor } from "@/app/landing";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { householdFor, identityLabelFor, navigationAccessFor } from "@/app/_frame/session-data";
import { buildDashboardView, standingHeadingOf } from "./dashboard-view";

// Screen B1 — the resident's Start screen (FR-2.18, FR-2.20-2.24). A household-account session
// (profileId null) is never shown this screen: the `(resident)` layout already redirects it to
// its own landing before this page runs, so getStartOverview's own `null` guard is a second,
// never-reached line of defence, not the only one (G-D15).
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  const s = await getStrings();
  const locale = await getRequestLocale();
  const { note } = await searchParams;
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");
  if (current.context.profileId === null) redirect(landingPathFor(current.context));

  const [overview, awaitingVotes, organisationTasks, access, identity, household] = await Promise.all([
    getStartOverview(current.context),
    getAwaitingVoteCounts(current.context),
    listOrganisationTasks(current.context),
    navigationAccessFor(current.context),
    identityLabelFor(current.context),
    householdFor(current.context),
  ]);

  // Same fallbacks as the (resident) layout's avatar menu, so one screen never shows two answers.
  const displayName =
    identity.kind === "resident" ? (identity.displayName ?? s.org.identityResidentFallback) : s.org.identityResidentFallback;
  const householdName = household?.name ?? s.org.identityHouseholdFallback;
  const view = buildDashboardView(overview, awaitingVotes, organisationTasks, access, new Date(), s, locale);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">{s.start.greeting(displayName)}</h1>
        <p className="text-sm text-muted-foreground">{householdName}</p>
      </div>

      {note === "already_member" && (
        <div role="note" className="callout callout-info">
          {s.join.alreadyMemberNote}
        </div>
      )}

      {view.primary ? (
        <div className="card card-featured">
          <div className="card-band">
            <p className="eyebrow">{s.start.eyebrowAsNext}</p>
          </div>
          <div className="card-featured-body space-y-3">
            <p className="text-lg font-semibold">{view.primary.heading}</p>
            <p className="text-sm text-muted-foreground">{view.primary.reason}</p>
            <Link href={view.primary.href} className="btn btn-primary">
              {s.start.voteTaskButton} <ArrowRight className="size-4" />
              <LinkPendingHint />
            </Link>
          </div>
        </div>
      ) : (
        <div className="card space-y-2">
          {view.standing?.kind === "noRound" && <p className="text-sm">{s.start.noRoundSentence}</p>}
          {view.standing?.kind === "runningWithoutYou" && (
            <p className="text-sm">{s.start.runningWithoutYouSentence}</p>
          )}
          {view.standing?.kind === "phase" && (
            <>
              {view.standing.allRated && <p className="text-lg font-semibold">{s.start.allRated}</p>}
              {view.standing.waiting && <p className="text-lg font-semibold">{s.start.waitingForApplications}</p>}
              {standingHeadingOf(view.standing, s) && <p className="text-lg font-semibold">{standingHeadingOf(view.standing, s)}</p>}
              {view.standing.distribution.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {view.standing.distribution.map((d) => d.label).join(" · ")}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {view.rows.length > 0 && (
        <ul className="space-y-2">
          {view.rows.map((row, i) => (
            <li key={i}>
              <Link href={row.href} className="card flex items-center justify-between gap-2 py-2 transition hover:shadow-none">
                <span>
                  <span className="block font-medium">{row.heading}</span>
                  <span className="block text-xs text-muted-foreground">{row.reason}</span>
                </span>
                <ArrowRight className="size-4 shrink-0" />
                <LinkPendingHint />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {view.folded > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {s.start.andNMore(view.folded)}
          </summary>
          <ul className="mt-2 space-y-2">
            {view.foldedTasks.map((task, i) => (
              <li key={i}>
                <Link href={task.href} className="card flex items-center justify-between gap-2 py-2 transition hover:shadow-none">
                  <span>
                    <span className="block font-medium">{task.heading}</span>
                    <span className="block text-xs text-muted-foreground">{task.reason}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0" />
                  <LinkPendingHint />
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      {view.bridge && (
        <div className="card card-quiet">
          <p className="eyebrow">{s.start.bridge.eyebrow}</p>
          <p className="mt-1 text-lg font-semibold">{view.bridge.heading}</p>
          {view.bridge.body && <p className="mt-1 text-sm">{view.bridge.body}</p>}
          <Link href={view.bridge.buttonHref} className="btn btn-primary mt-3">
            {s.start.bridge.button}
            <LinkPendingHint />
          </Link>
        </div>
      )}
    </div>
  );
}
