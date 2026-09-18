# Bug Assessment: `/rounds/new` page renders the form without a `close_round` permission guard

- **Slug**: rounds-new-page-missing-permission-guard
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot PR review comment)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim)

> This page is reachable by any signed-in session and renders the create/open form without
> checking the caller's `close_round` permission. The server action checks that permission outside
> its `try`, so a plain resident can reach this UI and submitting it produces an uncaught
> authorization error rather than the intended inline denial/redirect. Guard the page (or render a
> denied state) before loading/rendering the form, consistent with the settings page's
> authorization boundary. (`src/app/(org)/rounds/new/page.tsx` around line 13)

## Symptom

`NewRoundPage` (`src/app/(org)/rounds/new/page.tsx`) only checks that a session exists
(`if (!current) redirect("/sign-in")`) before loading rooms and rendering `RoundForm`. It never
checks `close_round`. Any signed-in resident, regardless of permission, can open `/rounds/new` and
see the full create/open form. Before this session's other fix
(`rounds-new-permission-check-outside-try`), submitting that form as such a resident produced an
unhandled server-action crash; after that fix, it now produces an inline `state.error` on submit
instead of a crash — but the page still lets a resident without `close_round` reach and interact
with UI that isn't meant for them, rather than being told up front (consistent with how
`SettingsPage` behaves for `household_admin`-only access).

## Reproduction

1. Sign in as a resident whose session lacks `close_round`.
2. Navigate to `/rounds/new`.
3. Observe the create/open round form renders fully, with no denial message, even though
   submitting it will be rejected.

## Suspected Code Paths

- `src/app/(org)/rounds/new/page.tsx:9-24` — no permission check between the session check
  (line 11) and the data load/render (lines 13-23).
- `src/app/(org)/settings/page.tsx:12-35` — the established reference pattern: session check,
  then `try { await assertIsAdministration(...) } catch (err) { if (err instanceof
  ResidentListActionDeniedError) { return <denied message JSX>; } throw err; }`, *before* loading
  any page data.
- `src/modules/identity/repository.ts:163,177` — `PermissionDeniedError` and
  `assertHasPermission`, the permission primitive the sibling server action
  (`src/app/(org)/rounds/new/actions.ts`) already uses for `close_round`. The page guard should
  check the *same* permission the action enforces, so the page's gate and the action's gate never
  diverge.

## Root Cause Hypothesis

High confidence. The page was written to check only authentication, not authorization, mirroring
an earlier gap the settings page itself had (fixed by `settings-page-missing-admin-guard`, noted
inline in `settings/page.tsx:16-19` as a "Convergence finding" that the read path "had no check at
all"). This is the same class of gap, on the round-creation page's read path, using a different
permission (`close_round` rather than `household_admin`-only administration). Fixing it is
additive and does not touch the action or the repository/permission model.

## Proposed Remediation

**Preferred**: After the existing session-null redirect, add a `try { await assertHasPermission(
current.context, current.context.accountId, "close_round"); } catch (err) { if (err instanceof
PermissionDeniedError) { return <denied message JSX>; } throw err; }` block, before calling
`listRooms`/rendering `RoundForm` — following the exact structural pattern already established in
`src/app/(org)/settings/page.tsx` (guard-and-render-message before any data load), but checking
`close_round` via `assertHasPermission` (the permission primitive already used by this feature's
own action) rather than `assertIsAdministration` (a different, `household_admin`-only check used
by settings). Do not introduce a new permission-check helper; reuse `assertHasPermission` and
`PermissionDeniedError`, both already imported by the sibling `actions.ts`.

**Alternatives**:
- Add a shared `assertIsAdministration`-style wrapper specific to `close_round`. Rejected as
  unnecessary — `assertHasPermission` already exists and is exactly what the action calls; adding
  a wrapper for a single caller is speculative.

**Files likely to change**:
- `src/app/(org)/rounds/new/page.tsx`

**Tests to add or update**:
- A test asserting the page returns/renders a denial (not the form) when the session lacks
  `close_round`. Given this is a Next.js Server Component page (not a simple exported function
  like the action), check whether existing tests exercise page components directly at all before
  deciding the concrete test shape during the fix step; if no existing pattern renders `(org)`
  pages under vitest, a smaller unit test around the guard logic (mirroring
  `create-and-open-round-permission-error.test.ts`'s mocking approach) is an acceptable substitute.

## Risks & Considerations

- Must not duplicate or contradict the action's own `close_round` check — both must gate on the
  same permission so page and action agree.
- Must not touch `rounds-new-profile-less-authorization`'s open question (whether a profile-less
  household session should hold `close_round` at all) — this fix only adds a page-level guard
  using the permission model exactly as it exists today.
- Keep the diff scoped to `page.tsx`; `actions.ts` was already fixed by
  `rounds-new-permission-check-outside-try` and should not be touched again here except to import
  from it if that proves convenient (no new logic there).

## Open Questions

None — the settings page's guard-and-render-message pattern is a clear, directly reusable
precedent for this fix.
