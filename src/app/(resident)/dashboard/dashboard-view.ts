import {
  distributionOf,
  orderTasks,
  phaseOf,
  type OpenTask,
} from "@/modules/casting/task-precedence";
import type { StartOpenRound, StartOverview } from "@/modules/casting/repository";
import { de } from "@/ui/strings";

// start-screen design.md Decision 10/tasks.md 7.4/8.3: B1's pure mapping from `getStartOverview` +
// `listOrganisationTasks().length` + `now` to a view model — deliberately no counter field
// (the participation counter left Start, human decision 2026-09-24). Kept out of the page so its
// branches are a unit test, not a rendering test.

export interface DashboardTaskView {
  heading: string;
  reason: string;
  href: string;
}

export type DashboardStandingView =
  | { kind: "noRound" }
  | { kind: "runningWithoutYou" }
  | { kind: "phase"; phaseLabel: string; distribution: Array<{ label: string; count: number }> };

export interface DashboardBridgeView {
  heading: string;
  body: string;
  buttonHref: string;
}

export interface DashboardView {
  primary: DashboardTaskView | null;
  rows: DashboardTaskView[];
  // "und N weitere" — the count beyond the primary + up to three rows, and the tasks themselves,
  // so the disclosure lists them (rahmenwerk.md §2.3: "eingeklappt", never dropped).
  folded: number;
  foldedTasks: DashboardTaskView[];
  // Only present when there is no primary (design.md Decision 10: the standing card takes the
  // primary card's place, never both at once).
  standing: DashboardStandingView | null;
  // Only present for a viewer with organisation access (design.md Decision 4/getNavigationAccess).
  bridge: DashboardBridgeView | null;
}

// The household's own calendar day, not the server's: a deadline just after midnight CEST is the
// previous day in UTC, and B1 would name the wrong date in the one reason text P-3 needs right.
function formatGermanDate(date: Date): string {
  return date.toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
}

// The page's own clock decision (design.md Decision 5): the module comparing dates has none of
// its own, `now` is always the caller's.
function reasonForRound(round: StartOpenRound, now: Date): string {
  if (round.phaseDeadlineAt === null) return de.start.reasonUndated(round.title);
  if (round.phaseDeadlineAt.getTime() < now.getTime()) return de.start.reasonOverdue;
  return de.start.reasonDated(formatGermanDate(round.phaseDeadlineAt));
}

function taskViewFor(round: StartOpenRound, now: Date): DashboardTaskView {
  return {
    heading: de.start.voteTaskHeading(round.voteCount),
    reason: reasonForRound(round, now),
    href: "/casting/screening",
  };
}

export function buildDashboardView(
  overview: StartOverview | null,
  organisationTaskCount: number,
  access: { organisation: boolean },
  now: Date,
): DashboardView {
  // v0.1's only task type is T-5 (a vote task) — one per open round with a positive count and the
  // right to vote (EC-2.12: no vote task without can_vote).
  const eligibleRounds = (overview?.openRounds ?? []).filter((r) => r.canVote && r.voteCount > 0);
  const byRoundId = new Map(eligibleRounds.map((r) => [r.roundId, r]));
  const openTasks: OpenTask[] = eligibleRounds.map((r) => ({
    type: "T5",
    dueAt: r.phaseDeadlineAt,
    key: r.roundId,
  }));
  const ordered = orderTasks(openTasks);

  const primaryTask = ordered[0] ?? null;
  const rowTasks = ordered.slice(1, 4);
  const folded = Math.max(0, ordered.length - 4);
  const foldedTasks = ordered.slice(4).map((t) => taskViewFor(byRoundId.get(t.key) as StartOpenRound, now));

  const primary = primaryTask ? taskViewFor(byRoundId.get(primaryTask.key) as StartOpenRound, now) : null;
  const rows = rowTasks.map((t) => taskViewFor(byRoundId.get(t.key) as StartOpenRound, now));

  // design.md Decision 10: the primary card's place is taken by the standing card when there is
  // no primary — never both, never neither (spec "never a blank surface").
  let standing: DashboardStandingView | null = null;
  if (!primary) {
    if (!overview?.anyOpenRound) {
      standing = { kind: "noRound" };
    } else if (!overview.standing) {
      // spec.md "A round runs without the resident": no number derived from applications.
      standing = { kind: "runningWithoutYou" };
    } else {
      standing = {
        kind: "phase",
        phaseLabel: de.start.phase[phaseOf(overview.standing.stateCounts)],
        distribution: distributionOf(overview.standing.stateCounts).map((d) => ({
          label: de.start.distribution[d.bucket](d.count),
          count: d.count,
        })),
      };
    }
  }

  let bridge: DashboardBridgeView | null = null;
  if (access.organisation) {
    bridge = {
      heading:
        organisationTaskCount === 0
          ? de.start.bridge.allDone
          : organisationTaskCount === 1
            ? de.start.bridge.headingSingular
            : de.start.bridge.headingPlural(organisationTaskCount),
      body: organisationTaskCount === 0 ? "" : de.start.bridge.body,
      buttonHref: "/organization",
    };
  }

  return { primary, rows, folded, foldedTasks, standing, bridge };
}

// tasks.md 8.1/8.3: the Casting tab redirects straight to screening when the viewer has anything
// awaiting their vote in any open round — the same "eligible" test buildDashboardView uses for T-5.
export function shouldOpenScreening(overview: StartOverview | null): boolean {
  return pendingVoteCount(overview) > 0;
}

// The one definition of "applications awaiting this viewer's vote", summed over every open round
// they may vote in: the Casting redirect and the screening placeholder's count both read it, so
// F4 changes the rule in one place.
export function pendingVoteCount(overview: StartOverview | null): number {
  return (overview?.openRounds ?? [])
    .filter((r) => r.canVote)
    .reduce((sum, r) => sum + r.voteCount, 0);
}
