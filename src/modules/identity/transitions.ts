import type { residentProfileStatusEnum } from "./schema";

export type ResidentProfileStatus = (typeof residentProfileStatusEnum.enumValues)[number];

// data-model.md "ResidentProfile" — four states: `prepared` (created by the household account,
// not yet claimed) → `active` (a Resident-Account signed up against it) → `moved_out` (FR-1.26's
// soft tier, `setMovedOut` — reversible) or `removed` (FR-1.26's hard tier, `removeMember` —
// U-27's „endgültig", final: no row has `removed` as its `from`). `prepared` can also go straight
// to `moved_out` (a profile created but never claimed, then removed from the household record; no
// caller reaches `prepared -> removed`, since removal acts on a membership and a `prepared`
// profile has none). `moved_out -> active` (added 2026-09-17, U-27/U-30): reactivateMember's
// reverse of the soft tier only — `removed -> active` is deliberately undeclared, and a narrow DB
// trigger (drizzle/0017) enforces the same refusal even against a direct update under
// `app_runtime`. Same "declared table, no silent fallthrough" discipline as F0's Application
// machine (ADR-002) — a separate, much smaller file, not a fourth branch bolted onto
// casting/transitions.ts.
export const TRANSITIONS: ReadonlyArray<readonly [ResidentProfileStatus, ResidentProfileStatus]> = [
  ["prepared", "active"],
  ["prepared", "moved_out"],
  ["active", "moved_out"],
  ["moved_out", "active"],
  ["active", "removed"],
  ["moved_out", "removed"],
];

// FR-1.4 (amended 2026-09-22): display-name uniqueness and the display-name sign-in lookup both
// exclude exactly these statuses. Named here, beside the transition table, so schema.ts's index
// predicate, repository.ts's isDisplayNameTaken and auth.ts's signIn lookup cannot drift apart
// silently (design.md Decision 4). SQL can't import this constant — the partial index's WHERE
// text is kept honest against it by tests/unit/identity/name-releasing-statuses.test.ts instead.
export const NAME_RELEASING_STATUSES = ["moved_out", "removed"] as const;

const TRANSITION_SET = new Set(TRANSITIONS.map(([from, to]) => `${from}->${to}`));

export class InvalidResidentProfileTransitionError extends Error {
  constructor(from: ResidentProfileStatus, to: ResidentProfileStatus) {
    super(`Undeclared ResidentProfile transition: ${from} -> ${to}`);
    this.name = "InvalidResidentProfileTransitionError";
  }
}

export function assertResidentProfileTransitionAllowed(
  from: ResidentProfileStatus,
  to: ResidentProfileStatus,
): void {
  if (!TRANSITION_SET.has(`${from}->${to}`)) {
    throw new InvalidResidentProfileTransitionError(from, to);
  }
}
