## Context

See proposal.md for motivation. Today `(resident)/layout.tsx` builds its own header inline (mark,
`BottomNav`, `ResidentHeaderRight` in a `<Suspense>`), while `(org)/layout.tsx` builds a different
bar (`OrgHeaderIdentity` + a sign-out `SubmitButton`). `AvatarMenu`, `menuItems`,
`ResidentHeaderRight` and `session-data.ts` already work for any session: `getNavigationAccess`
derives `organisation`/`membersList` from stored permissions, `getIdentityLabel` returns a
`household` or `resident` kind. `(org)` already owns `signOutAction` and `(resident)` imports it,
an upward cross-group import.

## Goals / Non-Goals

**Goals:** one header component for both layouts; mark = link to `/dashboard`; menu on org screens
with a "Dashboard" row; correct household-account label; no `(org)`/`(resident)` cross-imports for
shared frame code.

**Non-Goals:** the bottom nav on org screens; changing which permissions gate any menu row;
touching `docs/`; the O1 rebuild (F3 change 5); the `(auth)` layout.

## Decisions

1. **Neutral home `src/app/_frame/`** (underscore folder: private to the router, not a route
   segment). Moved there with `git mv`: `avatar-menu.tsx`, `menu-items.ts`, `session-data.ts`,
   `sign-out-action.ts`; `resident-header.tsx` becomes `_frame/app-header-right.tsx`. Alternative
   `src/ui/`: rejected, because `session-data.ts` reads the identity repository and `src/ui/` is
   presentation only.
2. **One `AppHeader` server component** in `_frame/app-header.tsx` taking `context` and an
   optional `nav` slot: renders the mark as `<Link href="/dashboard" aria-label=…>` with
   `LinkPendingHint`, the slot (the resident layout passes `<BottomNav />`), and the
   `<Suspense>`-wrapped `AppHeaderRight`. Both layouts render it; the resident layout keeps only
   the session check, redirects, `<main>` and `HouseholdCodeMemory`. Alternative (duplicate markup
   in both layouts): rejected as a DRY violation, which is how the two headers drifted apart.
3. **"Dashboard" row keyed on `profileId !== null && access.organisation`**, passed as
   `access.dashboard` (`menuItems` stays pure). `profileId` is the session fact the `(resident)`
   layout itself redirects on and `access.organisation` is the stored-permission read the
   "Organisation" row already uses; neither is a role comparison (`scripts/lint/role-reads.ts`).
   The row comes first, mirroring the way in. A plain resident gets none: the Start/Casting
   navigation already covers it (human decision 2026-10-07). Alternative: show it to every profile:
   rejected for that reason; show it to the household account too: rejected, it would land on the
   page it is already on.
4. **Household label**: `AppHeaderRight` maps identity kind `household` to
   `de.org.identityHousehold(householdName)`, resident to `displayName ?? identityResidentFallback`
   (the logic `OrgHeaderIdentity` had). The menu's second line (household name) stays; for the
   household account it repeats the name, accepted over a conditional layout.
5. **Auth layout unchanged.** There the mark is the brand pill with no session; linking it to
   `/dashboard` would only bounce through `/sign-in`.
6. **Back arrow unchanged**: it is per page (`organization/page.tsx`,
   `organisation-access-denied.tsx`), not part of the header.
7. **Strings**: add `nav.dashboard` ("Dashboard") and `nav.homeLink` (accessible name of the mark);
   remove `org.signedInAsPrefix` once nothing uses it.

## Risks / Trade-offs

- [Org screens now wait on three reads for the menu, as the resident ones do] → they sit inside
  the existing `<Suspense>` boundary with `HeaderSkeleton`, off the layout's blocking path, and
  are memoised per request by `session-data.ts`.
- [A moved file breaks an import silently] → `tsc` in `npm run verify`; grep for the old paths.
- [Layout shift between screens] → same component, same skeleton size.
- [`rahmenwerk.md` §4.1 now disagrees with the code] → reported in the proposal as a human
  decision; the code follows the explicit request.

## Migration Plan

Pure UI refactor, no data. Rollback is a revert.
