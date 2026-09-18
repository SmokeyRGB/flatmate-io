# Bug Assessment: Settings page (O20) missing admin authorization guard

- **Slug**: settings-page-missing-admin-guard
- **Created**: 2026-09-18
- **Source**: pasted text (Copilot PR #4 review comment on `src/app/(org)/settings/page.tsx` ~line 19)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim)

> O20 is documented as accessible only to `household_admin`
> (`docs/screens/O-organisation.md:484-490`), but this page loads both settings and round data for
> every authenticated context without an authorization check. A plain resident can therefore
> navigate directly to `/settings` and read the household's quorum setting even though only the
> mutation action is protected. Call `assertIsAdministration(current.context,
> current.context.accountId)` immediately after the sign-in check (or otherwise guard the page)
> before fetching these values.

## Symptom

`SettingsPage` (`src/app/(org)/settings/page.tsx`) checks only that a session exists
(`getCurrentSession` / redirect to `/sign-in`), then unconditionally fetches
`getHouseholdSettings` and `listRoundsForSession` and renders the quorum share to any signed-in
resident. Per `docs/screens/O-organisation.md` §O20 ("**Zugang** | Nur `household_admin`,
unabhängig von `acting_profile_id`"), this screen must be admin-only. Expected: a non-admin
resident hitting `/settings` is denied/redirected before any household data is fetched or
rendered. Actual: the page renders the quorum share for any authenticated resident.

## Reproduction

1. Sign in as a resident whose membership role is not `household_admin`.
2. Navigate to `/settings`.
3. Observe the household's quorum share (`SettingsForm quorumShare=...`) and open-round title are
   rendered, with no authorization error.

## Suspected Code Paths

- `src/app/(org)/settings/page.tsx:12-19` — `SettingsPage` server component: only a session-exists
  check, no role/authorization check, before calling `getHouseholdSettings` and
  `listRoundsForSession`.
- `src/modules/identity/repository.ts:337-342` — `assertIsAdministration(context, accountId)`,
  the existing strict admin-only guard (throws `ResidentListActionDeniedError` if the account's
  membership role isn't `household_admin`). Already used elsewhere (e.g. line 55, 552, 594) for
  admin-gated mutations; not currently called from any page-level/read path for O20.
- `docs/screens/O-organisation.md:484-490` — authoritative access rule for O20: "Nur
  `household_admin`, unabhängig von `acting_profile_id`".

## Root Cause Hypothesis

Confidence: high. The mutation path (the settings-update server action) already enforces
`assertIsAdministration` per the module's existing pattern (see repository.ts call sites), but the
read/render path in the page component was never gated — a straightforward missed authorization
check on the read side, not a design disagreement. The fix is mechanical: add the same guard the
mutation already uses, at the top of the page's data-fetch flow.

## Proposed Remediation

**Preferred**: In `src/app/(org)/settings/page.tsx`, after the `if (!current) redirect("/sign-in")`
check and before the `Promise.all` fetch, call
`await assertIsAdministration(current.context, current.context.accountId)`. Since
`assertIsAdministration` throws `ResidentListActionDeniedError` rather than returning a boolean,
wrap the call (or add a thin page-level catch) so a non-admin resident gets redirected /
sees a "not authorized" response instead of an unhandled thrown error surfacing as a 500. Check how
`ResidentListActionDeniedError` is handled elsewhere (e.g. does Next.js `error.tsx` already map it
to a 403, or does another page catch it explicitly?) and follow the existing convention rather than
inventing a new one.

**Alternatives**:
- Add a role check inline (re-fetch membership and compare `role === "household_admin"`) instead of
  reusing `assertIsAdministration` — rejected: duplicates logic that already exists and is tested
  elsewhere; reuse is simpler and keeps one source of truth for the O20 rule.

**Files likely to change**:
- `src/app/(org)/settings/page.tsx`

**Tests to add or update**:
- A test (unit/integration, whatever harness this page already has, if any) asserting a
  non-`household_admin` session is denied/redirected by `/settings` and never receives
  `quorumShare`/`openRoundTitle` in the response.
- If no test harness currently covers this page, at minimum a guarded manifest check per
  `test/guarded.manifest.json` (G-D) should be considered, since this is an authorization boundary
  (G-C).

## Risks & Considerations

- `assertIsAdministration` throws rather than returning a result — need to confirm how thrown
  errors from a server component are surfaced (Next.js error boundary vs. explicit try/catch) so
  the fix doesn't turn "show 403" into "show a generic crash page." [NEEDS CLARIFICATION: is there
  an existing error boundary/convention for `ResidentListActionDeniedError` in a page (not action)
  context?]
- This is a G-C (authorization/visibility) class issue per the project constitution's hard-floor
  list — confirms this needs a real fix, not a workaround, and should ideally get a guarded test.
- No other page-level reads in this route group were audited beyond `page.tsx` itself; scope was
  kept to the file named in the report per task instructions.

## Open Questions

- [NEEDS CLARIFICATION: how are `ResidentListActionDeniedError` throws currently surfaced from
  page-level (not server-action) contexts elsewhere in the app — is there a shared error boundary,
  or does each page need its own try/catch + redirect?]
