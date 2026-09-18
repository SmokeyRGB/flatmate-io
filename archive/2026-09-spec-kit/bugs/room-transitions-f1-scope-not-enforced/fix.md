# Bug Fix: F1 room-transition repository path does not enforce F1's reachable-transition subset

- **Slug**: room-transitions-f1-scope-not-enforced
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added an F1-scoped gate (`assertF1RoomTransitionAllowed`) that checks `F1_REACHABLE_TRANSITIONS`
on top of the existing full-table shape check, wired it into `transitionRoomStatus` (F1's only
repository mutation path for room state), and narrowed the `/rooms` UI's state `<select>` so it no
longer offers `promised`/`occupied` — options the repository now rejects.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/casting/room-transitions.ts` | added | New `assertF1RoomTransitionAllowed(from, to)`: calls `assertRoomTransitionAllowed` first (full-table shape check, unchanged), then additionally rejects anything outside `F1_REACHABLE_TRANSITIONS`. `TRANSITIONS`/`assertRoomTransitionAllowed`/`F1_REACHABLE_TRANSITIONS` left intact for future (F3+) use; updated the `F1_REACHABLE_TRANSITIONS` comment since it's no longer test-only. |
| `src/modules/casting/repository.ts` | modified | `transitionRoomStatus` now imports and calls `assertF1RoomTransitionAllowed` instead of `assertRoomTransitionAllowed`. |
| `src/app/(org)/rooms/page.tsx` | modified | Replaced the hardcoded `ROOM_STATUSES` (all six) with `F1_TARGET_STATUSES`, derived from `F1_REACHABLE_TRANSITIONS`'s target states, unioned with the room's current status so the `<select>` always has a matching option even for a state F1 doesn't drive to (e.g. a room already `planned`). |
| `tests/unit/casting/room-transitions.test.ts` | added tests | New `describe("assertF1RoomTransitionAllowed …")` block: accepts every F1-reachable pair, rejects `promised`/`occupied` and their reverses despite being in `TRANSITIONS`, and still rejects fully-undeclared pairs. |

## Diff Highlights

```ts
// room-transitions.ts
export function assertF1RoomTransitionAllowed(from: RoomStatus, to: RoomStatus): void {
  assertRoomTransitionAllowed(from, to);
  if (!F1_REACHABLE_TRANSITIONS.has(`${from}->${to}`)) {
    throw new InvalidRoomTransitionError(from, to);
  }
}
```

```ts
// repository.ts — transitionRoomStatus
const fromStatus = current.status;
assertF1RoomTransitionAllowed(fromStatus, toStatus);
```

```tsx
// rooms/page.tsx
const F1_TARGET_STATUSES = [
  ...new Set([...F1_REACHABLE_TRANSITIONS].map((pair) => pair.split("->")[1] as RoomStatus)),
];
// ...
{[...new Set([r.status, ...F1_TARGET_STATUSES])].map((s) => (
  <option key={s} value={s}>{s}</option>
))}
```

## Tests Added or Updated

- `tests/unit/casting/room-transitions.test.ts::assertF1RoomTransitionAllowed (F1 repository gate) > accepts every F1-reachable pair`
- `tests/unit/casting/room-transitions.test.ts::assertF1RoomTransitionAllowed (F1 repository gate) > rejects promised/occupied transitions and their reverses even though TRANSITIONS declares them`
- `tests/unit/casting/room-transitions.test.ts::assertF1RoomTransitionAllowed (F1 repository gate) > still rejects pairs undeclared by the full TRANSITIONS table`

No existing test was modified or weakened; the three original `describe` blocks in that file are
unchanged.

## Local Verification

- `npx vitest run tests/unit/casting/room-transitions.test.ts` → 7/7 passed (4 pre-existing + 3 new).
- `npx vitest run tests/unit/casting` → 19/19 passed across the whole casting module (no
  regressions from the repository/UI changes).
- `npx tsc --noEmit -p .` → no new type errors attributable to `room-transitions.ts`,
  `repository.ts`, or `rooms/page.tsx` (grepped the output for those paths; none matched).

## Deviations from Assessment

None. The assessment's preferred remediation (a new F1-scoped guard layered on the existing
full-table check, plus the UI selector expansion it explicitly called out) was applied as
proposed; no alternative was needed.

## Follow-ups

- When F3 implements Application-state-driven room transitions, `promised`/`occupied` will need
  their own (non-F1) call site using `assertRoomTransitionAllowed` directly (or a new
  `assertF3...` guard) rather than reusing `transitionRoomStatus`/`assertF1RoomTransitionAllowed`.
- `transitionRoomAction` (`src/app/(org)/rooms/actions.ts`) still has no visible error handling for
  a thrown `InvalidRoomTransitionError`; with the UI selector narrowed this is now unreachable via
  normal use, but a malformed/forged form submission would still hit an unhandled server action
  error. Out of scope for this fix (not called out in the assessment); worth a small follow-up if
  hardening against forged form data is a priority.
