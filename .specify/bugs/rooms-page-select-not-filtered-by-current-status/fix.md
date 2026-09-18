# Bug Fix: Rooms page status select offers illegal transitions

- **Slug**: rooms-page-select-not-filtered-by-current-status
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Replaced the module-level flattened `F1_TARGET_STATUSES` list (union of every F1-reachable `to`
across all rooms) with a per-room lookup, `f1TargetStatusesFor(status)`, exported from
`room-transitions.ts` and filtered by `from === status`. The rooms page now calls it per room, so
each room's select only ever offers targets legal from that room's own current status.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/casting/room-transitions.ts` | added `f1TargetStatusesFor(status)` | Filters `F1_REACHABLE_TRANSITIONS` by `from === status`, returns `[status, ...targets]` deduped. |
| `src/app/(org)/rooms/page.tsx` | modified | Removed the flattened `F1_TARGET_STATUSES` constant and the `F1_REACHABLE_TRANSITIONS`/`RoomStatus` import it needed; select options now come from `f1TargetStatusesFor(r.status)`. |
| `tests/unit/casting/room-transitions.test.ts` | added tests | New `describe("f1TargetStatusesFor …")` block. |

## Diff Highlights

```ts
// room-transitions.ts
export function f1TargetStatusesFor(status: RoomStatus): RoomStatus[] {
  const targets = [...F1_REACHABLE_TRANSITIONS]
    .filter((pair) => pair.startsWith(`${status}->`))
    .map((pair) => pair.split("->")[1] as RoomStatus);
  return [...new Set([status, ...targets])];
}
```

```tsx
// page.tsx
{f1TargetStatusesFor(r.status).map((s) => (
  <option key={s} value={s}>{s}</option>
))}
```

## Tests Added or Updated

- `tests/unit/casting/room-transitions.test.ts::f1TargetStatusesFor (rooms page select options)`
  - "offers only the current status's own declared F1 targets, plus itself" — pins `planned` →
    `{planned, open}` (was previously wrongly including `on_hold`/`not_available`), `open` →
    `{open, on_hold, not_available}`, `on_hold` → `{on_hold, open, not_available}`.
  - "falls back to just the current status when it has no outgoing F1 transition" — covers
    `not_available`, `promised`, `occupied`.
  - "every option it returns for a status is actually accepted by assertF1RoomTransitionAllowed"
    — cross-checks the option list against the actual server-action gate so the two can't drift
    apart again.

## Local Verification

- Commands run: `npx vitest run tests/unit/casting/room-transitions.test.ts` → 10/10 passed
  (7 pre-existing + 3 new).
- Commands run: `npx tsc --noEmit -p .` → no errors.
- Manual checks: none (no dev server run); logic verified by the added tests exercising every
  F1-reachable `from` status.

## Deviations from Assessment

None. Implemented the assessment's preferred remediation (filter by `from === room.status`,
against `F1_REACHABLE_TRANSITIONS` per the assessment's reasoning for why `TRANSITIONS` alone
would be wrong).

## Follow-ups

- None required. `assertF1RoomTransitionAllowed` and `F1_REACHABLE_TRANSITIONS` were untouched —
  they were already correct.
