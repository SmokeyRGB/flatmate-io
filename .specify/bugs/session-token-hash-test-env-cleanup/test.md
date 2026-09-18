# Bug Verification: `afterEach` coerces `undefined` env var to string "undefined"

- **Slug**: session-token-hash-test-env-cleanup
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The `afterEach` in `tests/unit/identity/session-token-hash.test.ts` now conditionally deletes
`SESSION_TOKEN_HASH_SECRET` when it was originally unset, instead of coercing it to the string
`"undefined"`. Re-running the file alone and alongside a sibling identity test file shows no
regressions and no cross-test environment pollution.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Inspected `afterEach` logic against `originalSecret === undefined` (the shell's ambient `SESSION_TOKEN_HASH_SECRET` was unset for this run) | pass | Restore now deletes the key instead of assigning `String(undefined)` |
| Full test file | `npx vitest run tests/unit/identity/session-token-hash.test.ts` | pass | 1 file, 5 tests passed |
| Sibling file (pollution check) | `npx vitest run tests/unit/identity/session-token-hash.test.ts tests/unit/identity/session-cookie-malformed-uuid.test.ts` | pass | 2 files, 8 tests passed — no order-dependent failures |
| Lint / type-check | not-run | — | Not requested; change is a two-line conditional in an existing test file, no new types/imports |

## Output Excerpts

```
Test Files  1 passed (1)
     Tests  5 passed (5)
```
```
Test Files  2 passed (2)
     Tests  8 passed (8)
```

## Residual Risks

- Verification ran with the ambient shell environment having `SESSION_TOKEN_HASH_SECRET` unset,
  which is the exact condition the bug required to manifest; the fix's `delete` branch was
  exercised on every `afterEach` in the file, including the one following the
  "throws if not configured" test.
- Did not exhaustively check whether vitest's default runner isolates each test file into its
  own process/worker in this project (the assessment flagged this as unresolved). It does not
  change the correctness of the fix, only how far the historical blast radius reached before.

## Recommendation

Close the bug — verified. The conditional restore matches the exact remediation Copilot proposed,
the full test file passes, and running it alongside a sibling identity test file shows no leaked
environment state.
