# Bug Assessment: `forceChangeSettingWhileRoundOpen` fails `tsc --noEmit` on `updatedByAccountId`

- **Slug**: force-change-setting-updatedby-type-error
- **Created**: 2026-09-17
- **Source**: pasted text (found during verification of [[force-change-setting-missing-permission-check]])
- **Verdict**: valid
- **Severity**: low

## Report (verbatim or summarized)

`npx tsc --noEmit -p .` fails with:

```
src/modules/casting/repository.ts(525,53): error TS2322: Type 'string | null' is not assignable to type 'string | SQL<unknown> | PgColumn<ColumnBaseConfig<ColumnDataType, string>, {}, {}> | undefined'.
  Type 'null' is not assignable to type 'string | SQL<unknown> | PgColumn<ColumnBaseConfig<ColumnDataType, string>, {}, {}> | undefined'.
```

## Symptom

`forceChangeSettingWhileRoundOpen` (src/modules/casting/repository.ts:512-536) guards `actor.accountId`
with `if (!actor.accountId) throw ...` at the top of the function, then later passes
`actor.accountId` directly into a typed Drizzle `.set({ ..., updatedByAccountId: actor.accountId })`
call inside a nested `withSessionContext(context, async (tx) => { ... })` closure. TypeScript does
not carry control-flow narrowing across a closure boundary for a mutable parameter binding, so
inside the closure `actor.accountId` is still typed `string | null`, which fails to satisfy the
`householdSettings.updatedByAccountId` column's `string` type. Nothing fails at runtime (the guard
already rules out `null`), but the build's type-check fails.

## Reproduction

1. Run `npx tsc --noEmit -p .` from the repo root.
2. Observe the `TS2322` error at `src/modules/casting/repository.ts:525:53`.

## Suspected Code Paths

- `src/modules/casting/repository.ts:512-536` (`forceChangeSettingWhileRoundOpen`) — the guard and
  the closure that loses its narrowing.
- `src/modules/identity/schema.ts` (`householdSettings.updatedByAccountId` column) — the target
  type that requires non-null `string`.

## Root Cause Hypothesis

High confidence. This is a well-known TypeScript limitation: narrowing a parameter (`actor.accountId`)
via a top-level guard does not propagate into a nested function literal, because the compiler
cannot prove the closure runs synchronously before any reassignment. The guard is semantically
correct; only the type-checker's view of it is stale inside the closure.

## Proposed Remediation

**Preferred**: Immediately after the existing guard, bind the narrowed value to a local
`const accountId = actor.accountId;` and use `accountId` (not `actor.accountId`) for the
`updatedByAccountId` field inside the closure. A `const` declared after the narrowing check keeps
its narrowed `string` type when captured by the closure, so this is a two-line fix with no runtime
change.

**Files likely to change**:
- `src/modules/casting/repository.ts`

**Tests to add or update**:
- None — this is a compile-time-only fix with no behavior change; the existing test suite already
  exercises this function at runtime. Verification is `npx tsc --noEmit -p .` passing.

## Risks & Considerations

- None — purely a type-level fix, no behavior change, no new dependency.

## Open Questions

None.
