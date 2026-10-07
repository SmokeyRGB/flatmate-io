## 1. Move the shared frame code

- [x] 1.1 `git mv` `src/app/(resident)/{avatar-menu.tsx,menu-items.ts,session-data.ts}` and `src/app/(org)/sign-out-action.ts` into `src/app/_frame/`; `git mv` `(resident)/resident-header.tsx` to `_frame/app-header-right.tsx` (rename `ResidentHeaderRight` to `AppHeaderRight`)
- [x] 1.2 Fix importers: `(resident)/dashboard/page.tsx` (session-data), `(resident)/account/page.tsx` (sign-out-action), `tests/unit/start/menu-items.test.ts`, the fixture path string in `tests/unit/lint/pending-feedback.test.ts`; update comments that name a moved file (`(auth)/join/[code]/actions.ts`, `modules/identity/repository.ts`, `(org)/organisation-access.ts`)

## 2. Shared header

- [x] 2.1 `src/ui/strings/de.ts`: add `nav.dashboard` and `nav.homeLink`; remove `org.signedInAsPrefix`
- [x] 2.2 `_frame/menu-items.ts`: add a `dashboard` key (`/dashboard`, Home icon, directly after the people row) offered when `access.dashboard` is true; `_frame/avatar-menu.tsx` takes and forwards it
- [x] 2.3 `_frame/app-header-right.tsx`: pass `dashboard: context.profileId !== null && access.organisation`; label the household identity with `de.org.identityHousehold(...)`
- [x] 2.4 New `_frame/app-header.tsx`: the mark as a `Link` to `/dashboard` (`aria-label` `nav.homeLink`, `LinkPendingHint`), an optional nav slot, `AppHeaderRight` in `<Suspense fallback={<HeaderSkeleton/>}>`

## 3. Layouts

- [x] 3.1 `(resident)/layout.tsx`: render `AppHeader` with `<BottomNav />` in the slot; keep session check, redirects, `<main>`, `HouseholdCodeMemory`
- [x] 3.2 `(org)/layout.tsx`: render `AppHeader` (no nav slot); drop the bar, the sign-out form and the now-unused imports
- [x] 3.3 Delete `(org)/org-header.tsx`

## 3b. Follow-up: one switch at a time (PR #60 check)

- [x] 3b.1 `menuItems(access, surface)`: "Zum Dashboard" only on `organisation`, "Zur Organisation" only on `resident`; `surface` passed from each layout through `AppHeader` and `AppHeaderRight` to `AvatarMenu`; rename string `nav.dashboard` to `nav.toDashboard` ("Zum Dashboard")
- [x] 3b.2 `tests/unit/start/menu-items.test.ts`: cover both surfaces. Deliberate break: ignore `surface` in `menuItems`; the moderator-on-resident-screen case must fail

## 4. Tests and verification

- [x] 4.1 `tests/unit/start/menu-items.test.ts`: add `access.dashboard` to every case; assert Dashboard is first when true and absent for a plain member (`dashboard: false`). Deliberate break: hard-code `dashboard` to true; report having seen the plain-member case fail
- [ ] 4.2 Run `npm run verify`; run the dev server and check at mobile width that Start and Organisation show the same header, the mark returns to Start from `/organization`, the menu on `/organization` shows Dashboard for a moderator and not for a plain resident, and `/sign-in` shows an unlinked pill. Screenshot both
- [x] 4.3 Leave `docs/` untouched; spec sync happens at archive
