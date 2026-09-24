# Design

## Context

See `proposal.md` for why. The current state this design starts from, verified on `9c84ddb`:

- **Every session lands on O1.** The `/dashboard` redirect appears in `src/app/page.tsx`,
  `sign-in/actions.ts`, `register/actions.ts`, and three times in `join/[code]/` (`actions.ts`
  twice, `page.tsx` once). O1 lives at `src/app/(org)/dashboard/page.tsx` and also renders the
  EC-2.4 `?note=already_member`. `(org)/layout.tsx` is the only authenticated frame: a header
  with "Angemeldet als …" (AC-1.6) and a sign-out form. There is no resident navigation.
- **Data that exists:** `application` (11 states, `round_id`, `became_resident_id`, `deleted_at`),
  `casting_round` (`status`, `room_ids`, `phase_deadline_at` with no writer), `round_participation`
  (`can_vote`, `removed_at`), `room` (6 states), `resident_profile.status`. **`Vote` does not
  exist.** Nothing in `src/app` creates an application; only tests insert rows.
- **Rounds:** the only UI path is `createAndOpenRound`, which rolls the draft back on a failed
  open, so a draft round never survives outside tests. No screen opens a draft. Both facts drive
  proposal Assumption 2. `createAndOpenRound` checks `close_round`. `rounds/new` has no room
  pre-selection.
- **G-D15 today:** `getRoundForSession` and `listRoundsForSession` read `casting_round_admin_view`
  for `profileId = null`. `getRoundParticipants` returns `[]`. Enforcement is in the repository
  function. The raw-SQL half (`tests/integration/raw-sql/round-visibility-household-account.test.ts`)
  checks only that `casting_round` carries no cached application aggregate. **Under the
  application role, a household-account session can still `SELECT count(*) FROM application`**.
  RLS isolates households only (CLAUDE.md, *Implementation hazards*). See Decision 9.
- **The authorization matrix** (`tests/integration/policy/authorization-matrix.test.ts`) fails on
  any new exported `casting`/`identity` repository function that has no recorded decision. Reads
  go under `NOT_APPLICABLE` with a reason, and their visibility is tested per read.
