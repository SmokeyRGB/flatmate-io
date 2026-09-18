# Bug Assessment: Malformed round id causes 500 instead of notFound()

- **Slug**: rounds-page-malformed-id-500
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot PR review finding)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> The route parameter is user-controlled, but this call passes it straight into the repository;
> the profile-less query builds `... WHERE id = ${roundId}::uuid`, so a URL such as
> `/rounds/not-a-uuid` raises a Postgres cast error and returns a 500 instead of the route's
> intended `notFound()` path. Validate the identifier before querying (or make the repository
> return `null` for malformed IDs) so invalid round URLs are handled as missing rounds.
> (file: `src/app/(org)/rounds/[id]/page.tsx` around line 20/25)

## Symptom

Visiting `/rounds/<non-uuid>` throws a Postgres cast error (`invalid input syntax for type uuid`)
from `getRoundForSession`'s raw-SQL branch instead of the route rendering Next's `notFound()`
page. Expected: any syntactically invalid round id is treated as "round not found," same as a
well-formed-but-nonexistent id.

## Reproduction

1. Sign in with a household-account (profile-less) session.
2. Navigate to `/rounds/not-a-uuid`.
3. Observe an unhandled Postgres error / 500 instead of the Next.js not-found page.

## Suspected Code Paths

- `src/app/(org)/rounds/[id]/page.tsx:20` — passes route param `id` straight into
  `getRoundForSession(current.context, id)` with no shape validation.
- `src/modules/casting/repository.ts:401-422` (`getRoundForSession`) — the profile-less branch
  (line 416) interpolates `roundId` into raw SQL with an explicit `::uuid` cast
  (`WHERE id = ${roundId}::uuid`), which throws at the DB layer on a non-UUID string. The resident
  branch (line 419, Drizzle `eq(castingRound.id, roundId)`) is also UUID-typed and will throw the
  same way via the driver for a malformed value, so the bug is not confined to the profile-less
  path even though that's the one Copilot flagged.
- `src/db/session-context.ts:5-12` (`isUuid`) — existing helper, already used the same way in
  `claim/actions.ts:39`, `identity/auth.ts:263`, and `identity/session-cookie.ts:49` to fail
  closed on malformed ids before they reach a query.

## Root Cause Hypothesis

`getRoundForSession` never validates that `roundId` is a well-formed UUID before using it in a
query (both the raw-SQL and the Drizzle-builder branch), so Postgres's own type-cast error
propagates uncaught up through the page component. Confidence: high — the code path is directly
visible and the `isUuid` helper's docstring on `session-cookie.ts` describes exactly this failure
mode ("fail closed... instead of letting assertUuid's plain Error surface as a crash").

## Proposed Remediation

**Preferred**: Add an `isUuid(roundId)` guard at the top of `getRoundForSession` (repository
layer, not just the page) that returns `null` immediately for a malformed id, before either query
branch runs. This fixes both the profile-less raw-SQL branch and the resident Drizzle branch in
one place, and matches the codebase's established pattern (`claim/actions.ts`, `identity/auth.ts`,
`session-cookie.ts` all guard with `isUuid` before querying). The page's existing
`if (!round) notFound();` then handles the malformed-id case for free — no page-level change
needed.

**Alternatives**:
- Validate `id` in the page component only. Rejected: leaves every other/future caller of
  `getRoundForSession` (and the raw-SQL branch specifically) exposed to the same crash; the
  repository is where all callers route through, so that's the smaller, more complete diff.

**Files likely to change**:
- `src/modules/casting/repository.ts` (add `isUuid` import + early-return guard in
  `getRoundForSession`)

**Tests to add or update**:
- A repository-level test: `getRoundForSession` with a malformed `roundId` string returns `null`
  for both a profile-less context and a resident context.
- A route-level/integration test (if the suite has one for this page): `/rounds/not-a-uuid`
  renders the not-found path rather than throwing.

## Risks & Considerations

- Low risk: purely an early-return guard, no behavior change for well-formed UUIDs (valid or
  missing rounds already return `null` today).
- Must not weaken any `[GUARDED]` test in `test/guarded.manifest.json` — this change only adds a
  new early-return branch, doesn't touch the ADR-014/G-D15 profile-less visibility logic already
  in this function.

## Open Questions

None.
