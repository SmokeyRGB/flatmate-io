import { distributionOf, phaseOf, roundStepOf, type OrganisationTaskKind } from "@/modules/casting/task-precedence";
import type { ApplicationState } from "@/modules/casting/transitions";
import type { Strings } from "@/ui/strings";

// organisation-task-list D3/D4: O1's status sentence and progress bar as one pure mapping, so each
// sentence case is a unit test and not a rendering test. Only facts the caller may see go in:
// `stateCounts` is null for a session without a resident profile (G-D15), and the sentence then
// carries no number.
export interface StepView {
  label: string;
  state: "done" | "current" | "running" | "next";
}

export interface StatusHeader {
  sentence: string;
  // Human feedback 2026-10-13: the counts stand on their own line under the heading, not in it.
  detail: string | null;
  steps: StepView[];
  caption: string | null;
}

export interface StatusInput {
  activeRound: { title: string } | null;
  stateCounts: Partial<Record<ApplicationState, number>> | null;
  taskKinds: readonly OrganisationTaskKind[];
  // review fix R-5: any round at all (open or closed), so setup stays on screen until one exists.
  hasAnyRound: boolean;
}

// fix round F1: the current step comes from the furthest-advanced application (§3.1), but an earlier
// step can still be running. Voting runs while any application is new/screened, so "Einladungen
// verschicken" never makes the bar claim voting is finished while votes are still due. Only a
// profile caller has counts; the household account never gets a running state (G-D15).
export type RoundStepState = StepView["state"];

export function roundStepStates(stateCounts: Partial<Record<ApplicationState, number>> | null): RoundStepState[] {
  // review fix R-1: without counts nothing claims a current step; only "round opened" is done.
  if (!stateCounts) return ["done", "next", "next", "next"];
  const current = { waiting: 1, voting: 2, invited: 3 }[roundStepOf(phaseOf(stateCounts))];
  const votesDue = ((stateCounts.new ?? 0) + (stateCounts.screened ?? 0)) > 0;
  return [0, 1, 2, 3].map((i) =>
    i < current ? (i === 2 && votesDue ? "running" : "done") : i === current ? "current" : "next",
  );
}

function stepsAt(labels: string[], current: number): StepView[] {
  return labels.map((label, i) => ({ label, state: i < current ? "done" : i === current ? "current" : "next" }));
}

// The household account's way to a running search (D4 point 3): a step is current while its task is
// open, and "search running" is the step the first-round task starts.
const SETUP_TASKS: OrganisationTaskKind[] = ["add_room", "invite_flatmates", "appoint_search_lead", "open_first_round"];

export function buildStatusHeader(input: StatusInput, s: Strings): StatusHeader {
  const t = s.org.dashboard;
  let sentence: string;
  let detail: string | null = null;
  let steps: StepView[] = [];

  if (input.activeRound) {
    sentence = t.status.running(input.activeRound.title);
    if (input.stateCounts) {
      const distribution = distributionOf(input.stateCounts);
      // „8 Bewerbungen, davon 1 eingeladen." — the main-path total, then the invited ones (side
      // states are not counted, as in rahmenwerk.md §3.1).
      const total = distribution.reduce((sum, d) => sum + d.count, 0);
      const invited = distribution.find((d) => d.bucket === "in_scheduling")?.count ?? 0;
      detail =
        total === 0
          ? t.status.noApplication
          : invited > 0
            ? `${t.status.applications(total)}, ${t.status.invitedOfThem(invited)}.`
            : `${t.status.applications(total)}.`;
    }
    const labels = [t.steps.opened, t.steps.collecting, t.steps.voting, t.steps.invited];
    const states = roundStepStates(input.stateCounts);
    steps = labels.map((label, i) => ({ label, state: states[i] }));
  } else {
    const open = SETUP_TASKS.map((kind, i) => (input.taskKinds.includes(kind) ? i : -1)).filter((i) => i >= 0);
    if (open.length > 0 || !input.hasAnyRound) {
      sentence = t.status.almostReady;
      steps = stepsAt(
        [t.setupSteps.room, t.setupSteps.flatmates, t.setupSteps.searchLead, t.setupSteps.searchStart],
        open[0] ?? 3,
      );
    } else {
      sentence = t.status.noRound;
    }
  }

  const current = steps.findIndex((x) => x.state === "current");
  const running = steps.find((x) => x.state === "running");
  let caption = current >= 0 ? t.progressCaption(current + 1, steps.length, steps[current].label) : null;
  if (caption && running) caption += ` · ${t.progressRunningSuffix(running.label)}`;
  return { sentence, detail, steps, caption };
}