- **Design tokens:** `09-Design-System.md` names every component this screen needs. They are the
  banded featured card („ALS NÄCHSTES"), the **quiet** variant (*"used for a still-important but not
  page-defining prompt (Organisation page)"*), the icon-only bottom bar with a secondary-colour
  active chip that becomes a header row on desktop, and the avatar menu (*"a non-interactive header
  block (name + household), a divider, a list of icon+label menu items, another divider, then
  sign-out"*). `globals.css` has `.card-featured`, `.card-band`, `.eyebrow`, `.skeleton`,
  `.back-link` and `.callout-*`. It has no bottom bar, avatar menu or quiet card.

## Goals / Non-Goals

**Goals:**
- One read per screen, one transaction, and a household session refused inside the repository
  function.
- The precedence rule as a pure function, so that its correctness is a unit test and not a
  database test.
- Every seam F4 needs (T-5's "not voted by me", the screening target) is **one** place to change.

**Non-Goals:**
- No new table, migration, `SECURITY DEFINER` function or RLS change. Decision 9 explains why the
  database half of G-D15 for `application` is not closed here.
- Rebuilding O1 (F3), B2, B4, C1 beyond a placeholder, the PWA band, and "since your last visit"
  (proposal Assumption 4).

## Decisions

### 1. A `(resident)` route group with its own layout

`src/app/(resident)/layout.tsx` carries the frame from `ui/resident-frame`: a header with the brand
and the avatar menu, and the bottom bar *Start · Casting*. It holds `dashboard/` (B1), `casting/`,
`casting/screening/`, `account/` (E1 placeholder; change 5 fills it), and `who-lives-here/` (B5,
moved from `(org)`, same URL). The layout
authenticates (`/sign-in` if there is no session). A session with `profileId = null` is redirected
to `landingPathFor(context)`, which is `/settings`. B5's own household-account branch then becomes
unreachable and is deleted.

The avatar menu's header block states the identity, which is what AC-1.6 asks of every screen,
so the resident frame satisfies it the same way `(org)/layout.tsx` does.

*Alternative:* keep everything in `(org)` and branch the header on `profileId`. Rejected. B1 and O1
are different surfaces (§4.1), and one layout serving both would put a resident's bottom bar on
organisation screens, or the reverse.

### 2. O1 moves to `(org)/organization/`, unchanged

`git mv src/app/(org)/dashboard src/app/(org)/organization`. The only content change is removing
the `already_member` note, which moves to the landings (Decision 8). Every `(org)` back-link
(`members`, `rooms`, `rounds/new` ×2, `rounds/[id]`, `settings` ×2) points to `/organization`.
The label stays `de.nav.organisation`. `(org)/layout.tsx` is untouched: it is the organisation
frame and keeps its "Angemeldet als" header.

### 3. One landing function

`src/app/landing.ts` exports `landingPathFor(context: SessionContext): "/dashboard" | "/settings"`,
a pure function: `profileId === null` gives `/settings`, and anything else gives `/dashboard`. It is
called at every entry point, so the rule exists once:

| Site | Today | After |
|---|---|---|
| `src/app/page.tsx` | `/dashboard` | `landingPathFor(current.context)` |
| `sign-in/actions.ts` | `/dashboard` | path computed inside `try` from `result.context`, `redirect()` after it (the file's convention) |
| `register/actions.ts` | `/dashboard` | `/settings`; registration always yields the household account |
| `join/[code]/actions.ts` success | `/dashboard` | `/dashboard`; a join always yields a resident |
| `join/[code]/actions.ts` `already_member` | `/dashboard?note=…` | `landingPathFor(currentSession) + "?note=already_member"` |
| `join/[code]/page.tsx` `already_member` | same | same |
| `(resident)/layout.tsx` | — | household session → `landingPathFor` |

The two sites that know their identity statically use the literal and a comment saying why, rather
than calling a function whose answer is fixed. `/dashboard` is now **B1** everywhere, so no stale
link to "O1 at `/dashboard`" can remain.

### 4. The reads live in `casting/repository.ts`, and there are two of them

The Start data comes from `application`, `casting_round`, `round_participation` and `room`, all in
casting, joined with `resident_profile.status` the same way `getRoundParticipants` already does. No
new module is justified. ADR-001's six contexts do not include "start", and a module that only
reads other modules' tables would break the boundary it exists to keep.

- **`getStartOverview(context)`** returns `null` when `context.profileId === null` (G-D15, before
  any query; the same shape as `getRoundParticipants` returning `[]`). Otherwise it runs, in one
  `withSessionContext` transaction:
  - the open rounds (`status = 'open'`) in which the viewer has a participation with
    `removed_at IS NULL`, with that participation's `can_vote`, the round's `title` and
    `phase_deadline_at`;
  - per such round with `can_vote`: the count of applications with `round_id` = the round,
    `deleted_at IS NULL`, `state IN ('new','screened')` and **not voted by the viewer**. Today that
    last condition is the constant `TRUE` inside one private helper, `notVotedByViewer(...)`, which
    F4 replaces with a `NOT EXISTS` against `Vote`;
  - for the **active** open round (EC-1.5: most recently opened, the order
    `listRoundsForSession` already uses): the state counts for §3.1, excluding
    `deleted_at IS NOT NULL` and **excluding `became_resident_id = context.profileId`**
    (Decision 7).

  It also returns whether **any** open round exists in the household (identity and lifecycle only,
  no application data). A resident who takes part in none of them is then told that a round is
  running without them, and never that no round is running (pre-mortem finding).

  No participation counter is read. It left Start by human decision (proposal, docs amendment),
  and V-3 (b)'s denominator is F4's to build where D1 shows it.

  It returns plain data, with no display strings and no ordering.

- **`listOrganisationTasks(context)`** returns `[{ kind: "open_round_for_room", roomId, label }]`
  for rooms with `status = 'open'`, `deleted_at IS NULL`, not in the `room_ids` of any round with
  `status IN ('draft','open','paused')`. It returns `[]` unless the viewer holds `close_round`.
  That check is `assertHasPermission` inside a `try`, with only `PermissionDeniedError` caught, so
  the count promises nothing the action refuses. It carries no application-derived value, so it is
  not a G-D15 read, and the household account may call it. Nothing in this slice shows it there,
  but F3's O1 will.

- **`getNavigationAccess(context)`** in `identity/repository.ts` returns
  `{ organisation: boolean; membersList: boolean }`. `organisation` is true when the membership is
  `household_admin` or `moderator` or has any permission (proposal Assumption 3). `membersList` is
  true for `household_admin` or `moderator` (proposal Assumption 1: the rule O1 applies today,
  which is O16's access rule under U-30). It uses `getMembershipForAccount`, so a revoked
  membership gives both `false`. It decides what the bridge and the avatar menu **show**. It
  authorizes nothing: `/members` and every action keep their own checks. One function answers
  both questions, so the menu and the bridge cannot disagree about who has rights.

All three are reads. Each goes into the matrix's `NOT_APPLICABLE` list with a stated reason and gets
its own visibility test (tasks).

*Alternative:* one exported function per number (T-5 count, standing, distribution).
Rejected. That is four G-D15 checks to keep in step and four more matrix entries, and the screen
reads all of them together anyway.

### 5. The precedence rule is a pure module

`src/modules/casting/task-precedence.ts` has no imports from `src/db` or schema. It exports:

- `type TaskType = "T1" | "T2" | "T3" | "T4" | "T5" | "T6"`
- `interface OpenTask { type: TaskType; dueAt: Date | null; ... }`
- `orderTasks(tasks: OpenTask[]): OpenTask[]`: dated tasks first, ascending by `dueAt` (an overdue
  one is simply earlier); then undated tasks by the fixed rank `T1 < T2 < T3 < T4 = T5 < T6`; ties
  broken by a stable key, so the output is deterministic (spec *"Same input, same order"*). T-6 is
  dropped whenever a T-5 is present (§2.3).

The dashboard page maps `getStartOverview` to one T-5 `OpenTask` per open round with a positive
count (`dueAt = phase_deadline_at`), calls `orderTasks`, and renders `[0]` as primary, `[1..3]` as
rows and the rest as "und N weitere". The page, not the module, computes `now` for the overdue
wording. The module has no clock and needs none, because it only compares dates.

It sits in `casting` because v0.1's only task is casting's. When F4 adds `Vote` and T-4/T-6, the
module may move to `deliberation`. The move changes an import, not the rule.

*Alternative:* sort in SQL. Rejected. C-2.8 and P-3 want the rule inspectable in one place, and a
pure function is where a unit test can pin every branch, including the dated branch that no v0.1
UI can reach.

### 6. The round standing is a pure function beside it

`phaseOf(stateCounts)` in the same module applies §3.1's table. It takes the furthest main-path
state present (the order `new … moved_in` is `MAIN_PATH` in `casting/transitions.ts`, reused rather
than restated) and maps it to a phase key. Side states never count, and zero main-path applications
give `waiting_for_applications`. The distribution groups states into the same buckets for display:
„in Sichtung" (`new`, `screened`), „im Termin" (`invited`, `scheduled`), „gecastet"
(`interviewed`), „in Zusage" (`offer_made`, `moved_in`). Only non-zero buckets show. §3.1's own
example (*„7 in Sichtung · 2 im Termin · 1 gecastet"*) is the model for the wording. §8.6 has no
entries for application states, so the copy is written here, as change 0 did.

### 7. Self-redaction is a predicate in the one read that counts states

`became_resident_id IS DISTINCT FROM ${context.profileId}` in the state-count query, written as
raw `sql`, **never** Drizzle's `ne()`. `ne()` compiles to `<>`, which is NULL for every application
with no `became_resident_id` (nearly all of them), so it would silently drop them all. That query is
the only place on Start where an application that became the viewer can be counted. T-5 counts only
`new` and `screened`, and an application reaches `became_resident_id` only at `moved_in`.
V-1 formally hangs on the **account**, through `redaction_subjects()` (`rahmenwerk.md` §4.3), which
is not built. Under A-2.4 (one account per membership) a resident account has exactly one profile,
so the profile id is the account's whole redaction set in this slice. This is stated as a comment at
the predicate and not generalised.

### 8. The already-member note lives on the landings

B1 and O20 each read `searchParams.note` and render `de.join.alreadyMemberNote` in a
`.callout-info` when it equals `"already_member"`. The note carries no code (G-A5 unaffected, same
reasoning as the current O1 comment). O1 loses it.

### 9. The database half of G-D15 for `application` is a finding, not part of this change

G-D15 requires the refusal *„über die Policy-Schicht **und** direkt gegen die Datenbank unter der
Anwendungsrolle"*. For the new reads the policy-layer half holds (Decision 4). The database half
does not hold for `application` today, for any read, old or new, because its only policy is
household isolation. Closing it would take a restrictive policy on `application` keyed on
`current_setting('app.profile_id', true)`. That is an RLS migration touching every existing test
that inserts applications as a household-account context. It also belongs to the layer
`CLAUDE.md` states is application-level by design for roles within a household. It is reported
to the human as its own task and not folded in. What this change's tests **do** pin: a
household-account session calling `getStartOverview` directly gets `null` and **no query is
issued** (asserted by a spy on `withSessionContext`), so the refusal cannot depend on RLS. No test
is written that asserts the gap exists. A test that passes only while a hole is open would be
a strange thing to guard. The change adds no table or policy, so G-C7's two-sided RLS test
obligation does not arise.

### 10. Visual structure

- **B1 top to bottom:** heading „Moin {Name}" (serif) with the household name muted beneath; the
  `already_member` callout if present; the primary card (`.card-featured` + `.card-band` with
  eyebrow „ALS NÄCHSTES", heading with the number, reason line, `.btn-primary` with an arrow); up
  to three task rows as plain `.card` rows with a chevron; „und N weitere" as a `<details>`
  disclosure; the bridge. **No participation counter** (human decision, 2026-09-24).
- **Empty state:** the primary card's place is taken by a `.card` holding the phase as heading and
  the distribution line beneath, or the no-round sentence. It is never blank.
- **The bridge:** a new `.card-quiet` (`bg-secondary` surface, no band, eyebrow „MODERATION" inside
  the padding, per the design system's *quiet* variant) with the heading „{N} Sache(n) wartet/warten
  auf dich" or „Alles erledigt – gut gemacht", one body line, and `.btn-primary` „Zur Organisation
  →". The two cards differ in surface, band and position, so a resident task and an orga task can
  never look alike (human decision, 2026-09-24).
- **Bottom bar:** `.bottom-nav`, fixed, icon-only with `aria-label`s and `aria-current="page"`, and
  the active item in a `bg-secondary` chip with a terracotta icon. At `md:` it moves into the
  header as text links, the active one a `bg-primary` pill. Page content gets bottom padding equal
  to the bar's height so nothing hides behind it.
- **Avatar menu:** a drop-down popover anchored below the trigger. The trigger is the person icon
  plus the display name, as in the human's reference screenshot. The panel is a cream card with
  soft shadow and 16 px radius, right-aligned to the trigger, and in order has:
  - the header block (name bold, household muted);
  - a divider;
  - `Users` „Mitglieder" → `/members` **or** „Wer wohnt hier" → `/who-lives-here`, by
    `membersList`;
  - `Home` „Zur Organisation" → `/organization`, only if `organisation`;
  - a divider;
  - `Settings` „Einstellungen" → `/account` (E1);
  - `LogOut` „Abmelden" as a `<button>` inside the sign-out `<form>`.

  The icons are lucide, already a dependency. **Mechanism (revised in pre-mortem):** a
  `<details>`/`<summary>` whose panel is `position: absolute`, right-aligned below the trigger, so
  it is a drop-down over the page and never pushes content. Without script it opens and closes on
  click and is keyboard- and screen-reader-correct. A small client component adds closing on an
  outside click, on Esc (returning focus to the `<summary>`) and on navigation. *Rejected:* the
  `popover` attribute. It needs Baseline-2024 browsers, and its fallback cannot work, because a
  `popovertarget` trigger is a `<button>` and cannot also be the `href="#…"` a `:target` fallback
  needs. That would exclude older phones (P-2). The sign-out form
  is a sibling of the links, never inside another form (the lesson from change 3). **No bell** in
  the header, although the screenshot shows one.
- **All strings** go in `src/ui/strings/de.ts` under a new `start` group and `nav` additions. No
  literal lives in a `.tsx`.

### 11. Four states per screen (G-N6)

| Screen | Laden | Leer | Fehler | Keine Berechtigung |
|---|---|---|---|---|
| B1 | `loading.tsx` skeleton: heading bar, one featured-card outline, one quiet-card outline | round standing / no round (Decision 10) | `error.tsx`: one sentence, „Erneut versuchen", nothing lost | not a screen state: the only session without access (household account) is redirected to its own landing by the layout. §6's *„Erklärung warum"* has no audience here |
| `/casting` | skeleton card | the placeholder *is* the empty state, with its sentence and a way back to Start | shared `error.tsx` | as B1 |
| `/casting/screening` | skeleton card | placeholder sentence plus back to Start | shared `error.tsx` | as B1 |
| `/account` (E1) | skeleton card | placeholder: email and password follow in the next step, back to Start | shared `error.tsx` | as B1 |

`error.tsx` sits once at `(resident)/error.tsx`. It must not log request data. Change 3's
`join-error-boundary-silent` test is the precedent.

### 12. Room pre-selection on O2 is deferred to F3

B1 shows only the orga-task **count**, and O1 is not rebuilt in this change (human decision,
2026-09-24), so nothing renders the task row that would link to O2 with a room pre-selected.
Building the pre-selection now would be dead code. F3 builds O1's task list and the pre-selection
together. When it does, a `?room=` value must be accepted only if it is a UUID among
`listRooms(context)`, because anyone can set it. The existing action's `close_round` check stays
the authorization. Until then, „Zur Organisation" leads to today's O1, which already offers opening
a round.

### 13. No demo applications

`seed:demo` is not changed (human decision, 2026-09-24): F3 captures applications and F4 screens
them, and each will seed what it owns. The vote card is proven by `start-overview` and
`dashboard-view` tests. For the browser walkthrough the planning session inserts a few
applications into `flatmate-io-dev` from a scratchpad script. It uses the same
`withSessionContext` + `tx.insert(application)` pattern the tests use, and deletes them
afterwards. Nothing about it enters the repo.

### 14. The docs amendment

It is German prose and follows the 2026-09-21 landing decision's pattern (two documents
overruled, recorded in the register, not corrected silently).
- `docs/03-PRD.md` §4.1.2: the table row *Beteiligungsstand* is removed from Start's elements and
  replaced by one sentence naming where it went (D1, after screening) and the dated human
  decision.
- `docs/backlog/requirements/F2-requirements.md` (English): **FR-2.22** and **AC-2.14** are marked
  *(withdrawn 2026-09-24)* with the reason. They are not deleted, because IDs are permanent. The
  summary line (*"the participation counter"*) is struck. FR-2.22's V-3 (b) correction survives
  as the rule D1 inherits.
- `docs/screens/B-start.md` B4 *Zugang*: `„… auf B1 oder D1"` → `„… auf D1"`, with a dated note.
- `docs/review-log.md` §Offene-Punkte-Register: one struck-through row recording the decision, the
  three amended places, and that `/dashboard` is B1 and `/organization` is O1.

`node tools/check-refs.ts` must stay at 0. No frozen file is touched: `07-Screen-Inventar.md`
keeps its snapshot wording, and `screens/` is the living counterpart. Check `docs/COVERAGE.md`
and `docs/SPEC-INDEX.md` for rows that cite FR-2.22/AC-2.14 and amend them in the same way.

## Invariants, and every path that reaches them

| Invariant | Paths that reach the guarded state | Where it is enforced on each |
|---|---|---|
| **G-D15:** no application-derived value to a profile-less session | `getStartOverview` (new) · `listOrganisationTasks` (new; returns no application data, so it is not in scope) · `getRoundForSession` / `listRoundsForSession` / `getRoundParticipants` (existing, unchanged) · `getApplication` (existing: **no** profile check, by-id, not called by any Start path) · `(resident)` pages · raw SQL under `app_runtime` · `SECURITY DEFINER` functions | `getStartOverview`: first statement, before SQL. Pages: the layout redirects first, and the repository refuses anyway. `getApplication`: pre-existing gap, not widened, noted for F3 (its first screen caller). Raw SQL: **not enforced** (Decision 9, finding). `SECURITY DEFINER`: none reads the `application` table (every `SECURITY DEFINER` file in `drizzle/` grepped 2026-09-24; the word appears only in comments) |
| **V-1 (app-level):** the viewer's own past application is not counted | the state-count query in `getStartOverview` · T-5 count · any future Start read | the state-count predicate (Decision 7). T-5: structurally unreachable (`new`/`screened` never carry `became_resident_id`). Future reads: the spec requirement *"The viewer's own past application is not counted"* is the contract |
| **Menu and bridge show only what rights allow** | `getNavigationAccess` · the `(resident)` layout · B1's bridge · `/members`, `/organization` and each action | `getNavigationAccess` decides visibility only. Each destination keeps its own authorization (`/members` page guard, `close_round` on round creation), so a stale or wrong menu can lead only to an existing refusal |
| **An orga task is counted only for someone who may act on it** | `listOrganisationTasks` · the bridge count · `rounds/new` page and action | `listOrganisationTasks` checks `close_round`. The page and `createAndOpenRound` already check `close_round` themselves, so a stale count can only lead to the existing refusal |
| **Landing by identity** | `/`, sign-in, register, join success, join `already_member` ×2, direct URL to a `(resident)` route | Decision 3 table. The layout is the net beneath the entry points |

**Read-then-write:** none. Every new function is a read, and no write path is touched.
**Concurrency:** a room becoming covered between the bridge's count and the
click is a stale read. The action's own checks decide, and nothing is written from the count.

## Risks / Trade-offs

- [The avatar menu's outside-click/Esc close depends on script] → without it the menu still opens
  and closes on its own trigger. Only the convenience is lost, never the destinations (P-2).
- [`notVotedByViewer` is `TRUE`, so T-5 overstates once F4 lands if F4 forgets the seam] → it is a
  named private helper with an F4 comment. The T-5 test asserts the count equals the application
  count, so F4's change is forced to update a failing test rather than pass silently.
- [Moving `(org)/dashboard` breaks bookmarks to `/dashboard` for the household account] → they now
  land on B1's layout, which redirects them to `/settings`. No 404.
- [Decision 9 leaves a known G-D15 gap at the database layer] → it is pre-existing, not introduced.
  It is raised to the human as its own task, and the raw-SQL test documents it rather than implying
  coverage.

## Migration Plan

No database migration. Deploy is the code alone. Rollback is reverting the commit. The change
writes no data.
