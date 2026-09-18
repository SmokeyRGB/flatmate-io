import type { residentProfileStatusEnum } from "./schema";

export type ResidentProfileStatus = (typeof residentProfileStatusEnum.enumValues)[number];

// data-model.md "ResidentProfile" — three states: `prepared` (created by the household account,
// not yet claimed) → `active` (a Resident-Account signed up against it) → `moved_out` (FR-1.26's
// `moved_out`/`removeMember` actions, both tiers of U-27's two-tier removal). `prepared` can also
// go straight to `moved_out` (a profile created but never claimed, then removed from the
// household record). `moved_out -> active` (added 2026-09-17, U-27/U-30): reactivateMember's
// reverse of either removal tier. Same "declared table, no silent fallthrough" discipline as F0's
// Application machine (ADR-002) — a separate, much smaller file, not a fourth branch bolted onto
// casting/transitions.ts.
export const TRANSITIONS: ReadonlyArray<readonly [ResidentProfileStatus, ResidentProfileStatus]> = [
  ["prepared", "active"],
  ["prepared", "moved_out"],
  ["active", "moved_out"],
  ["moved_out", "active"],
];

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
