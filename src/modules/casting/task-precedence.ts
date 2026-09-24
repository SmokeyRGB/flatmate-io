import { MAIN_PATH, type ApplicationState } from "./transitions";

// start-screen design.md Decisions 5 and 6 (`rahmenwerk.md` §2.2, §2.3, §3.1). Pure — no import
// from `src/db/`, `schema.ts` or `repository.ts`, so the precedence rule and the phase/standing
// computation are unit-testable without a database (C-2.8/P-5: one deterministic function, no
// learned or AI-assisted prioritisation).

export type TaskType = "T1" | "T2" | "T3" | "T4" | "T5" | "T6";

export interface OpenTask {
  type: TaskType;
  dueAt: Date | null;
  // A stable tie-breaker for tasks that compare equal on date/rank (`rahmenwerk.md` §2.2's T-4/T-5
  // tie) — the caller supplies one (e.g. a round id), never derived here.
  key: string;
}

// `rahmenwerk.md` §2.2: "Aufgaben ohne Datum danach, in der festen Reihenfolge T-1 · T-2 · T-3 ·
// T-4/T-5 · T-6." T-4 and T-5 share a rank — the tie is broken by `key` only.
const UNDATED_RANK: Record<TaskType, number> = {
  T1: 1,
  T2: 2,
  T3: 3,
  T4: 4,
  T5: 4,
  T6: 6,
};

// `rahmenwerk.md` §2.3: "T-6 erscheint nie neben T-5, weil es dessen Folgeschritt ist."
function dropT6BesideT5(tasks: OpenTask[]): OpenTask[] {
  const hasT5 = tasks.some((t) => t.type === "T5");
  if (!hasT5) return tasks;
  return tasks.filter((t) => t.type !== "T6");
}

// Dated tasks first (soonest — including overdue — on top), then undated tasks in the fixed rank,
// ties broken by `key`. Never mutates its input; always returns a new array.
export function orderTasks(tasks: OpenTask[]): OpenTask[] {
  const filtered = dropT6BesideT5(tasks);
  const dated = filtered.filter((t) => t.dueAt !== null);
  const undated = filtered.filter((t) => t.dueAt === null);

  dated.sort((a, b) => {
    const diff = (a.dueAt as Date).getTime() - (b.dueAt as Date).getTime();
    if (diff !== 0) return diff;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  undated.sort((a, b) => {
    const rankDiff = UNDATED_RANK[a.type] - UNDATED_RANK[b.type];
    if (rankDiff !== 0) return rankDiff;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  return [...dated, ...undated];
}

export type Phase =
  | "waiting_for_applications"
  | "voting_round_1"
  | "scheduling"
  | "voting_round_2"
  | "offer";

// `rahmenwerk.md` §3.1: computed from the furthest-advanced main-path application. Side states
// never count as progress — a round whose applications are all in a side state (or has none at
// all) reads as "Warten auf Bewerbungen".
const PHASE_BY_MAIN_PATH_STATE: Record<(typeof MAIN_PATH)[number], Phase> = {
  new: "voting_round_1",
  screened: "voting_round_1",
  invited: "scheduling",
  scheduled: "scheduling",
  interviewed: "voting_round_2",
  offer_made: "offer",
  moved_in: "offer",
};

export function phaseOf(stateCounts: Partial<Record<ApplicationState, number>>): Phase {
  // MAIN_PATH is already ordered furthest-last, so the last main-path state with a positive count
  // is the furthest-advanced one.
  let furthest: (typeof MAIN_PATH)[number] | null = null;
  for (const state of MAIN_PATH) {
    if ((stateCounts[state] ?? 0) > 0) furthest = state;
  }
  if (furthest === null) return "waiting_for_applications";
  return PHASE_BY_MAIN_PATH_STATE[furthest];
}

export type DistributionBucket = "in_screening" | "in_scheduling" | "interviewed" | "in_offer";

// design.md Decision 6: the four display buckets, non-zero only, in main-path order.
const BUCKET_BY_MAIN_PATH_STATE: Record<(typeof MAIN_PATH)[number], DistributionBucket> = {
  new: "in_screening",
  screened: "in_screening",
  invited: "in_scheduling",
  scheduled: "in_scheduling",
  interviewed: "interviewed",
  offer_made: "in_offer",
  moved_in: "in_offer",
};

const BUCKET_ORDER: DistributionBucket[] = ["in_screening", "in_scheduling", "interviewed", "in_offer"];

export function distributionOf(
  stateCounts: Partial<Record<ApplicationState, number>>,
): Array<{ bucket: DistributionBucket; count: number }> {
  const totals: Record<DistributionBucket, number> = {
    in_screening: 0,
    in_scheduling: 0,
    interviewed: 0,
    in_offer: 0,
  };
  for (const state of MAIN_PATH) {
    const count = stateCounts[state] ?? 0;
    if (count <= 0) continue;
    totals[BUCKET_BY_MAIN_PATH_STATE[state]] += count;
  }
  return BUCKET_ORDER.filter((bucket) => totals[bucket] > 0).map((bucket) => ({
    bucket,
    count: totals[bucket],
  }));
}
