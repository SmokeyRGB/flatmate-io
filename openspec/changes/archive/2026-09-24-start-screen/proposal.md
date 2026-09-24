# Proposal

## Why

Every resident, whether they joined a minute ago or signed in, lands on screen **O1**, the
organisation surface: wrong audience, wrong content. Change 2 (`join-by-link`) made that landing
temporary in its proposal Assumption 4, and change 3 (`join-screen`) carried it. The failure it
risks is the one `docs/backlog/requirements/F2-requirements.md` **R-2.5** names:

> Onboarding is cheap but Start is unclear, so residents arrive and stall

The packet assigns the answer to this slice. **FR-2.18**: *"On successful join the system shall
create the account, the resident profile and the membership, and shall place the resident on the
Start screen."* It also defines the screen, **FR-2.20**, **FR-2.21** and **FR-2.24**:

> The Start screen shall display exactly one primary action at a time.

> The primary action shall be accompanied by the reason it is first.

> The system shall select the primary action by exactly one precedence rule: actions with a real
> due date first, ordered by that date; actions without a due date after them, in a fixed order.

The scope line is **S-48** (`02-SRD.md` §5.3, v0.1 row „Aufgaben-Dashboard"), and the screen is
`docs/screens/B-start.md` **B1** (*„Standard-Landeseite für jedes `ResidentProfile`"*). B1 carries
the task model of `docs/screens/rahmenwerk.md` §2.

## What Changes

- **Screen B1 at `/dashboard`.** Human decision, 2026-09-24: the route keeps the name the docs
  already use for the resident surface (S-44, `rahmenwerk.md` §4.1 *„Moderations-Brücke im
  Dashboard"*). It has:
  - a greeting by display name, with the household name;
  - **one** primary action with the reason beside it (FR-2.20, FR-2.21, AC-2.12, AC-2.13), in the
    banded featured card of `docs/09-Design-System.md` („ALS NÄCHSTES");
  - up to three further task rows, with the rest folded as „und N weitere" (`rahmenwerk.md` §2.3);
  - the moderation bridge (below);
  - **no participation counter** (below, docs amendment).
- **The precedence rule of `rahmenwerk.md` §2.2, built in full (FR-2.24, C-2.8).** Tasks with a
  date come first, soonest on top. Tasks without a date follow in the fixed order T-1 · T-2 · T-3 ·
  T-4/T-5 · T-6. T-6 never appears beside T-5 (§2.3). Only **T-5** (vote on an invitation) can
  occur in v0.1. Its date is `casting_round.phase_deadline_at`, which exists as a column but has no
  writer (S-44 is v0.2), so the dated branch is proven by seeding the column in a test. The packet
  names this rule *"the honest candidate"* to cut and keeps it for cost of change. This change keeps
  it for the same reason.
- **T-5 today:** applications on the main path (`new`, `screened`) in an open round in which the
  viewer holds a participation with `can_vote = true`. There is no `Vote` table, so "not yet voted
  on by me" is every such application until F4. The button leads to a **placeholder screening
  screen** at `/casting/screening` (human decision, 2026-09-24).
- **The empty state shows the round standing (FR-2.23, AC-2.15, EC-2.3, EC-2.12).** B1 fills it
  with the *„Rundenstand aus §3"*: the phase display of `rahmenwerk.md` §3.1 (from the application
  that has progressed furthest) and, beneath it, the real distribution by state. With no open round
  it says that no round is running. The appreciative sentence after one's own last vote (B1,
  decided 2026-09-15) needs `Vote` and is not built (Assumption 4).
- **The moderation bridge (§2.3, U-5)** is a muted card of its own, visually distinct from the
  resident's task card and never mixed into the task list. It is shown only to a viewer who may act
  on organisation tasks. It carries the count of open orga tasks, one line, and „Zur Organisation →".
  With none open it reads „Alles erledigt – gut gemacht" (wording to be finalised in `de.ts`).
  **Orga task in v0.1:** a room with `status = open` that no draft, open or paused round covers.
  It is counted only for a viewer holding `close_round`. B1 shows the count, and the task row
  itself, leading to round creation (O2) with the room pre-selected, is F3's, together with O1's
  task list (design Decision 12). The tasks are orga work that moves the casting forward; screening
  is resident work and never an orga task (human decision, 2026-09-24). See Assumption 2.
- **The resident frame of `rahmenwerk.md` §4.1.**
  - A bottom bar *Start · Casting*, icon-only on mobile and moving into the header on desktop
    (`09-Design-System.md`, Navigation).
  - A header with the brand and an **avatar menu**, a drop-down popover (human reference
    screenshot, 2026-09-24). From top to bottom:
    - a header block with name and household;
    - the list link, chosen by rights (human decision): „Mitglieder" (O16) for those who may see
      the members list, „Wer wohnt hier" (B5) for everyone else;
    - „Zur Organisation" (only with rights);
    - a divider;
    - „Einstellungen" → **E1**, the resident's own settings (`screens/E-einstellungen.md`, *„Aus
      dem Avatar-Menü"*). These are *not* the household settings O20;
    - „Abmelden".
  - **E1 is a placeholder at `/account` in this change.** Its v0.1 content (adding or changing an
    email per FR-2.17, and changing the password) is **change 5** (human decision, 2026-09-24).
  - **No bell**: B2 (notifications) is not built, and a control with nothing behind it is dead.
  - **Organisation is reached by the avatar menu and the bridge only, never as a tab** (§4.1, K-6
    *„eigene Fläche, kein Tab"*; human confirmation, 2026-09-24).
- **`/casting` is a placeholder tab** („Wird in F4 & F5 gebaut"). When the viewer has T-5 open, it
  **redirects to `/casting/screening`** (human decision, 2026-09-24).
- **O1 moves from `/dashboard` to `/organization`, unchanged.** F3 rebuilds it as the task list
  `O-organisation.md` O1 describes. The organisation screens' back-links point to `/organization`;
  B5's points to `/dashboard`.
- **Every identity lands on its own surface.** A resident profile lands on B1 after joining,
  after signing in, and at `/`. The household account lands on **O20** (`/settings`, already O20
  and `household_admin`-only), because household settings are its primary job (human decision,
  2026-09-24). This replaces the three temporary `/dashboard` landings in the join path. A
  household account that opens `/dashboard` or `/casting` is sent to its landing. **G-D15**: B1 is
  built from application-derived numbers, which a profile-less session must never receive.
- **Docs: the participation counter leaves Start, and B4 is no longer entered from B1.** Human
  decision, 2026-09-24: *„X von Y haben abgestimmt"* is **not** shown on Start, and the
  participant list lives with the score-board after screening (D1, which already has its own entry
  into B4). This overrides the places below, and all of them are amended in this change:
  - `03-PRD.md` §4.1.2, row *Beteiligungsstand* (precedence level 3);
  - `docs/backlog/requirements/F2-requirements.md`, **FR-2.22** and **AC-2.14** (and the packet's
    summary line naming "the participation counter", and US-2.12 with its copy in `docs/backlog/features/F2-join-in-two-fields.md`, now served on D1);
  - `docs/screens/B-start.md` B4 *Zugang* (*„auf B1 oder D1"* → D1).

  The counter's content is unaffected. V-3 (b)'s denominator still governs it wherever it is
  shown (D1, F4). The decision is recorded in `docs/review-log.md` in the shape of the 2026-09-21
  landing decision. `tools/check-refs.ts` must stay green. B4 itself is not built.
- **No demo applications.** Adding them to `seed:demo` is left to F3 (application capture) and F4
  (screening), which own that data (human decision, 2026-09-24). The vote card is proven by tests.
  The planning session's browser walkthrough seeds applications into `flatmate-io-dev` temporarily
  and removes them afterwards.
- **Ride-along:** `openspec/config.yaml` says *"the four hand-written guardrail lints"*. There are
  six. One word.

## Capabilities

### New Capabilities

- `start/next-action`: screen B1, the precedence rule, the reason, the empty state with the round
  standing, the moderation bridge and its v0.1 orga task, and which surface each identity lands
  on.
- `ui/resident-frame`: the resident navigation (bottom bar *Start · Casting*, avatar menu, no
  bell), the `/casting` and `/account` placeholders, the redirect to screening, and O1's move to
  `/organization`.

### Modified Capabilities

- `identity/join`: *"Someone who already belongs is not made to join again"* says a member is
  *"taken to Start"*. A signed-in **household account** of the same household is such a member too,
  and now lands on O20 instead. The requirement is restated so that each identity goes to its own
  landing with the note. *"A join creates the resident and lands them on Start"* is unchanged in
  wording and now true in fact.

## Guardrails touched

- **G-C (authorization/visibility)**, via **G-D15**: every new read that yields a number derived
  from applications (T-5's count, the phase distribution) must return nothing
  application-derived to a session with `profileId = null`. This is enforced in the repository
  function, not the route, and tested per read. G-D15 is already `implemented` in
  `test/guarded.manifest.json`. This change adds its new reads to the same suites and does not
  change the entry. **Finding, not fixed here:** G-D15 also requires the refusal *„direkt gegen die
  Datenbank unter der Anwendungsrolle"*, but `application`'s only RLS policy is household
  isolation. So under `app_runtime` a household-account session can count applications directly,
  for any read, old or new. Closing that is an RLS migration with its own blast radius. It is
  reported to the human as a separate task (design Decision 9).
- **V-1 (self-redaction), app-level only.** A past application whose `became_resident_id` is the
  viewer sits in `moved_in`, which §3.1 counts as main path. The phase distribution excludes it
  (`rahmenwerk.md` §6: *„keine Zählung, aus der man zurückrechnen könnte"*). Live applications can
  never include the viewer, so T-5 needs no such filter (human reasoning, 2026-09-24). Full V-1
  (`redaction_subjects()`, RLS) is not built and stays its own slice.
- **G-N6 (four mandatory states)** for B1, `/casting` and `/casting/screening`.
- **G-L / P-5:** C-2.8 forbids any learned or AI-assisted prioritisation. The rule is one
  deterministic function, and it is unit-tested.
- **Not touched:** G-D (no guarded test changes status), G-C8, the raw-client boundary (no new
  `src/db/` use), migrations (none).

## Assumptions

1. **"May see the members list"** means the rule O1 applies today (`household_admin` or
   `moderator`), which is O16's own access rule (U-30). It picks „Mitglieder" over „Wer wohnt
   hier" in the menu.
2. **One orga task, not two.** Human-approved on 2026-09-24 was a second one, *"a draft round that
   was never opened"*. It is **dropped** here (confirmed by the human, 2026-09-24) for two reasons. The only UI
   path creates and opens a round in one transaction (`createAndOpenRound`, which rolls the draft
   back on failure), so a draft cannot arise outside tests. And no screen opens a draft, so the task
   would break `O-organisation.md`'s rule 1 (*„Jede Orga-Aufgabe führt direkt auf die Handlung"*).
   „Bewerbung erfassen" is out for the same reason: O3 is not built.
3. **"May act on organisation tasks"** means `role` `household_admin` or `moderator`, or any
   non-empty `permissions`. The avatar menu's „Organisation" item uses the same test. Each task is
   then filtered by the permission its own action checks (`close_round`), so the count never
   promises something the viewer is refused.
4. **Not built, stated rather than stubbed:** the appreciative sentence after one's own last vote
   (needs `Vote`); „Seit deinem letzten Besuch" (v0.2, EP-A, human decision); the PWA install band
   (S-45, v0.2; only FR-2.25/AC-2.16's negative rule applies, and nothing occupies the primary
   position but a task); B2 and the bell; B4; E1's content (change 5).
5. **The already-member note** (EC-2.4) moves from O1 to each landing. It shows on B1 for a
   resident and on O20 for the household account.
6. **Only O1 changes path.** `/rooms`, `/members`, `/rounds`, `/settings` and `/who-lives-here` keep
   theirs (human decision, 2026-09-24).
7. **The prototype is visual reference only.** The B1 screenshot (`coursework/exercise-12/`, local,
   untracked) informs layout and tone, never code or behaviour. Its „wer ist dabei?" row is
   explicitly ruled out, and its bell is not built.

## Impact

- **New:** `src/app/(resident)/` (layout with header, avatar menu and bottom bar; `dashboard/`,
  `casting/`, `casting/screening/`, `account/`); `who-lives-here/` moves into this group without
  changing its URL. Read functions in `src/modules/casting/repository.ts` (open tasks with the
  round standing, open orga tasks) and `src/modules/identity/repository.ts` (what the menu and
  bridge may show), plus a pure precedence module with no DB access.
- **Moved:** `src/app/(org)/dashboard/` → `src/app/(org)/organization/`.
- **Changed:** the redirect sites (`src/app/page.tsx`, `sign-in/actions.ts`, `register/actions.ts`,
  the three in `join/`), the back-links in `(org)`,
  `src/ui/strings/de.ts`, `src/app/globals.css` (bottom bar, avatar menu, muted bridge card),
  `docs/03-PRD.md`, `docs/backlog/requirements/F2-requirements.md`, `docs/screens/B-start.md`,
  `docs/review-log.md`, `openspec/config.yaml`.
- **Tests:** the precedence rule (unit); G-D15 for each new read; the V-1 exclusion in the
  distribution; the landing per identity; the `/casting` redirect; the menu's rights-dependent
  items; the authorization matrix, which fails until each new read export is classified.
- **No migration, no new table, no new dependency.**
