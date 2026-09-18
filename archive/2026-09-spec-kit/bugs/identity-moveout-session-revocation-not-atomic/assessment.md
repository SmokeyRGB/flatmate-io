# Bug Assessment: Move-out and session/membership revocation not atomic

- **Slug**: identity-moveout-session-revocation-not-atomic
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot PR review comment)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> The move-out and session revocation are committed in separate transactions:
> `transitionResidentProfileStatus` can commit `moved_out` before `revokeMembershipForProfile`
> runs. If the second transaction fails (for example while updating sessions or writing the audit
> event), the profile is marked out but its existing session remains usable, violating the V-3
> guarantee documented above. Perform the status update, membership/session revocation, and audit
> writes in one transaction (and likewise for `removeMember`).

## Symptom

`setMovedOut` and `removeMember` (`src/modules/identity/repository.ts`) each call
`transitionResidentProfileStatus(...)` and then `revokeMembershipForProfile(...)` as two
sequential `await`s, each wrapped in its own `withSessionContext(...)` call (i.e. its own Postgres
transaction/commit). If the process crashes, the DB connection drops, or
`revokeMembershipForProfile` itself throws between the two calls, the `ResidentProfile` is already
committed as `moved_out` while the `Membership` stays un-revoked and any existing `Session` for
that account keeps resolving. That directly violates V-3
(`docs/domain/invarianten.md` §5.3, quoted in the comment above `revokeMembershipForProfile` at
repository.ts:344-349): "moved_out revokes access immediately... in the same step as the
ResidentProfile transition."

## Reproduction

1. Call `setMovedOut(context, actingAccountId, targetAccountId)` for a resident with an active
   session.
2. `transitionResidentProfileStatus` runs in its own transaction and commits `status = moved_out`.
3. Before `revokeMembershipForProfile` runs (or if it throws, e.g. a transient DB error while
   updating `session` or writing the `ActivityEvent`), the second transaction never commits.
4. Resulting state: `residentProfile.status = 'moved_out'`, but `membership.revokedAt` is still
   `null` and `session.revokedAt` is still `null` — the old session is still valid.

[NEEDS CLARIFICATION: no test currently exercises a mid-sequence failure/crash between the two
calls — this is inferred from reading the code, not observed via a live repro.]

## Suspected Code Paths

- `src/modules/identity/repository.ts:437-454` (`setMovedOut`) — two separate
  `withSessionContext` calls, no shared transaction.
- `src/modules/identity/repository.ts:403-433` (`removeMember`) — same pattern: a first
  `withSessionContext` read (name-confirmation check), then
  `transitionResidentProfileStatus` (its own transaction), then
  `revokeMembershipForProfile` (its own transaction) — three separate commits total.
- `src/modules/identity/repository.ts:84-130` (`transitionResidentProfileStatus`) — always opens
  its own `withSessionContext`; has no "run inside an existing tx" entry point.
- `src/modules/identity/repository.ts:350-383` (`revokeMembershipForProfile`) — same: always opens
  its own `withSessionContext`, no "run inside an existing tx" entry point.
- `src/db/session-context.ts:52-70` (`withSessionContext`) — one call = one `db.transaction(...)`;
  nesting two calls does not compose into one transaction (a nested `db.transaction` inside
  Drizzle would create a savepoint, but here the calls are sequential/sibling, not nested, so each
  fully commits before the next starts).
- `src/modules/casting/repository.ts:217-246, 255-372` (`insertDraftRoundTx`, `openRoundTx`,
  `createAndOpenRound`) — the codebase's existing idiom for this exact problem: a private
  `...Tx(tx, ...)` helper that takes an already-open `tx` and does no `withSessionContext` of its
  own, composed by one outer `withSessionContext` wrapper (`createAndOpenRound`) that calls both
  helpers against the same `tx`.

## Root Cause Hypothesis

High confidence. `transitionResidentProfileStatus` and `revokeMembershipForProfile` were each
written as fully self-contained (`withSessionContext`-opening) functions, presumably so they can
also be called standalone (`transitionResidentProfileStatus` is reused for the `prepared -> active`
claim step and for `reactivateMember`, where no revocation is needed). But `setMovedOut` and
`removeMember` then call both of these standalone functions back-to-back, which yields two
independent commits instead of one atomic unit — exactly the anti-pattern the casting module's
`createAndOpenRound` was already refactored to avoid (per its own comment trail). This is a plain
oversight: the `Tx`-suffixed-inner-function/one-outer-`withSessionContext` idiom already exists in
this codebase (`src/modules/casting/repository.ts`) and simply wasn't applied here yet.

