import { ArrowLeft, ArrowRight, DoorOpen, FilePlus2, ListChecks, Send, Shield, UserPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { holdsPermission } from "@/app/holds-permission";
import { getStartOverview, listRoundsForSession } from "@/modules/casting/repository";
import {
  getHousehold,
  getLiveFoundingLinkPath,
  getNavigationAccess,
  isHouseholdAccount,
} from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import type { Strings } from "@/ui/strings";
import { getStrings } from "@/ui/strings/request";
import { OrganisationAccessDenied } from "../organisation-access-denied";
import { requireOrganisationAccess } from "../organisation-access";
import { organisationTaskCopy, pickActiveRound, roundFallbackPrimary } from "../organisation-task-view";
import { loadOrganisationTasks, type LoadedOrganisationTask } from "../organisation-tasks";
import { ProgressBar } from "./progress-bar";
import { SectionTiles } from "./section-tiles";
import { buildStatusHeader } from "./status-sentence";

// Screen O1 (`/organization`), the organisation task list (organisation-task-list D4, "one
// sentence, one button"): where the search stands, the one next step with its reason, the sections
// as tiles, and the rest folded under "Mehr". EC-1.5: exactly one round is "active"; the others sit
// in the folded list, never presented as simultaneously live. Server components only, no client JS.
//
// Counts come only from `getStartOverview`, which returns null for a session without a resident
// profile (G-D15); tasks from `loadOrganisationTasks`, the list Start's bridge counts too.
//
// The `already_member` note (EC-2.4) renders on each identity's own landing (design.md Decision 8):
// B1 for a resident, and here for the household account, whose landing moved from O20 to O1
// (2026-10-05); O20 still renders it too.
const TASK_ICONS: Record<LoadedOrganisationTask["kind"], ReactNode> = {
  add_room: <DoorOpen className="size-5" />,
  invite_flatmates: <UserPlus className="size-5" />,
  appoint_search_lead: <Shield className="size-5" />,
  open_first_round: <ListChecks className="size-5" />,
  open_round_for_room: <ListChecks className="size-5" />,
  invite_candidates: <Send className="size-5" />,
};

export default async function OrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  const s = await getStrings();
  const t = s.org.dashboard;
  const { note } = await searchParams;
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");
  const context = current.context;

  // role-permissions design D9: every page of the organisation area checks the caller's stored
  // permissions on this request, so a demoted moderator sees the access message on reload.
  if (!(await requireOrganisationAccess(current))) return <OrganisationAccessDenied strings={s} />;

  // Independent reads, one connection each, none inside another's transaction.
  const [rounds, access, tasks, overview, household, mayCapture, canOpenRound] = await Promise.all([
    listRoundsForSession(context),
    getNavigationAccess(context),
    loadOrganisationTasks(context),
    getStartOverview(context),
    getHousehold(context),
    holdsPermission(context, "create_application"),
    holdsPermission(context, "manage_rounds"),
  ]);
  const active = pickActiveRound<{ id: string; title: string; status: string }>(rounds, overview?.standing?.roundId);
  const rest = rounds.filter((r: { id: string }) => r.id !== active?.id);

  const canCapture = active !== null && mayCapture;

  // founding-link-moderator D4: while the founding link is unused and valid, the household account
  // may join through it. When "who runs the search" is open the link is part of that task; otherwise
  // it is a card of its own below the tiles (review fix R-4, identity/join-code). A plain <a> below, never next/link:
  // the join GET records a rate-limit attempt, so it must not be prefetched.
  const appointOpen = tasks.some((x) => x.kind === "appoint_search_lead");
  const standaloneFoundingPath =
    !appointOpen && (await isHouseholdAccount(context)) ? await getLiveFoundingLinkPath(context) : null;

  const stateCounts =
    overview?.standing && overview.standing.roundId === active?.id ? overview.standing.stateCounts : null;
  const header = buildStatusHeader(
    { activeRound: active, stateCounts, taskKinds: tasks.map((x) => x.kind), hasAnyRound: rounds.length > 0 },
    s,
  );

  const captureHref = active && canCapture ? `/rounds/${active.id}/applications/new` : null;
  const applicationsHref = active && canCapture ? `/rounds/${active.id}` : null;
  // Human feedback 2026-10-13: what belongs to the active round sits in the round panel
  // (09-Design-System.md "Round-scope grouping panel"); household management sits under its own
  // heading. Only "invite candidates" is round-scoped; every other task concerns the household.
  const roundTasks: LoadedOrganisationTask[] = active ? tasks.filter((x) => x.kind === "invite_candidates") : [];
  const householdTasks = tasks.filter((x) => !roundTasks.includes(x));
  const [householdFirst, ...householdOthers] = householdTasks;
  const [roundFirst, ...roundOthers] = roundTasks;
  const fallback = active && !roundFirst ? roundFallbackPrimary(stateCounts, captureHref !== null) : null;
  // One primary per page: when a household task comes first in the order it keeps the primary, and
  // the action inside the round panel renders as a secondary button.
  const roundIsPrimary = !householdFirst;
  const roundButton = roundIsPrimary ? "btn btn-primary w-full py-3 text-base" : "btn btn-secondary w-full";
  const householdRows = householdOthers.slice(0, 3);
  const folded = householdOthers.slice(3);
  const showMore = (active && canOpenRound) || rest.length > 0;

  const roundAction = roundFirst ? (
    <PrimaryTask task={roundFirst} strings={s} secondary={!roundIsPrimary} />
  ) : fallback === "casting" ? (
    <Link href="/casting" className={roundButton}>
      <ListChecks className="size-5" /> {t.goToCasting}
      <LinkPendingHint />
    </Link>
  ) : fallback === "capture" && captureHref ? (
    <Link href={captureHref} className={roundButton}>
      <FilePlus2 className="size-5" /> {t.captureApplication}
      <LinkPendingHint />
    </Link>
  ) : null;
  const captureIsSecondary = captureHref !== null && (roundFirst !== undefined || fallback === "casting");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {/* A resident reaches O1 from the avatar menu or Start's moderation bridge, and the (org)
          frame has no resident navigation, so this is their only way back (walkthrough finding,
          2026-09-24). The household account has no Start. */}
      <div className="space-y-2">
        {context.profileId !== null && (
          <Link href="/dashboard" className="back-link">
            <ArrowLeft className="size-4" /> {s.nav.start}
            <LinkPendingHint />
          </Link>
        )}
        <p className="text-sm text-muted-foreground">{household?.name ?? s.org.identityHouseholdFallback}</p>
      </div>
      {note === "already_member" && (
        <div role="note" className="callout callout-info">
          {s.join.alreadyMemberNote}
        </div>
      )}

      {!active && (
        <>
          <h1 className="font-serif text-xl font-semibold leading-snug">{header.sentence}</h1>
          {header.detail && <p className="text-sm text-muted-foreground">{header.detail}</p>}
          <ProgressBar header={header} s={s} />
        </>
      )}

      {householdFirst && <PrimaryTask task={householdFirst} strings={s} />}
      {householdRows.length > 0 && (
        <ul className="space-y-2">
          {householdRows.map((task, i) => (
            <li key={`${task.kind}-${i}`}>
              <TaskRow task={task} strings={s} />
            </li>
          ))}
        </ul>
      )}
      {folded.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">{s.start.andNMore(folded.length)}</summary>
          <ul className="mt-2 space-y-2">
            {folded.map((task, i) => (
              <li key={`${task.kind}-${i}`}>
                <TaskRow task={task} strings={s} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {active && (
        <section className="panel-round space-y-4" aria-labelledby="round-panel-heading">
          <p className="eyebrow">{t.roundPanelEyebrow}</p>
          <h1 id="round-panel-heading" className="font-serif text-xl font-semibold leading-snug">
            {header.sentence}
          </h1>
          {header.detail && <p className="-mt-2 text-sm text-muted-foreground">{header.detail}</p>}
          <ProgressBar header={header} s={s} />
          {roundAction}
          {roundOthers.map((task, i) => (
            <TaskRow key={`${task.kind}-${i}`} task={task} strings={s} />
          ))}
          {captureIsSecondary && captureHref && (
            <Link href={captureHref} className="btn btn-secondary w-full">
              <FilePlus2 className="size-4" /> {t.captureApplication}
              <LinkPendingHint />
            </Link>
          )}
          {applicationsHref && (
            <Link href={applicationsHref} className="btn btn-secondary w-full">
              <ListChecks className="size-4" /> {t.allApplications}
              <LinkPendingHint />
            </Link>
          )}
        </section>
      )}

      <section className="space-y-3" aria-labelledby="household-heading">
        <p id="household-heading" className="eyebrow">
          {t.householdEyebrow}
        </p>
        <SectionTiles access={access} s={s} />
        {/* Review fix R-4: the offer is one click away, not folded under "Mehr". */}
        {standaloneFoundingPath && (
          <div className="card space-y-2">
            <p className="text-sm font-medium">{t.foundingJoinHeading}</p>
            <p className="text-sm text-muted-foreground">{t.foundingJoinBody}</p>
            <a href={standaloneFoundingPath} className="btn btn-secondary">
              {t.foundingJoinButton} <ArrowRight className="size-4" />
            </a>
          </div>
        )}
      </section>

      {showMore && (
        <details className="card py-2.5">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <ListChecks className="size-4 text-primary" /> {t.more}
          </summary>
          <div className="mt-3 flex flex-col items-start gap-3">
            {active && canOpenRound && (
              <Link href="/rounds/new" className="btn-link min-h-11">
                {t.openAnotherRound}
                <LinkPendingHint />
              </Link>
            )}
            {rest.length > 0 && (
              <div>
                <p className="text-sm font-medium">{t.otherRoundsHeading}</p>
                <ul className="mt-2 space-y-1">
                  {rest.map((r: { id: string; title: string; status: string }) => (
                    <li key={r.id} className="text-sm text-muted-foreground">
                      <Link href={`/rounds/${r.id}`} className="btn-link min-h-11">
                        {r.title} — {s.status.round[r.status as keyof typeof s.status.round]}
                        <LinkPendingHint />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

// D4 point 4: one full-width button, icon plus the verb heading, the reason beneath it, visible
// without interaction. "Who runs the search" has two ways, so its question stands above them and
// "Selbst übernehmen" (the founding link) is a plain <a> styled as the primary button.
function PrimaryTask({
  task,
  strings: s,
  secondary = false,
}: {
  task: LoadedOrganisationTask;
  strings: Strings;
  secondary?: boolean;
}) {
  const copy = organisationTaskCopy(task, s);
  const t = s.org.dashboard;
  if (task.kind === "appoint_search_lead") {
    const path = task.foundingJoinPath;
    return (
      <div className="space-y-2">
        <p className="text-center text-lg font-semibold">{copy.heading}</p>
        {path && (
          <a href={path} className="btn btn-primary w-full py-3 text-base">
            {TASK_ICONS[task.kind]} {t.tasks.takeOver}
          </a>
        )}
        {task.canAppointMember && (
          <Link
            href={copy.href}
            className={path ? "btn btn-secondary w-full" : "btn btn-primary w-full py-3 text-base"}
          >
            {!path && TASK_ICONS[task.kind]} {t.tasks.appointSomeone}
            <LinkPendingHint />
          </Link>
        )}
        <p className="text-center text-xs text-muted-foreground">{copy.reason}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Link href={copy.href} className={secondary ? "btn btn-secondary w-full" : "btn btn-primary w-full py-3 text-base"}>
        {TASK_ICONS[task.kind]} {copy.heading}
        <LinkPendingHint />
      </Link>
      <p className="text-center text-xs text-muted-foreground">{copy.reason}</p>
    </div>
  );
}

// The B1 row pattern: icon, verb heading, reason, arrow. A plain <a> (the founding link) cannot sit
// inside the row's link, so it follows the card instead.
function TaskRow({ task, strings: s }: { task: LoadedOrganisationTask; strings: Strings }) {
  const copy = organisationTaskCopy(task, s);
  return (
    <div className="space-y-1">
      <Link
        href={copy.href}
        className="card flex items-center justify-between gap-3 py-2.5 transition hover:shadow-none"
      >
        <span className="flex items-center gap-3">
          <span className="text-primary">{TASK_ICONS[task.kind]}</span>
          <span>
            <span className="block font-medium">{copy.heading}</span>
            <span className="block text-xs text-muted-foreground">{copy.reason}</span>
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0" />
        <LinkPendingHint />
      </Link>
      {task.kind === "appoint_search_lead" && task.foundingJoinPath && (
        <a href={task.foundingJoinPath} className="btn-link ml-1">
          {s.org.dashboard.tasks.takeOver}
        </a>
      )}
    </div>
  );
}
