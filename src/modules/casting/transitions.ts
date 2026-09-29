import type { applicationStateEnum } from "./schema";

export type ApplicationState = (typeof applicationStateEnum.enumValues)[number];

// Exported for task-precedence.ts's phaseOf/distributionOf (start-screen design.md Decision 6) —
// the furthest-main-path-state rule reuses this list rather than re-declaring it.
export const MAIN_PATH = [
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

// Kept for the state-machine tests (FR-0.10). Which pairs are declared is answered in ONE place,
// TRANSITION_RULES below, whose key set equals TRANSITIONS (transition-rules.test.ts), so this is
// ruleFor without the rule (code review: a second set of declared pairs was maintenance cost).
export function assertTransitionAllowed(from: ApplicationState, to: ApplicationState): void {
  ruleFor(from, to);
}

export function isBackwardTransition(from: ApplicationState, to: ApplicationState): boolean {
  return !FORWARD_SET.has(`${from}->${to}`);
}

// ---------------------------------------------------------------------------------------------
// One declared RULE per declared pair (F3 change 3, design D6a; ADR-002: a second column of the
// same table, never a rule derived in code).
//
// Most transitions past `invited` have side effects docs/domain/zustandsmaschinen.md §3.1 lists
// (an appointment confirmed and a slot freed, a room promised, a resident profile created). A
// generic "set the state" function that executed those rows would skip every one of them, so the
// generic path (`transitionApplication`) can take only the rows declared `state_only`. The rest
// are `pending`: they belong to a step that is not built yet and declare NO rights, because
// guessing a later feature's permissions now would fix its design.
//
// Extending, per later step. The feature that builds a step, in one change:
//   1. builds the operation that carries the step's effects (for example `confirmAppointment`);
//   2. turns that step's rows into an `operation` kind naming the operation, with their
//      `requires` (that kind is NOT added here: no operation exists yet, the first feature that
//      builds one adds it);
//   3. adds any new permission to the role sets the matrix gives it to (constant, backfill and
//      CHECK: domain/identity.md §2.1).
// The operation runs the same private step as `transitionApplication` (`applyTransitionTx` in
// repository.ts), which checks EVERY entry of a row's `requires`, so a permission rule is never
// written twice.
//
// A reopening belongs to the step of its TARGET and is re-classified with the forward row into
// that state. Otherwise it would be a bypass the day the forward row gains an operation
// (`rejected_by_household -> invited` would skip F5's invite).
//
// Sibling pattern: F1_REACHABLE_TRANSITIONS in room-transitions.ts, an executable subset beside
// the declared table. This file stays pure: nothing here imports identity or the database.
// ---------------------------------------------------------------------------------------------
export const PENDING_STEPS = [
  "appointment",
  "interview",
  "offer",
  "move_in",
  "move_in_reversal",
  "retention",
] as const;
export type PendingStep = (typeof PENDING_STEPS)[number];

export type TransitionKey = `${ApplicationState}->${ApplicationState}`;

export type TransitionRule =
  // Executable by transitionApplication. `requires` is written out per row so that a row can grow
  // its own permission later without a code branch.
  | { kind: "state_only"; requires: readonly string[] }
  // A step not built yet: refused as not available. Declares no rights.
  | { kind: "pending"; step: PendingStep };

// Explicit type arguments keep `kind` a literal union, never a widened string.
export const TRANSITION_RULES = new Map<TransitionKey, TransitionRule>([
  ["new->screened", { kind: "state_only", requires: ["change_application_state"] }],
  ["screened->invited", { kind: "state_only", requires: ["change_application_state"] }],
  ["invited->scheduled", { kind: "pending", step: "appointment" }],
  ["scheduled->interviewed", { kind: "pending", step: "interview" }],
  ["interviewed->offer_made", { kind: "pending", step: "offer" }],
  ["offer_made->moved_in", { kind: "pending", step: "move_in" }],
  ["new->rejected_by_household", { kind: "state_only", requires: ["change_application_state"] }],
  ["screened->rejected_by_household", { kind: "state_only", requires: ["change_application_state"] }],
  ["invited->rejected_by_household", { kind: "state_only", requires: ["change_application_state"] }],
  ["scheduled->rejected_by_household", { kind: "pending", step: "appointment" }],
  ["interviewed->rejected_by_household", { kind: "pending", step: "interview" }],
  ["offer_made->rejected_by_household", { kind: "pending", step: "offer" }],
  ["invited->declined_by_applicant", { kind: "state_only", requires: ["change_application_state"] }],
  ["scheduled->declined_by_applicant", { kind: "pending", step: "appointment" }],
  ["interviewed->declined_by_applicant", { kind: "pending", step: "interview" }],
  ["offer_made->declined_by_applicant", { kind: "pending", step: "offer" }],
  ["moved_in->declined_by_applicant", { kind: "pending", step: "move_in_reversal" }],
  ["new->withdrawn", { kind: "state_only", requires: ["change_application_state"] }],
  ["screened->withdrawn", { kind: "state_only", requires: ["change_application_state"] }],
  ["invited->withdrawn", { kind: "state_only", requires: ["change_application_state"] }],
  ["scheduled->withdrawn", { kind: "pending", step: "appointment" }],
  ["interviewed->withdrawn", { kind: "pending", step: "interview" }],
  ["offer_made->withdrawn", { kind: "pending", step: "offer" }],
  ["rejected_by_household->archived", { kind: "pending", step: "retention" }],
  ["declined_by_applicant->archived", { kind: "pending", step: "retention" }],
  ["withdrawn->archived", { kind: "pending", step: "retention" }],
  ["moved_in->archived", { kind: "pending", step: "retention" }],
  ["screened->new", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["invited->screened", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["scheduled->invited", { kind: "pending", step: "appointment" }],
  ["interviewed->scheduled", { kind: "pending", step: "interview" }],
  ["offer_made->interviewed", { kind: "pending", step: "offer" }],
  ["moved_in->offer_made", { kind: "pending", step: "move_in_reversal" }],
  ["rejected_by_household->new", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["rejected_by_household->screened", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["rejected_by_household->invited", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["rejected_by_household->scheduled", { kind: "pending", step: "appointment" }],
  ["rejected_by_household->interviewed", { kind: "pending", step: "interview" }],
  ["rejected_by_household->offer_made", { kind: "pending", step: "offer" }],
  ["withdrawn->new", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["withdrawn->screened", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["withdrawn->invited", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["withdrawn->scheduled", { kind: "pending", step: "appointment" }],
  ["withdrawn->interviewed", { kind: "pending", step: "interview" }],
  ["withdrawn->offer_made", { kind: "pending", step: "offer" }],
  ["declined_by_applicant->invited", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["declined_by_applicant->scheduled", { kind: "pending", step: "appointment" }],
  ["declined_by_applicant->interviewed", { kind: "pending", step: "interview" }],
  ["declined_by_applicant->offer_made", { kind: "pending", step: "offer" }],
  ["declined_by_applicant->moved_in", { kind: "pending", step: "move_in" }],
  ["archived->rejected_by_household", { kind: "pending", step: "retention" }],
  ["archived->declined_by_applicant", { kind: "pending", step: "retention" }],
  ["archived->withdrawn", { kind: "pending", step: "retention" }],
  ["archived->moved_in", { kind: "pending", step: "retention" }],
]);

export function ruleFor(from: ApplicationState, to: ApplicationState): TransitionRule {
  const rule = TRANSITION_RULES.get(`${from}->${to}`);
  if (!rule) throw new InvalidTransitionError(from, to);
  return rule;
}