## Proposed Remediation

**Preferred**: Split `transitionResidentProfileStatus` and `revokeMembershipForProfile` into
`...Tx(tx, ...)` inner helpers (taking an already-open `tx: Tx`, no `withSessionContext` call of
their own) plus thin public wrappers that call `withSessionContext(context, (tx) => xTx(tx, ...))`
for the existing standalone callers (claim step, `reactivateMember`, and any other current
call site that needs only one of the two). Then rewrite `setMovedOut` and `removeMember` to open
exactly one `withSessionContext` each and call both `...Tx` helpers against that single `tx`, so
the status update, membership revocation, session revocation, and both audit writes commit or roll
back together. This mirrors `createAndOpenRound`'s existing pattern
(`insertDraftRoundTx`/`openRoundTx` composed under one outer transaction) and needs a local `Tx`
type alias in `identity/repository.ts` matching the one already declared in
`casting/repository.ts:19` (`Parameters<Parameters<typeof withSessionContext>[1]>[0]`).

For `removeMember` specifically: its first `withSessionContext` block (membership/profile lookup +
display-name confirmation) can also be folded into the same outer transaction rather than being a
separate up-front read, since the whole operation is idempotent-safe to run as one unit; at minimum
the two write-bearing calls (`transitionResidentProfileStatus`, `revokeMembershipForProfile`) must
share one `tx`.

**Alternatives**:
- Wrap the two existing calls in a new outer `db.transaction` at the `setMovedOut`/`removeMember`
  level, passing a raw client/tx down and having `transitionResidentProfileStatus`/
  `revokeMembershipForProfile` detect and reuse an ambient transaction. Rejected: Drizzle's
  `db.transaction` does not provide ambient/implicit tx propagation here, and this would fight the
  explicit `Tx`-threading idiom this codebase already committed to in `casting/repository.ts`.
- Leave both functions as-is and add compensating rollback logic (re-flip status back to `active`
  if revocation fails). Rejected: more code, still has a window where a crash (not just a thrown
  error) leaves inconsistent state; a single transaction is strictly simpler and matches P-4
  (Reversibilität/auditability) better than best-effort compensation.

**Files likely to change**:
- `src/modules/identity/repository.ts` (both `transitionResidentProfileStatus` and
  `revokeMembershipForProfile` refactored into `Tx` helpers + wrappers; `setMovedOut` and
  `removeMember` rewritten to share one `withSessionContext`/`tx`)

**Tests to add or update**:
- A test asserting that `setMovedOut` performs exactly one `withSessionContext`/transaction (or,
  more robustly, a test that forces `revokeMembershipForProfile`'s logic to throw after the status
  update would have applied and asserts `residentProfile.status` is rolled back to its prior value
  — proving atomicity rather than counting calls).
- Existing tests for `setMovedOut`/`removeMember`/`reactivateMember`/claim-step transitions must
  still pass unchanged (regression check that the refactor doesn't alter observable behavior on
  the happy path).

## Risks & Considerations

- `transitionResidentProfileStatus` is also called from the claim step (`prepared -> active`) and
  `reactivateMember` — the refactor must keep a standalone public entry point for those call sites
  with identical behavior/signature, or update those call sites too.
- Must check `src/app/(auth)/claim/actions.ts` for a call before assuming a signature change is
  safe (handled as part of bugs 2/3 below, not touched by this bug's fix).
- `revokeMembershipForProfile` is `async function` (not exported) — safe to change its internal
  shape freely since it has no external callers.
- No migration/schema change needed — this is purely a transaction-boundary refactor.
- Must not weaken any `[GUARDED]` test in `test/guarded.manifest.json`; grep for guarded tests
  covering `setMovedOut`/`removeMember`/session revocation before editing.

## Open Questions

- [NEEDS CLARIFICATION: none blocking — recommend proceeding straight to fix, following the
  `createAndOpenRound` idiom already established in this codebase.]
