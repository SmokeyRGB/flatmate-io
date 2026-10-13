import { phaseOf, roundStepOf } from "@/modules/casting/task-precedence";
import type { ApplicationState } from "@/modules/casting/transitions";
import type { Strings } from "@/ui/strings";
import type { LoadedOrganisationTask } from "./organisation-tasks";

// organisation-task-list D5: one task's words and destination, read by O1 and by Start's bridge so
// the two say the same thing. Pure: no DB, no session. A heading is a verb, the reason one line,
// and `href` is the screen where the task is carried out, never a list to search through (O-organisation
// rule 1).
export interface OrganisationTaskCopy {
  heading: string;
  reason: string;
  href: string;
}

export function organisationTaskCopy(task: LoadedOrganisationTask, s: Strings): OrganisationTaskCopy {
  const t = s.org.dashboard;
  switch (task.kind) {
    case "add_room":
      return { heading: t.tasks.addRoomHeading, reason: t.tasks.addRoomReason, href: "/rooms" };
    case "invite_flatmates":
      // fix round F3: with an invitation already out, the step is to share it.
      return task.invitationsOutstanding
        ? { heading: t.tasks.shareLinksHeading, reason: t.tasks.shareLinksReason, href: "/members" }
        : { heading: t.tasks.inviteFlatmatesHeading, reason: t.tasks.inviteFlatmatesReason, href: "/members" };
    case "appoint_search_lead":
      return {
        heading: t.tasks.appointSearchLeadHeading,
        reason: t.tasks.appointSearchLeadReason,
        href: "/members",
      };
    case "open_first_round":
      return { heading: t.openFirstRoundHeading, reason: t.openFirstRoundBody, href: "/rounds/new" };
    case "open_round_for_room":
      return {
        heading: t.tasks.openRoundForRoomHeading(task.label),
        reason: t.tasks.openRoundForRoomReason,
        href: "/rounds/new",
      };
    case "invite_candidates":
      return {
        heading: t.tasks.inviteCandidatesHeading,
        reason: t.tasks.inviteCandidatesReason(task.roundTitle),
        href: `/casting?round=${task.roundId}`,
      };
  }
}

// fix round F2: with no open task, the one action of an active round follows its step. While
// applications are still being collected it is capture; once they are voted on or invited it is the
// casting view. `stateCounts` is null for the household account (G-D15), which has no casting view,
// so it reads as "collecting". The page offers capture as the secondary button whenever it is not primary.
export function roundFallbackPrimary(
  stateCounts: Partial<Record<ApplicationState, number>> | null,
  canCapture: boolean,
): "capture" | "casting" | null {
  if (stateCounts && roundStepOf(phaseOf(stateCounts)) !== "waiting") return "casting";
  return canCapture ? "capture" : null;
}

// review fix R-2: the one active round (EC-1.5) is the open round the standing describes, so the
// counts and the step bar always belong to the round shown. Without a matching open round it is the
// first open one.
export function pickActiveRound<R extends { id: string; status: string }>(
  rounds: readonly R[],
  standingRoundId: string | null | undefined,
): R | null {
  const open = rounds.filter((r) => r.status === "open");
  return open.find((r) => r.id === standingRoundId) ?? open[0] ?? null;
}
