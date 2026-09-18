import type { roomStatusEnum } from "./schema";

export type RoomStatus = (typeof roomStatusEnum.enumValues)[number];

// The F1-reachable subset of docs/domain/zustandsmaschinen.md §3.3's table — a separate file from
// transitions.ts (Application-only, F0's existing convention: one state machine per file).
// `promised`/`occupied` and their reverses are driven by Application.state changes (F3+, out of
// F1's scope) and are declared here for completeness but never reachable by anything F1's
// repository calls — the second test in room-transitions.test.ts asserts exactly that.
export const TRANSITIONS: ReadonlyArray<readonly [RoomStatus, RoomStatus]> = [
  ["planned", "open"],
  ["open", "on_hold"],
  ["on_hold", "open"],
  ["open", "not_available"],
  ["on_hold", "not_available"],
  // Declared, not reachable from F1's repository (Application-state-driven, F3+):
  ["open", "promised"],
  ["promised", "occupied"],
  ["promised", "open"],
  ["occupied", "promised"],
  ["occupied", "open"],
];

// The subset of TRANSITIONS this feature's repository functions actually expose. Enforced by
// assertF1RoomTransitionAllowed below (F1's repository mutation path), in addition to the full
// TRANSITIONS shape-check — not a test-only aid.
export const F1_REACHABLE_TRANSITIONS: ReadonlySet<string> = new Set([
  "planned->open",
  "open->on_hold",
  "on_hold->open",
  "open->not_available",
  "on_hold->not_available",
]);

const TRANSITION_SET = new Set(TRANSITIONS.map(([from, to]) => `${from}->${to}`));

export class InvalidRoomTransitionError extends Error {
  constructor(from: RoomStatus, to: RoomStatus) {
    super(`Undeclared Room transition: ${from} -> ${to}`);
    this.name = "InvalidRoomTransitionError";
  }
}

export function assertRoomTransitionAllowed(from: RoomStatus, to: RoomStatus): void {
  if (!TRANSITION_SET.has(`${from}->${to}`)) {
    throw new InvalidRoomTransitionError(from, to);
  }
}

// F1-scoped gate: on top of the general shape-check above, reject anything outside the subset
// F1's repository is allowed to drive. promised/occupied and their reverses stay declared in
// TRANSITIONS for the eventual full state machine (F3+, Application.state-driven) but are
// rejected here.
export function assertF1RoomTransitionAllowed(from: RoomStatus, to: RoomStatus): void {
  assertRoomTransitionAllowed(from, to);
  if (!F1_REACHABLE_TRANSITIONS.has(`${from}->${to}`)) {
    throw new InvalidRoomTransitionError(from, to);
  }
}
