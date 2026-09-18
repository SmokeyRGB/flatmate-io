# Bug Assessment: Rooms page status select offers illegal transitions

- **Slug**: rooms-page-select-not-filtered-by-current-status
- **Created**: 2026-09-18
- **Source**: pasted text (Copilot PR #4 review comment on `src/app/(org)/rooms/page.tsx` ~line 14)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim)

> This flattens every F1 transition target into every room's select, so a room in `planned` is
> offered `on_hold` and `not_available` even though neither transition is declared. Submitting
> one of those options reaches `assertF1RoomTransitionAllowed`, throws, and produces an unhandled
> server-action error instead of a valid state change. Build the options from the current room
> status (or filter `TRANSITIONS` by `from`) so only legal targets are rendered.

## Symptom

For every room, the `toStatus` `<select>` in the "Change state" form lists the union of *all*
F1-reachable transition targets (`open`, `on_hold`, `not_available`) plus the room's own current
status, regardless of what that specific room's current status actually allows a transition to.
E.g. a room in `planned` shows options `planned`, `open`, `on_hold`, `not_available` — but from
`planned` only `open` is a legal next state per `F1_REACHABLE_TRANSITIONS`. Picking `on_hold` or
`not_available` and submitting throws in `assertF1RoomTransitionAllowed`, surfacing as an
unhandled server-action error instead of a graceful no-op/validation message.

Expected: the select only ever offers targets that are legal from the room's *own* current
status (i.e., filtered by `from === room.status`).

## Reproduction

1. Seed/have a room with `status = "planned"`.
2. Load `/rooms`.
3. Observe the room's "Change state" select contains `on_hold` and `not_available` in addition
   to `open`.
4. Select `on_hold`, submit → `transitionRoomAction` → `assertF1RoomTransitionAllowed("planned", "on_hold")` throws `InvalidRoomTransitionError`, producing an unhandled server-action error to the user instead of a normal validation failure.

## Suspected Code Paths

- `src/app/(org)/rooms/page.tsx:12-14` — `F1_TARGET_STATUSES` is computed once, globally, as the
  flattened set of every `to` across all of `F1_REACHABLE_TRANSITIONS`, independent of any room.
- `src/app/(org)/rooms/page.tsx:59` — each room's `<select>` options are built from
  `[...new Set([r.status, ...F1_TARGET_STATUSES])]`, i.e. the same flat list for every room, only
  ever adding (never filtering by) the room's own current status.
- `src/modules/casting/room-transitions.ts:27-33` (`F1_REACHABLE_TRANSITIONS`) and `:54-59`
  (`assertF1RoomTransitionAllowed`) — this is the set/function the select's options should be
  filtered against per-room; `assertF1RoomTransitionAllowed` is what the server action
  (`transitionRoomAction`, not shown here but referenced) calls, and it validates using
  `F1_REACHABLE_TRANSITIONS` (via `assertRoomTransitionAllowed` + the F1 subset check), not the
  full `TRANSITIONS` table. So the select must be filtered by `F1_REACHABLE_TRANSITIONS` entries
  whose `from` matches `r.status`, to stay consistent with what the action actually allows.

## Root Cause Hypothesis

High confidence. This is a leftover from the prior fix (`room-transitions-f1-scope-not-enforced`)
that replaced a hardcoded 6-status list with `F1_REACHABLE_TRANSITIONS`-derived options, but
computed that derivation once at the top of the page (flattening all `to` targets across every
`from`) instead of per-room. The fix correctly scoped *which status values exist at all* but never
scoped *which are reachable from this room's current state*.

## Proposed Remediation

**Preferred**: Remove the module-level `F1_TARGET_STATUSES` flattening. Inside the room `.map`,
compute each room's own legal target list by filtering `F1_REACHABLE_TRANSITIONS` (parsed back
into `[from, to]` pairs, or filter the string keys by `startsWith(`${r.status}->`)`) for entries
whose `from === r.status`, then render `[r.status, ...thoseTargets]` (deduped) as the options —
preserving the existing behavior of always including the room's current status even when it has
no outgoing F1 transition (e.g. `not_available`, which is a terminal state in F1's reachable
subset).

**Alternatives**:
- Filter `TRANSITIONS` (the full table) instead of `F1_REACHABLE_TRANSITIONS`. Rejected: the
  server action validates via `assertF1RoomTransitionAllowed`, which additionally restricts to
  `F1_REACHABLE_TRANSITIONS`; filtering the UI by the wider `TRANSITIONS` table would still let
  the user pick e.g. `open -> promised`, which the action rejects. Must filter by
  `F1_REACHABLE_TRANSITIONS` to match what the action actually permits.

**Files likely to change**:
- `src/app/(org)/rooms/page.tsx`

**Tests to add or update**:
- A test (page-level or unit-extracted helper) asserting that for each F1-reachable `from`
  status, the computed option list matches only that status's declared `to` targets (plus itself)
  — e.g. `planned` → `{planned, open}`, `open` → `{open, on_hold, not_available}`, `on_hold` →
  `{on_hold, open, not_available}`, `not_available` → `{not_available}` (no outgoing F1
  transitions).

## Risks & Considerations

- Small, isolated diff inside a single Server Component; no schema/migration/security impact.
- Must keep including the room's own current status as an option even when it has no outgoing
  transition (`not_available` today), to avoid an empty/broken select.
- Should not change `F1_REACHABLE_TRANSITIONS`/`assertF1RoomTransitionAllowed` — those are correct
  and already covered by existing tests per the prior fix.

## Open Questions

None.
