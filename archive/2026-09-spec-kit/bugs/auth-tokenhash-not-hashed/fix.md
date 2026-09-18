# Bug Fix: `Session.tokenHash` stores a raw token fragment, not a hash

- **Slug**: auth-tokenhash-not-hashed
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Replaced `data.session!.access_token.slice(-32)` in `signIn()` with a new exported
`hashSessionToken()` helper that computes an HMAC-SHA256 digest of the access token, keyed by a new
server-only `SESSION_TOKEN_HASH_SECRET` env var, so `Session.token_hash` never stores token
material (matching `docs/GUARDRAILS.md`'s "nur der Hash" rule).

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/identity/auth.ts` | modified | Added `createHmac` import, new exported `hashSessionToken()` helper, replaced the `.slice(-32)` write site with a call to it, updated the adjacent comment |
| `.env.example` | modified | Documented the new `SESSION_TOKEN_HASH_SECRET` server-only var |
| `.env.local` | modified | Added a local-only dev value for `SESSION_TOKEN_HASH_SECRET` (this file is local/dev-only and already holds live Supabase keys; not committed with real prod secrets) |
| `tests/unit/identity/session-token-hash.test.ts` | added | Pins `hashSessionToken`'s behavior: deterministic, distinct per token, never contains the source token/slice, fixed-length hex digest, throws when the secret is unset |

## Diff Highlights

```ts
// src/modules/identity/auth.ts
function hashSessionToken(accessToken: string): string {
  const secret = process.env.SESSION_TOKEN_HASH_SECRET;
  if (!secret) throw new Error("SESSION_TOKEN_HASH_SECRET is not configured");
  return createHmac("sha256", secret).update(accessToken).digest("hex");
}
...
tokenHash: hashSessionToken(data.session!.access_token),
```

## Tests Added or Updated

- `tests/unit/identity/session-token-hash.test.ts::hashSessionToken` — deterministic for the same
  token, differs across tokens, never contains the token (or its trailing 32 chars) as a substring,
  produces a 64-hex-char digest, and throws a clear error when `SESSION_TOKEN_HASH_SECRET` is
  missing.

## Local Verification

- `npx vitest run tests/unit/identity/session-token-hash.test.ts tests/unit/identity/derived-email.test.ts` → 2 files, 8 tests passed.
- `npx vitest run tests/unit` → 20/22 files passed, 59/60 tests passed. The 2 failures
  (`tests/unit/identity/claim-resident-profile-validation.test.ts` — missing `server-only` package;
  `tests/unit/casting/round-participant-list.test.ts` — unrelated assertion) were reproduced
  identically after `git stash`ing this fix, confirming they pre-exist independently of this
  change (other in-progress bug fixes already present in the working tree, per `git status`).
- No lookup/revocation code reads `token_hash` yet in this codebase (confirmed via grep during
  assessment), so there was no read-path to update for consistency.

## Deviations from Assessment

None. The assessment's preferred remediation (HMAC-SHA256 keyed helper, new env var, no schema
migration) was applied as proposed.

## Follow-ups

- When session lookup/revocation-by-token is implemented (identity.md's Session entity), it must
  call `hashSessionToken()` (now exported from `src/modules/identity/auth.ts`) rather than
  recomputing the digest inline, so write and read stay consistent.
- Confirm deployment tooling/secrets management is updated to provision `SESSION_TOKEN_HASH_SECRET`
  in every real environment (this fix only touches local `.env.example`/`.env.local`).
