## Why

The header changes shape completely between the resident screens and the organisation screens: the
resident side has the "flatmate.io" mark on the left and the profile menu on the right, the
organisation side has "Angemeldet als <name>" on the left and a bare "Abmelden" link on the right.
A user moving from Start to Organisation sees the frame rebuilt around them and can no longer
reach their own settings or the members list from there. Pulled ahead of F3 change 5 (O1 rebuild)
so that rebuild lands on the final frame.

## What Changes

- One shared header on every authenticated screen, resident and organisation alike: the product
  mark top-left, the profile menu top-right.
- The mark links to Start (`/dashboard`) on every authenticated screen. On the `(auth)` screens
  (sign-in, register, join) it stays an unlinked pill: there is no session there to return to.
- The profile menu appears on organisation screens too, replacing the "Angemeldet als" bar and its
  separate "Abmelden" link. It gains a "Dashboard" row so the way back from Organisation mirrors
  the way in ("Zur Organisation"). The row is offered only to a session that has a resident
  profile AND may act on organisation tasks (human decision 2026-10-07: a plain resident has the
  Start/Casting navigation and needs no such row). For the household account and a non-resident
  moderator, Start itself redirects to `/organization`, so the row would be a dead end.
- The household account's menu label is "<name> (Verwaltung)" (the existing identity label), not
  the resident fallback "Bewohner:in".
- The per-page "← Start" back arrow stays.
- The bottom navigation (Start, Casting) stays resident-only.
- The shared header code moves out of `(resident)` into a neutral `src/app/_frame/` so `(org)` no
  longer imports from `(resident)`; the organisation's own header component is deleted.

Guardrails: touches none of G-C, G-D, G-L. No data, permission or RLS change. The menu's rights-
dependent rows still come from stored permissions (`getNavigationAccess`), with no role-name
comparison.

**Docs note (human, 2026-10-07):** `docs/screens/rahmenwerk.md` §4.1's *„eigene Fläche, kein Tab"*
is only naming, not a conflict. *„Glocke · Avatar"* describes the notification bell, which is not
built; where the bell goes next to the top-right profile menu is decided when the notification
center is built. This change does not edit `docs/`.

Assumptions recorded: the "Dashboard" label reuses the vocabulary of the URL, while the bottom
bar keeps calling the same destination "Start"; the logo carries an accessible name; the menu on
organisation screens still lists "Zur Organisation" (harmless there, and keeps one menu shape).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ui/resident-frame`: the frame's header and profile menu now also serve the organisation
  surface, the mark leads to Start, and the menu gains a "Dashboard" row for sessions with a
  profile. Requirements "Two destinations in the resident navigation" (the organisation is still
  not a tab, but is no longer a headerless surface) and "A profile menu states who is acting…"
  change.

## Impact

- `src/app/(resident)/{layout,avatar-menu,menu-items,resident-header,session-data}`,
  `src/app/(org)/{layout,org-header,sign-out-action}`, new `src/app/_frame/`, importers of
  `session-data` (dashboard page) and `sign-out-action` (account page).
- `src/ui/strings/de.ts` (`nav.dashboard`, `nav.homeLink`; `org.signedInAsPrefix` removed).
- `tests/unit/start/menu-items.test.ts`, `tests/unit/lint/pending-feedback.test.ts` (fixture path).
- No migrations, no database or dependency change.
