import type { SessionContext } from "@/db/session-context";
import { listOrganisationTasks, type OrganisationTask } from "@/modules/casting/repository";
import { orderOrganisationTasks } from "@/modules/casting/task-precedence";
import { getAwaitingVoteCounts, getRanking } from "@/modules/deliberation/repository";
import { listHouseholdSetupTasks, type HouseholdSetupTask } from "@/modules/identity/repository";

// organisation-task-list D1: the one organisation task list, read by O1 and by Start's moderation
// bridge so the two cannot disagree. Every permission decision stays inside the repository read
// that produces a task; this only combines already-authorized results and orders them.
export type LoadedOrganisationTask =
  | OrganisationTask
  | HouseholdSetupTask
  | { kind: "invite_candidates"; roundId: string; roundTitle: string };

const keyOf = (task: LoadedOrganisationTask): string => {
  if (task.kind === "open_round_for_room") return task.roomId;
  if (task.kind === "invite_candidates") return task.roundId;
  return "";
};

export async function loadOrganisationTasks(context: SessionContext): Promise<LoadedOrganisationTask[]> {
  // Independent reads, one connection each, none inside the other's transaction.
  const [casting, setup] = await Promise.all([listOrganisationTasks(context), listHouseholdSetupTasks(context)]);

  // After the siblings and one at a time (design R1: a request holds at most the sibling count of
  // pooled connections): `rankingRoundIds` is empty for a profile-less session (G-D15), which
  // `getRanking` would refuse anyway. A highlighted row still being decided is the ranking's own
  // rule (Q-15); nothing is recomputed here.
  // Review fix R-3 / R-6: the task's link opens /casting, which redirects to screening while votes
  // await. So a round is read only when its awaiting count is an explicit 0; a missing entry counts
  // as awaiting (same rule as Start's acknowledgement). A moderator with pending votes reads no
  // ranking at all.
  const candidates: LoadedOrganisationTask[] = [];
  const awaiting =
    casting.rankingRoundIds.length > 0 ? await getAwaitingVoteCounts(context) : new Map<string, number>();
  for (const roundId of casting.rankingRoundIds) {
    if (awaiting.get(roundId) !== 0) continue;
    const ranking = await getRanking(context, roundId);
    if (ranking.kind === "board" && ranking.decided.scored.some((row) => row.leading)) {
      candidates.push({ kind: "invite_candidates", roundId, roundTitle: ranking.round.title });
    }
  }

  return orderOrganisationTasks([...casting.tasks, ...setup, ...candidates], keyOf);
}
