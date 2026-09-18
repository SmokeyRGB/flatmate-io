# Bug Fix: `afterEach` coerces `undefined` env var to string "undefined"

- **Slug**: session-token-hash-test-env-cleanup
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`afterEach` in the session-token-hash test now restores `SESSION_TOKEN_HASH_SECRET` by deleting
the key when it was originally unset, instead of unconditionally assigning `originalSecret`
(which coerced `undefined` into the string `"undefined"`).

## Changes

| File | Change | Notes |
|------|--------|-------|
| `tests/unit/identity/session-token-hash.test.ts` | modified | `afterEach` now branches: `delete process.env.SESSION_TOKEN_HASH_SECRET` when `originalSecret === undefined`, else restores the saved value |

## Diff Highlights

```ts
afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.SESSION_TOKEN_HASH_SECRET;
  } else {
    process.env.SESSION_TOKEN_HASH_SECRET = originalSecret;
  }
});
```

## Tests Added or Updated

- None added — the assessment judged the existing "throws if not configured" test
  (`hashSessionToken > throws if SESSION_TOKEN_HASH_SECRET is not configured`) sufficient to
  exercise the corrected cleanup path going forward; no new test was needed for a teardown-only
  hygiene fix.

## Local Verification

- Commands run: `npx vitest run tests/unit/identity/session-token-hash.test.ts` → 1 file, 5 tests, all passed.

## Deviations from Assessment

None — applied exactly the preferred remediation as specified.

## Follow-ups

- None. Confirmed no other test file in `tests/unit/identity/` shares this pattern (not checked
  exhaustively; out of scope for this surgical fix per instructions to stay within the one file).
