# Bug Assessment: F1 room-transition repository path does not enforce F1's reachable-transition subset

- **Slug**: room-transitions-f1-scope-not-enforced
- **Created**: 2026-09-18
- **Source**: pasted text (Copilot PR #4 review, `src/modules/casting/room-transitions.ts:26`)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> `F1_REACHABLE_TRANSITIONS` is only described as a test aid and is never enforced by
> `transitionRoomStatus`, which calls `assertRoomTransitionAllowed` against the full `TRANSITIONS`
> set. As a result, the F1 repository/UI can already move rooms through
> `open -> promised -> occupied` (and their reverse transitions), despite the comments saying
> those paths are F3+-only. Gate the repository's F1 mutation path with the reachable subset
> (while retaining the full table for later state-machine validation).
> (`src/modules/casting/room-transitions.ts:26`, from PR #4 Copilot review)

## Symptom

`transitionRoomStatus` (in `src/modules/casting/repository.ts:129`) calls
`assertRoomTransitionAllowed(fromStatus, toStatus)`, which checks against the full `TRANSITIONS`
table (`room-transitions.ts:10-22`). That table includes `open->promised`, `promised->occupied`,
`promised->open`, `occupied->promised`, `occupied->open` — transitions the file's own comment
(lines 5-9, 16) says are "Application-state-driven, F3+" and "never reachable by anything F1's
repository calls." `F1_REACHABLE_TRANSITIONS` (line 27) exists but per its own comment (lines
24-26) is used only by `tests/unit/casting/room-transitions.test.ts` to assert the gap exists — it
is not consulted by the repository function that would need to enforce it. Expected: F1's
repository mutation path (`transitionRoomStatus`) rejects any transition outside
`F1_REACHABLE_TRANSITIONS`, leaving the full `TRANSITIONS` table only as a superset for future
(F3+) state-machine validation.

Confirmed authoritative scope: `docs/backlog/requirements/F1-requirements.md` FR-1.10/FR-1.11
define room states and independence but never assign F1 the responsibility of driving
`promised`/`occupied`; those are explicitly Application.state-driven per the code comment, which
is consistent with `docs/domain/zustandsmaschinen.md §3.3` being cited as the full table's source.
The bug report's characterization of scope is corroborated by the code's own comments, not just by
Copilot's inference.

A related, already-superseded/suppressed Copilot comment on `src/app/(org)/rooms/page.tsx:8` made
the same point from the UI side: `ROOM_STATUSES` (the `<select>` options for `transitionRoomAction`)
lists all six statuses, including `promised`/`occupied`, which — once the repository gate above is
tightened — would make the UI offer choices that always fail server-side (500/thrown
`InvalidRoomTransitionError` surfaced as an unhandled action error, since `transitionRoomAction`
does not appear to catch it). Fixing the repository alone without narrowing this list would leave
that dead-end UI path in place, so this is scoped as part of the same root-cause fix.

## Reproduction

1. As a household_admin with `manage_rooms` permission, have a room in state `open`.
2. Call `transitionRoomStatus(context, roomId, "promised", actor)` directly, or via the UI: select
   `promised` in the room's state `<select>` on `/rooms` (`src/app/(org)/rooms/page.tsx:50-56`) and
   submit.
3. Observe the transition succeeds (mutates `room.status` to `promised`) even though F1 comments
   and requirements say this path is F3+-only and Application-state-driven.

## Suspected Code Paths

- `src/modules/casting/room-transitions.ts:44-48` — `assertRoomTransitionAllowed` checks
  `TRANSITION_SET` (built from the full `TRANSITIONS`, line 35), not `F1_REACHABLE_TRANSITIONS`.
- `src/modules/casting/repository.ts:129-142` — `transitionRoomStatus`, F1's only repository
  mutation entrypoint for room state, calls `assertRoomTransitionAllowed` with no additional
  F1-scope gate.
- `src/app/(org)/rooms/page.tsx:8,50-56` — `ROOM_STATUSES` feeds the `<select>` in
  `transitionRoomAction`'s form with all six statuses, including the two F1 shouldn't expose.
- `src/app/(org)/rooms/actions.ts:44` — `transitionRoomAction`, the server action wired to that
  form; no client/server pre-filter beyond what `transitionRoomStatus` enforces.
- `tests/unit/casting/room-transitions.test.ts` — existing tests reportedly assert the pairs are
  "declared but unreachable" as a documentation-only property; this assessment did not find them
  asserting that `transitionRoomStatus` itself rejects those pairs (confirm and extend in
  `/speckit-bug-fix`).

## Root Cause Hypothesis

`F1_REACHABLE_TRANSITIONS` was added as a table for test assertions describing intended scope, but
nothing wires it into the enforcement path. `assertRoomTransitionAllowed` is a generic
state-machine-shape validator (any declared transition is "allowed"), while F1's package scope is
strictly narrower than what's declared for the whole machine. The repository function that is F1's
actual mutation surface needs its own, feature-scoped gate on top of (not instead of) the general
shape check, since the full table remains correct for future callers. Confidence: high — the code
comments already describe the intended boundary; only the enforcement wiring is missing.

## Proposed Remediation

**Preferred**: Add a second guard used only by F1's repository path — e.g.
`assertF1RoomTransitionAllowed(from, to)` in `room-transitions.ts` that checks
`F1_REACHABLE_TRANSITIONS` and throws `InvalidRoomTransitionError` (or a similarly named
F1-scoped error) — and call it from `transitionRoomStatus` in `repository.ts` in addition to (or
instead of, for this call site) `assertRoomTransitionAllowed`. Keep `TRANSITIONS` /
`assertRoomTransitionAllowed` unchanged and exported for future (F3+) state-machine work. Update
the file's header comments (lines 5-9, 24-26) so they no longer claim enforcement happens
elsewhere when it doesn't — the comment should describe the new guard as the actual enforcement
point.

Additionally, narrow `ROOM_STATUSES` in `src/app/(org)/rooms/page.tsx` (or derive the `<select>`
options from `F1_REACHABLE_TRANSITIONS`'s reachable target states, e.g. via a small exported
helper) so the UI never offers `promised`/`occupied` as choices the repository will reject. This
is an expansion of the reported bug's fix scope, done because leaving the UI unchanged after
tightening the repository gate would turn a silent behavioral bug into a user-facing 500/thrown
error on submit for those same options — same root cause (missing F1-scope enforcement), two call
sites.

**Alternatives**:
- Rename/repurpose `assertRoomTransitionAllowed` itself to check `F1_REACHABLE_TRANSITIONS` and
  keep a separate `assertAnyDeclaredRoomTransition` for the full table. Rejected as the preferred
  approach because other code (tests, possibly future callers) may already depend on
  `assertRoomTransitionAllowed`'s current full-table semantics; adding a new, explicitly-named F1
  guard is a smaller, less ambiguous diff.

**Files likely to change**:
- `src/modules/casting/room-transitions.ts`
- `src/modules/casting/repository.ts`
- `src/app/(org)/rooms/page.tsx`
- `tests/unit/casting/room-transitions.test.ts`

**Tests to add or update**:
- Unit test: `transitionRoomStatus` (or the new guard function directly) rejects
  `open -> promised`, `promised -> occupied`, `promised -> open`, `occupied -> promised`,
  `occupied -> open` with an error, even though they're present in `TRANSITIONS`.
- Unit test: `transitionRoomStatus` still accepts all five `F1_REACHABLE_TRANSITIONS` pairs
  (regression guard — don't over-tighten).
- UI/selector test (if a test harness covers `rooms/page.tsx`): the state `<select>` never renders
  `promised`/`occupied` options.

## Risks & Considerations

- Must not weaken any existing guarded test (per task constraints) — the fix adds a gate, it
  should not loosen `assertRoomTransitionAllowed`'s full-table check for any other caller.
- `TRANSITIONS`/`assertRoomTransitionAllowed` must remain intact and exported since the code
  comments describe them as the eventual full state-machine validator (F3+); do not delete or
  rename them.
- Keep the new F1 guard's error type/message clear enough that `transitionRoomAction` (or the UI)
  can surface a sane message rather than an unhandled 500, though a full error-boundary fix is out
  of scope unless trivial.

## Open Questions

None — F1 scope confirmed directly from `docs/backlog/requirements/F1-requirements.md`
(FR-1.10/FR-1.11) and the code's own comments; no clarification needed before fixing.
