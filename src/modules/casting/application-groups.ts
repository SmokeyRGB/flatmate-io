// Pure grouping of a round's applications by state (F3 change 3, design D1). No database access.
// The counts come from the same rows as the lists, so a count and its list can never disagree.
import { MAIN_PATH, type ApplicationState } from "./transitions";

// The main path in its order, then the four side states. A unit test asserts this equals the
// enum's values as a set, so a state added to the enum later fails there instead of silently
// disappearing from the list.
export const APPLICATION_STATE_ORDER = [
  ...MAIN_PATH,
  "rejected_by_household",
  "declined_by_applicant",
  "withdrawn",
  "archived",
] as const satisfies readonly ApplicationState[];

export interface ApplicationGroup<T> {
  state: ApplicationState;
  count: number;
  rows: T[];
}

// Empty groups are dropped, and the input order is kept inside each group.
export function groupApplicationsByState<T extends { state: ApplicationState }>(
  rows: readonly T[],
): ApplicationGroup<T>[] {
  const groups: ApplicationGroup<T>[] = [];
  for (const state of APPLICATION_STATE_ORDER) {
    const inState = rows.filter((r) => r.state === state);
    if (inState.length > 0) groups.push({ state, count: inState.length, rows: inState });
  }
  return groups;
}
