# Proposal: organisation-task-list

## Why

O1 (`/organization`) is meant to be a task list, not a control panel. `screens/O-organisation.md` O1
says: *„Ein primärer CTA, bis zu drei Zeilen darunter, Rest eingeklappt — sortiert nach Zeitdruck mit
genanntem Grund, gleiches Prinzip wie B1"*. The page we have today is a placeholder. Its own
comment says *"F3 rebuilds this screen"*: it shows one round card and a few underlined links.

Three persona walkthroughs on 2026-10-12 (a household account, a moderator before the first round, a
moderator taking over mid-round) agree on what is wrong:
- O1 helps only before anything exists. Once there is a room, a round or an application, it shows
  no next step and no progress (clarity 2/5 in all three runs).
- For the household account it offers only "Tritt deiner WG selbst bei", and it never changes after
  a room and residents have been added.
- Start's moderation bridge says „Alles erledigt – gut gemacht" next to open work.

F3 Q-14 (human, 2026-09-28) put the rebuild in scope, and the human pulled it ahead on 2026-10-12.

## What Changes

- **O1 becomes the organisation task list.**
  - The primary card shows the most important open organisation task, with its reason. Up to three
    further rows sit beneath it, and the rest are folded.
  - The order is one deterministic rule kept next to B1's rule in `task-precedence.ts`.
  - When no task is open, the round overview fills the surface (O1 *„Leer … nie leer"*).
- **New organisation task kinds.** Each is offered only to a caller holding the permission its
  action needs. They join the existing `open_first_round` and `open_round_for_room`:
  - "add a room" (`manage_rooms`), when the household has no undeleted room. It replaces the
    first-round task in that case, because a round cannot be opened without a room.
  - "invite flatmates" (`manage_join_codes`), when no resident has joined yet.
  - "decide who runs the search" (`appoint_moderator`), when no live membership holds
    `manage_rounds`. It leads to the founding link where that is the household account's path, and
    to the members screen otherwise.
  - "invite candidates" (`manage_rounds`), per open round, once the caller's own ranking shows at
    least one scored application that is not yet invited and rooms are still free. It is read
    through `deliberation`'s exported `getRanking`. Nothing in `src/modules/deliberation/` changes.
- **Round progress header.** A step bar shows where the round stands, derived from the existing
  `phaseOf` (`rahmenwerk.md` §3.1). It shows only steps v0.1 can perform: up to invited, and nothing
  after.
  - A caller with a resident profile also sees aggregate counts by application state.
  - The household account sees that a round exists and its status, and no application-derived
    number (G-D15, ADR-014).
- **A persistent „Bewerbung erfassen" entry and a link to the round's applications**, for a caller
  holding `create_application` (Q-14).
- **Sub-pages as icon tiles.** Rooms, members, settings and "who lives here" become tiles gated by
  `getNavigationAccess`, replacing the underlined links. „Weitere Runde eröffnen" moves to a quiet
  secondary position.
- **Start's moderation bridge reads the same task list.** It therefore counts the new kinds too, and
  its empty wording stops sounding like praise for everything (wording below).
- **Spec catch-up, no code change.** The household account lands on O1, as the code has done since
  2026-10-05 (`landingPathFor`). `start/next-action` still says O20.

### Folded in from the same walkthroughs (human decision 2026-10-12: one worktree, not five)

O1's new tasks send people to the rooms and members screens, so the friction there is part of the
same path. The rest are small defects on screens no parallel branch touches.

- **Rooms (O14).**
  - Each status change is its own named action („Als frei markieren", „Suche pausieren", …). This
    replaces a dropdown plus a separate „Status ändern" link.
  - Removing a room asks for confirmation and sits apart from harmless actions.
- **Members (O16).**
  - Adding a resident also issues that person's invitation and shows it on their card at once, for
    a caller holding `manage_join_codes`. Today that is a second step the persona never found.
  - Residents are listed in a stable order (oldest first). Today the order is undefined.
  - The general "share this link only directly" warning becomes an advice note, not a red alarm
    box. The founding-link, removed-joiner and reset-link cautions stay red, since those are real
    cautions.
- **Capture (O3).**
  - The Art.-14 sample text no longer reads "von der WG WG Gartenstraße" when the household name
    already starts with „WG".
  - The step-2 button says where it leads („Weiter zum Hinweis") instead of flipping between
    „Speichern" and „Weiter".
  - The "[Link]" note stays as it is (human decision 2026-10-12: it marks something still to do).
- **Sign-in (A2).** A prefilled WG-Kennung is replaced by what the person types, not appended to.
  This is a bug against `identity/device-memory`'s existing scenario "Prefill is editable".
- **Profile menu.** „Abmelden" is set apart from the language row, after a tester switched the
  language by a misclick.

**Parked, not built here** (recorded in the F3 plan):
- Prefilling capture fields from the pasted message. This needs a G-L / P-5 decision first.
- Appointing a moderator before the person has joined. That is a domain-model question: no
  membership exists before the claim.

**Dropped:**
- An Organisation entry in the bottom bar. `rahmenwerk.md` §4.1 fixes the bar as *„Start ·
  Casting"*, and Start's bridge is the specified entry.

**Left to F4/F5:**
- What „Einladen" does, and ties in the ranking. These belong to `deliberation`.
- The confirmation after the last vote is already in F4 change 2 (completion toast).

No migration, no new table, no new permission.

## Capabilities

### New Capabilities
- `organisation/task-list`: O1. The organisation task kinds and their permission gates, the
  precedence, the primary card with up to three rows, the empty state, the round progress header,
  the persistent capture entry, the sub-page tiles, and no application-derived number for the
  household account.

- `casting/rooms`: written on first touch. Room status changes are named actions, removal needs
  confirmation. Changing a room's status sends nothing to anyone.

### Modified Capabilities
- `identity/member-administration`: adding a resident issues their invitation at once (with
  `manage_join_codes`), and the resident list has a stable order.
- `identity/device-memory`: "Prefill is editable" is stated precisely. Typing replaces the
  prefilled code.
- `start/next-action`:
  - The moderation bridge counts the extended organisation task list, and its empty wording
    changes.
  - The "fresh household" scenario changes: no room → "add a room", not "open the first round".
  - The household account's landing is O1.

## Guardrails touched

- **G-C (authorization/visibility).** Every task and tile is decided by a held permission, inside
  the repository read, never in the page and never by a role comparison (`role-reads.ts`).
- **G-D15.** The household account receives no application-derived value from any read that serves
  O1. The read refuses this itself. G-D15's manifest entry is not flipped by this change unless a
  new test covers it fully.
- **G-L / P-5.** The task order is a fixed, deterministic rule (P-3). Task texts talk about the
  process, never about a person (C-10, `O-organisation.md` *„Wortlaut — Prozess vs. Person"*).
- G-D (guarded tests) are not weakened.

## Assumptions (to confirm in review)

1. **Bridge empty wording.** „Gerade ist nichts zu organisieren" replaces „Alles erledigt – gut
   gemacht". The English twin is "Nothing to organise right now".
2. **"Decide who runs the search" is complete when any live membership holds `manage_rounds`.** The
   household account holds the same set as a moderator minus `manage_rounds`, so this is a
   permission read, not a role read.
3. **"Invite candidates" appears only where the caller can read the ranking.** A moderator who has
   not voted yet sees their T-5 vote task on Start instead. O1 does not bypass "ranking hidden until
   you vote".
4. **No phase-deadline task** (`rahmenwerk.md` §3.2 "stale deadline"). No screen sets
   `phase_deadline_at` in v0.1, so the task could never appear (YAGNI). It is recorded as deferred.

## Impact

- `src/app/(org)/organization/page.tsx` is rebuilt, plus small components beside it. `loading.tsx`
  stays and uses `@/ui/skeletons`.
- `src/modules/casting/repository.ts`: `listOrganisationTasks` gains the new kinds and stays the one
  function that feeds O1 and the B1 bridge.
- `src/modules/casting/task-precedence.ts` gets the organisation order beside `orderTasks`.
- `src/modules/identity/repository.ts` gets one new read: setup facts (has a resident joined, does a
  live membership hold `manage_rounds`). Casting does not query identity tables.
- `src/app/(resident)/dashboard` bridge copy; `src/ui/strings/de.ts` and `en.ts` (every key twinned).
- Tests:
  - unit tests for the precedence;
  - integration tests for each task kind's gate and condition;
  - G-D15 refusal for the household account;
  - the authorization matrix if a new repository export is added.
- Folded-in screens:
  - `src/app/(org)/rooms/page.tsx` (+ a confirm form);
  - `src/app/(org)/members/` (create action + view);
  - `getResidentList` (ORDER BY);
  - `src/app/(org)/rounds/[id]/applications/new/capture-form.tsx` and the `thirdPartyText`
    template;
  - `src/app/(auth)/sign-in/sign-in-form.tsx`;
  - `src/app/_frame/avatar-menu.tsx`.
- **Parallel work.** F4 change 2 / F5 change 4 own `src/modules/deliberation/`. This change only
  calls its exported `getRanking`. Merge conflicts are expected in `de.ts`/`en.ts`.
