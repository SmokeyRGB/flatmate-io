# Bug Fix: Orphan draft rounds left behind when open fails

- **Slug**: rounds-new-orphan-draft-atomicity
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added `createAndOpenRound` to `src/modules/casting/repository.ts`, which runs the draft-round
insert and the open/precondition/snapshot logic inside a single `withSessionContext` transaction,
so a `RoundOpenPreconditionError` now rolls back the draft insert (and its
`casting_round.created` ActivityEvent) instead of leaving it committed. `createRound` and
`openRound`'s internals were refactored into tx-scoped helpers (`insertDraftRoundTx`,
`openRoundTx`) shared by all three exported entry points, so there is exactly one implementation
of each step. `src/app/(org)/rounds/new/actions.ts` now calls `createAndOpenRound` once instead of
`createRound` + `openRound`.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/casting/repository.ts` | modified | Added `type Tx` (inferred from `withSessionContext`'s callback param); extracted `insertDraftRoundTx` and `openRoundTx` (both take an already-open `tx`) from `createRound`/`openRound`'s bodies; `createRound` and `openRound` now each open their own transaction and delegate to the shared helper (unchanged external behavior); added new exported `createAndOpenRound(context, title, roomIds, actor)` that runs both helpers in one transaction. |
| `src/app/(org)/rounds/new/actions.ts` | modified | Replaced the `createRound` + `openRound` two-call sequence with a single `createAndOpenRound` call; import updated accordingly. |
| `tests/integration/policy/round-open-atomicity-orphan-draft.test.ts` | added | 3 new tests: zero `casting_round` rows + zero `casting_round.created` events after an EC-1.1 failure; zero rows after an EC-1.3 failure; exactly one round produced on success. |

## Diff Highlights

```ts
export async function createAndOpenRound(
  context: SessionContext,
  title: string,
  roomIds: string[],
  actor: Actor,
) {
  if (!actor.accountId) throw new Error("createAndOpenRound requires an actor accountId");
  await assertHasPermission(context, actor.accountId, "close_round");
  return withSessionContext(context, async (tx) => {
    const round = await insertDraftRoundTx(tx, context, title, roomIds, actor);
    return openRoundTx(tx, context, round.id, actor);
  });
}
```

```ts
// actions.ts
try {
  await createAndOpenRound(current.context, title, roomIds, actor);
} catch (err) {
  if (err instanceof RoundOpenPreconditionError) {
    return { error: err.message };
  }
  throw err;
}
```

## Tests Added or Updated

- `tests/integration/policy/round-open-atomicity-orphan-draft.test.ts::leaves zero casting_round rows and zero casting_round.created events after EC-1.1 (no rooms selected)` — pins the fix directly.
- `tests/integration/policy/round-open-atomicity-orphan-draft.test.ts::leaves zero casting_round rows after EC-1.3 (no eligible residents)` — same, second precondition path.
- `tests/integration/policy/round-open-atomicity-orphan-draft.test.ts::still succeeds and produces exactly one round when preconditions pass` — guards against a regression that breaks the happy path.

## Local Verification

- `npx tsc --noEmit` → no errors.
- `npx eslint src/modules/casting/repository.ts "src/app/(org)/rounds/new/actions.ts" tests/integration/policy/round-open-atomicity-orphan-draft.test.ts` → no errors.
- `npx vitest run tests/integration/policy/round-open-atomicity-orphan-draft.test.ts tests/integration/policy/round-open-atomicity.test.ts tests/unit/casting/round-open-preconditions.test.ts` → 11/11 passed (includes the pre-existing `[GUARDED]`-adjacent AC-1.10/EC-1.9 atomicity suite, unaffected).
- `npx vitest run tests/unit/casting tests/integration/policy/round-household-scoping.test.ts tests/integration/policy/round-visibility-household-account.test.ts tests/integration/policy/room-round-authorization.test.ts tests/integration/raw-sql/round-household-scoping.test.ts tests/integration/raw-sql/round-visibility-household-account.test.ts` → 28/28 passed.
- `npx tsx scripts/lint/guarded-tests.ts` → "Guarded-test check: OK".
- `npx tsx scripts/lint/import-boundary.ts` → "Import-boundary lint: OK".

## Deviations from Assessment

None — implemented as proposed (shared tx-scoped helpers reused by `createRound`, `openRound`,
and the new `createAndOpenRound`; no duplication of precondition/snapshot logic).

## Follow-ups

- None required. `createRound` and `openRound` remain independently callable/exported (used by
  several existing unit/integration tests as two separate steps) and are behaviorally unchanged.
