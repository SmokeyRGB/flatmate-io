# Bug Assessment: `Session.tokenHash` stores a raw token fragment, not a hash

- **Slug**: auth-tokenhash-not-hashed
- **Created**: 2026-09-18
- **Source**: pasted text (Copilot PR #4 review comment)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> `tokenHash` is populated with the last 32 characters of the Supabase access token, which is not
> a hash and leaves bearer-token material in the database. Any database disclosure would expose a
> reusable token fragment, while the column/documented contract says it stores a hash. Store a
> one-way cryptographic digest (preferably an HMAC if lookup is ever needed) instead of slicing the
> access token.
>
> Found in PR #4 review, `src/modules/identity/auth.ts` around line 307.

## Symptom

`signIn()` in `src/modules/identity/auth.ts` writes `data.session!.access_token.slice(-32)` into
`Session.tokenHash`. This is the literal trailing 32 characters of the live Supabase JWT access
token, not a digest of it. `docs/04-Domaenenmodell.md:264` and `docs/GUARDRAILS.md:108` document
`token_hash` as "nur der Hash" (hash only) — plaintext-equivalent secret material must never be
stored. A database disclosure (backup leak, SQL injection, insider access) would hand out a
genuine fragment of a bearer token still usable against Supabase Auth, not an irreversible digest.

## Reproduction

1. Call `signIn()` with valid household or resident credentials.
2. Inspect the inserted `session` row's `token_hash` column.
3. Observe it equals `access_token.slice(-32)` — reversible/identifiable substring of the real
   bearer token, not a cryptographic digest.

## Suspected Code Paths

- `src/modules/identity/auth.ts:302` — the only write site: `tokenHash: data.session!.access_token.slice(-32)`.
- `src/modules/identity/schema.ts:78` — column definition `tokenHash: text("token_hash").notNull()`, no format enforced at the schema level.
- No other read/compare site exists: `Grep` for `tokenHash`/`token_hash` across `src/` and `tests/` found no lookup-by-token-hash or revocation-by-hash code path in the current F1 slice — `token_hash` is written once at sign-in and never read back programmatically yet.

## Root Cause Hypothesis

High confidence. The comment at lines 305-307 in `auth.ts` explicitly acknowledges the shortcut:
"a real HMAC of the token would be the production version; out of F1's acceptance scope, which
only requires the row and its immutability guarantee to exist, T016/T017." The implementer knew
this was a placeholder and left a literal substring instead of a digest, which is exactly the
password-equivalent-in-the-clear pattern `docs/GUARDRAILS.md:108` forbids regardless of scope
phase — GUARDRAILS is the hard floor (precedence position 1) and binds even a "not yet required"
task.

## Proposed Remediation

**Preferred**: Replace the slice with an HMAC-SHA256 of the access token, keyed by a server-only
secret (`node:crypto`'s `createHmac`, no new dependency), so the column keeps a stable,
non-reversible reference usable for future lookup/revocation without ever storing token material.
Introduce one new server-only env var (e.g. `SESSION_TOKEN_HASH_SECRET`) read the same lazy way
`supabaseAdmin()` reads its keys, so a missing var doesn't crash unrelated imports. Since no
current code reads `tokenHash` back (confirmed above), there is no read-path to keep in sync
today — but the fix should factor the computation into one exported helper (e.g.
`hashSessionToken(token: string)`) so any future lookup/revocation code calls the same function,
keeping write and (future) read consistent by construction.

**Alternatives**:
- Plain `crypto.createHash('sha256')` (no secret/key) — simpler, but a stolen DB row plus a stolen
  JWT could be matched without needing the extra secret anyway (the token is already compromised
  at that point), and it forecloses no threat model in F1's current usage (write-only column). The
  brief explicitly prefers HMAC "if lookup is ever needed," and `token_hash` is documented as
  intended for lookup/revocation (identity.md's Session entity) — so HMAC is preferred over plain
  SHA-256 for future-proofing at negligible extra cost (one secret, one keyed hash call).

**Files likely to change**:
- `src/modules/identity/auth.ts` (replace the slice with the new helper call; add the lazy secret
  read)
- `src/modules/identity/schema.ts` — no change expected (column stays `text`, `NOT NULL`); confirm
  no length constraint requires updating (`token_hash` is unconstrained `text`, so a 64-hex-char
  HMAC digest fits without a migration)

**Tests to add or update**:
- A unit test asserting `signIn()`'s inserted `tokenHash` is a deterministic HMAC-SHA256 hex digest
  of the access token under the configured secret, is fixed-length, and never equals a substring of
  the raw access token.
- A unit test for the new helper directly (same input -> same digest; different tokens -> different
  digests) as the one runnable self-check for this logic.

## Risks & Considerations

- **New required env var**: if `SESSION_TOKEN_HASH_SECRET` is unset, sign-in must fail loudly
  rather than silently falling back to something weaker (e.g. hashing with an empty/undefined key).
  Needs a clear error, and updates to `.env.example`/deployment docs if such files exist.
- **No migration needed**: `token_hash` is `text`, unconstrained length, so switching from a 32-char
  slice to a 64-hex-char HMAC digest requires no schema/migration change.
- **No existing rows to backfill**: this is pre-production (F1 still in development per
  `project_f1_status` memory), so there is no production data migration concern.
- **Scope**: fix is confined to `src/modules/identity/auth.ts` (plus a new small helper, possibly
  inline in the same file to avoid adding a file for one function, per YAGNI/ponytail guidance).

## Open Questions

- [NEEDS CLARIFICATION: should the HMAC secret be a new dedicated env var, or is there an existing
  server-only secret in the codebase intended for this kind of derived-key purpose? Grep for
  `SESSION_TOKEN_HASH_SECRET`/`TOKEN_HASH_SECRET`/`HMAC_SECRET` found none, so a new var is assumed
  during the fix step unless one turns up.]
