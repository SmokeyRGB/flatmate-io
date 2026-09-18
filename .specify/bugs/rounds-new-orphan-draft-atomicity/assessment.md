# Bug Assessment: Orphan draft rounds left behind when open fails

- **Slug**: rounds-new-orphan-draft-atomicity
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot PR review finding)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> When opening fails a precondition (no rooms, all rooms locked, or no eligible residents), this
> action returns the error but leaves the newly inserted draft round and its
> `casting_round.created` audit event behind. Each retry from the form therefore accumulates
> orphan drafts that appear in the dashboard's round list. Create/open atomically, or explicitly
> remove/rollback the draft before returning the inline error.
> (file: `src/app/(org)/rounds/new/actions.ts` around line 32)

## Symptom

`createAndOpenRoundAction` calls `createRound` (its own committed transaction) and then
`openRound` (a second, separate committed transaction). If `openRound` throws
`RoundOpenPreconditionError` (EC-1.1/EC-1.2/EC-1.3), the already-committed draft round and its
`casting_round.created` ActivityEvent are never removed — the action just returns
`{ error: err.message }`. Retrying the form (e.g. after adding a room) creates another draft each
time, so failed attempts accumulate as visible orphan drafts in the dashboard's round list.
Expected: a failed open leaves no trace of the attempt, or the attempt is visibly rolled back.

## Reproduction

1. Sign in as a household admin with zero rooms created (or all rooms locked/no eligible
   residents).
2. Submit the "new round" form.
3. `createRound` commits a draft round + `casting_round.created` event.
4. `openRound` throws `RoundOpenPreconditionError` ("This round has no rooms selected" / "no
   eligible residents..." / all rooms locked).
5. The action returns `{ error }`; the draft round from step 3 remains in the DB and shows up on
   `/dashboard`.
6. Repeat steps 2–5: each retry adds another orphan draft.

## Suspected Code Paths

- `src/app/(org)/rounds/new/actions.ts:26-35` — calls `createRound` then `openRound` as two
  separate `await`s; on `RoundOpenPreconditionError` it returns early without touching the round
  created in the prior call.
- `src/modules/casting/repository.ts:212-233` (`createRound`) — its own `withSessionContext`
  transaction; commits independently of whether the subsequent open succeeds.
- `src/modules/casting/repository.ts:242-337` (`openRound`) — its own `withSessionContext`
  transaction; already internally atomic (all EC-1.x precondition checks + the snapshot/settings
  freeze happen in one transaction — see `tests/integration/policy/round-open-atomicity.test.ts`
  AC-1.10), but that atomicity doesn't extend back to the `createRound` call that preceded it.
- `src/db/session-context.ts:52-70` (`withSessionContext`) — each call opens its own
  `db.transaction`; `createRound` and `openRound` are currently two separate transactions, so
  there is no existing mechanism tying them together across the two exported functions.

## Root Cause Hypothesis

`createRound` and `openRound` are only ever called back-to-back from this one action (confirmed:
no other caller of either function exists in `src/`), but each opens and commits its own
transaction, so a failure in the second call cannot undo the first. Confidence: high — directly
visible in the code and consistent with the existing intra-`openRound` transaction handling, which
proves the codebase's transaction primitive (`withSessionContext` → `db.transaction`) already
rolls back cleanly on a thrown error when both steps share one transaction.

## Proposed Remediation

**Preferred**: Add a new repository function `createAndOpenRound(context, title, roomIds, actor)`
that performs the permission check once and then runs the draft-insert and the open logic inside
a single `withSessionContext` transaction, so a `RoundOpenPreconditionError` thrown during the
open phase automatically rolls back the draft insert and its audit event too (same mechanism
`openRound` itself already relies on for AC-1.10). To avoid duplicating the precondition/snapshot
logic, extract `createRound`'s insert body and `openRound`'s body into internal (non-exported)
helpers that accept an already-open `tx`, and have `createRound`, `openRound`, and the new
`createAndOpenRound` each open a transaction (or reuse the shared one) and call the appropriate
helper(s). Update `src/app/(org)/rounds/new/actions.ts` to call `createAndOpenRound` once instead
of `createRound` + `openRound`.

`createRound` and `openRound` stay exported and behaviorally unchanged for existing callers/tests
(`tests/unit/casting/round-open-preconditions.test.ts`,
`tests/integration/policy/round-open-atomicity.test.ts`, `tests/unit/casting/round-participant-list.test.ts`,
etc. all call them as two separate steps and must keep working exactly as before).

**Alternatives**:
- Manually delete the draft round + activity event in the action's `catch` block. Rejected:
  requires a second DB round-trip in a non-transactional cleanup that itself could fail/race, and
  duplicates rollback logic the DB already does natively for a single transaction; audit events
  are meant to be immutable (see `tests/unit/audit/immutability.test.ts`) so manually deleting one
  after the fact is a worse shape than never having committed it.

**Files likely to change**:
- `src/modules/casting/repository.ts` (new `createAndOpenRound`, refactor `createRound`/`openRound`
  bodies into shared tx-scoped helpers)
- `src/app/(org)/rounds/new/actions.ts` (call `createAndOpenRound` instead of two calls)
- A new/updated test file under `tests/integration/policy/` or `tests/unit/casting/` asserting
  that a failed open via the combined path leaves zero `casting_round` rows and zero
  `casting_round.created` ActivityEvents for that attempt.

**Tests to add or update**:
- New test: `createAndOpenRound` with a precondition failure (e.g., no rooms) leaves no
  `casting_round` row and no `casting_round.created` ActivityEvent behind (queried directly).
- Regression: existing `createRound`/`openRound` two-step tests continue to pass unmodified.

## Risks & Considerations

- Must not weaken `tests/integration/policy/round-open-atomicity.test.ts` (AC-1.10, EC-1.9) or any
  other `[GUARDED]` test — the refactor must keep `openRound`'s existing internal atomicity and
  its `SELECT ... FOR UPDATE` concurrency guard intact.
- `assertHasPermission` will now be called once for the combined path rather than twice
  (create's + open's) — behaviorally equivalent (same permission, same account), but worth noting
  since it changes call count in a permission-audit sense (not user-visible, no audit event
  produced by permission checks themselves).
- No schema/migration changes required.

## Open Questions

None.
