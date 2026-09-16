import type { applicationStateEnum } from "./schema";

export type ApplicationState = (typeof applicationStateEnum.enumValues)[number];

const MAIN_PATH = [
  "new",
  "screened",
  "invited",
  "scheduled",
  "interviewed",
  "offer_made",
  "moved_in",
] as const satisfies readonly ApplicationState[];

// Every pair below is a row in docs/domain/zustandsmaschinen.md's transition table (lines 48-76),
// operationalizing docs/03-PRD.md §4.2.1 (maßgeblich for the state set and the "one table, no
// code-derived transition" rule, ADR-002). Not invented: each pair traces to a named source line.
// FR-0.10: an undeclared pair throws — no silent fallthrough.
export const TRANSITIONS: ReadonlyArray<readonly [ApplicationState, ApplicationState]> = [
  // Forward, main path (zustandsmaschinen.md lines 48-54)
  ["new", "screened"],
  ["screened", "invited"],
  ["invited", "scheduled"],
  ["scheduled", "interviewed"],
  ["interviewed", "offer_made"],
  ["offer_made", "moved_in"],

  // Forward into side states (lines 60-63). Ranges quoted there ("new … offer_made",
  // "invited … moved_in") are expanded here to the explicit main-path states they span.
  ...MAIN_PATH.slice(0, 6).map((s) => [s, "rejected_by_household"] as const), // new..offer_made
  ...MAIN_PATH.slice(2, 7).map((s) => [s, "declined_by_applicant"] as const), // invited..moved_in
  ...MAIN_PATH.slice(0, 6).map((s) => [s, "withdrawn"] as const), // new..offer_made
  ["rejected_by_household", "archived"],
  ["declined_by_applicant", "archived"],
  ["withdrawn", "archived"],
  ["moved_in", "archived"],

  // Backward, main path (lines 69-74) — audited every time, per FR-0.11.
  ["screened", "new"],
  ["invited", "screened"],
  ["scheduled", "invited"],
  ["interviewed", "scheduled"],
  ["offer_made", "interviewed"],
  ["moved_in", "offer_made"],

  // "Reopen" (line 75): rejected/declined/withdrawn back to a main-path state. Scoped to exactly
  // the main-path range that could have led into that side state in the first place (the source's
  // "letzter Hauptpfad-Zustand" is not tracked as separate app state in F0's scope; this is the
  // narrowest reading that doesn't invent a broader graph than the source lines license).
  ...MAIN_PATH.slice(0, 6).map((s) => ["rejected_by_household", s] as const),
  ...MAIN_PATH.slice(0, 6).map((s) => ["withdrawn", s] as const),
  ...MAIN_PATH.slice(2, 7).map((s) => ["declined_by_applicant", s] as const),

  // Un-archive (line 76): exactly the four states line 63 allows to move into `archived`.
  ["archived", "rejected_by_household"],
  ["archived", "declined_by_applicant"],
  ["archived", "withdrawn"],
  ["archived", "moved_in"],
];

const TRANSITION_SET = new Set(TRANSITIONS.map(([from, to]) => `${from}->${to}`));

// FR-0.11: every one of these is a backward/reopen/un-archive move and must be audited.
const FORWARD_SET = new Set(
  [
    ...MAIN_PATH.slice(0, -1).map((s, i) => `${s}->${MAIN_PATH[i + 1]}`),
    ...MAIN_PATH.slice(0, 6).map((s) => `${s}->rejected_by_household`),
    ...MAIN_PATH.slice(2, 7).map((s) => `${s}->declined_by_applicant`),
    ...MAIN_PATH.slice(0, 6).map((s) => `${s}->withdrawn`),
    "rejected_by_household->archived",
    "declined_by_applicant->archived",
    "withdrawn->archived",
    "moved_in->archived",
  ],
);

export class InvalidTransitionError extends Error {
  constructor(from: ApplicationState, to: ApplicationState) {
    super(`Undeclared Application transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransitionAllowed(from: ApplicationState, to: ApplicationState): void {
  if (!TRANSITION_SET.has(`${from}->${to}`)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function isBackwardTransition(from: ApplicationState, to: ApplicationState): boolean {
  return !FORWARD_SET.has(`${from}->${to}`);
}
