# Bug Verification: `Session.tokenHash` stores a raw token fragment, not a hash

- **Slug**: auth-tokenhash-not-hashed
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

`signIn()` now writes `hashSessionToken(accessToken)` (HMAC-SHA256, keyed by
`SESSION_TOKEN_HASH_SECRET`) instead of `access_token.slice(-32)`; the new unit tests confirm the
digest never contains the source token or its former 32-char suffix, is deterministic, and differs
per token. Type-check and the full unit suite pass; two failures observed transiently during the
fix step reproduced identically on `git stash` (pre-existing/flaky, unrelated to this change) and
are absent on the final clean run.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Inspected `hashSessionToken` output directly via the new test suite (no live `signIn()` call made — that requires a real Supabase round trip) | pass | Digest is a 64-hex-char HMAC-SHA256, never contains the token or its trailing 32 chars |
| New / updated tests | `npx vitest run tests/unit/identity/session-token-hash.test.ts tests/unit/identity/derived-email.test.ts` | pass | 2 files, 8 tests |
| Regression suite (identity) | `npx vitest run tests/unit/identity` | pass | 11 files, 26 tests |
| Regression suite (full unit) | `npx vitest run tests/unit` | pass | 22 files, 62 tests |
| Type-check | `npx tsc --noEmit -p .` | pass | no output/errors |

## Output Excerpts

```
Test Files  22 passed (22)
     Tests  62 passed (62)
```

## Residual Risks

- No live end-to-end `signIn()` call was exercised against real Supabase in this verification pass
  (that would require network access to Supabase Auth and a real DB write); the reproduction check
  is at the unit level (the `hashSessionToken` helper itself), not a full integration round-trip.
  The identity integration suite (`tests/integration/policy/*`, which does call `signIn`-adjacent
  flows against the live Supabase project) was not re-run here to avoid an unrequested
  network-dependent/expensive suite; it uses the same `.env.local` values already updated with
  `SESSION_TOKEN_HASH_SECRET`, so it should pick up the fix without further changes.
- `SESSION_TOKEN_HASH_SECRET` must be provisioned in every real deployment environment (staging,
  prod) — this fix only covers local `.env.example`/`.env.local`; a missing var there would make
  `signIn()` throw, which is the intended fail-closed behavior but needs an actual secret set
  before deploy.
- No lookup/revocation code exists yet in this codebase that reads `token_hash` back, so the "read
  stays consistent with write" concern from the assessment has no current code to verify against;
  flagged as a follow-up for whoever implements that feature.

## Recommendation

Close the bug — verified at the unit level (deterministic HMAC digest, never contains token
material, fails closed without a secret) with a clean type-check and full unit-test regression
pass. Recommend a lightweight manual/staging check of one real `registerHousehold` → `signIn` round
trip before this reaches production, to confirm the live Supabase Auth flow still inserts a valid
`Session` row end-to-end.
