# Tasks

> **Before starting:** the branch is `feat/start-screen` on `9c84ddb` (#20 merged). Re-read
> `openspec/config.yaml` and `CLAUDE.md`, especially *Implementation hazards*. Read Next's
> bundled docs under `node_modules/next/dist/docs/` before groups 5–8: route groups, `loading.js`,
> `error.js` (this version's boundary takes `{ error, retry }`), `redirect`, and page `searchParams`
> (a Promise in this version, as in `src/app/(org)/rounds/[id]/page.tsx`).
>
> **What `npm run verify` checks:** eslint, `next typegen && tsc --noEmit`, six lints under
> `scripts/lint/`, check-refs, then vitest, including
> `tests/unit/lint/cleanup-inventory.test.ts` and
> `tests/integration/policy/authorization-matrix.test.ts`.
>
> **No RLS-relevant change, no migration, no hand-off.** No table, policy, predicate or
> `SECURITY DEFINER` function is added or altered, so G-C7's two-sided rule has nothing new to
> cover and there is no statement the harness may refuse. `test/guarded.manifest.json` stays
> byte-identical (G-D15 is already `implemented`; this change only adds reads to its coverage).
> The database-level G-D15 gap for `application` (design Decision 9) is **not** fixed here. Do
> not attempt it.
>
> **Every test task names a deliberate break.** Apply the break, see the test fail, revert, see
> it pass, and **report each one seen failing** in the apply summary. A test not seen failing does
> not count.
>
> **Strings:** every user-facing string goes in `src/ui/strings/de.ts`. No German literal in a
> `.tsx` or a module.

## 1. Docs first: the participation counter leaves Start

> **Human decision, 2026-09-24:** Start shows **no** *„X von Y haben abgestimmt"* and no way into
> B4. Participation and the participant list belong with the score-board after screening (D1,
> F4). This overrides a precedence-level-3 document, so it is recorded in the register and not
> corrected silently (design Decision 14).
>
> `docs/0x`/`screens/` prose is German and `docs/backlog/**` is English (ADR-012). **Nothing under
> `docs/` may cite `openspec/`** (check-refs Rule 7). Frozen files (`04`, `05`, `07`) are not
> touched. IDs are permanent: withdraw, never delete or renumber.

- [x] 1.1 `docs/03-PRD.md` §4.1.2 (Start table): remove the row *Beteiligungsstand*. Beneath the
  table add one sentence: der Beteiligungsstand steht nicht auf Start, sondern im Casting-Tab (D1)
  nach dem Screening, with the dated human decision (2026-09-24) and a pointer to the register row
  from 1.5.
- [x] 1.2 `docs/backlog/requirements/F2-requirements.md`:
  - mark **FR-2.22** and **AC-2.14** *(withdrawn 2026-09-24)*, with one sentence each: the counter
    moved to D1 by human decision, and FR-2.22's V-3 (b) denominator correction stays the rule
    wherever it is shown;
  - amend **US-2.12** to say it is served on D1, delivered with F4, not on Start;
  - strike *"the participation counter"* from the summary at line 19.
- [x] 1.3 `docs/backlog/features/F2-join-in-two-fields.md`: the story *"see '5 of 7 have voted'"*
  gets the same note as US-2.12.
- [x] 1.4 `docs/screens/B-start.md` B4, row *Zugang*: `„… auf B1 oder D1"` → `„… auf D1"`. Add one
  dated blockquote beneath B4's table: **Entschieden (2026-09-24)**. B1 shows no
  Beteiligungsstand; the participant list belongs to D1.
- [x] 1.5 `docs/review-log.md` §Offene-Punkte-Register: add one struck-through row, **Menschliche
  Entscheidung (2026-09-24)**, in the shape of the 2026-09-21 landing row. It records:
  - the counter and the B4 entry leave Start;
  - the places amended (1.1–1.4);
  - the reading of `02-SRD.md`'s *„„5 von 7 haben abgestimmt" im Rundenkopf"*: it is the round's
    head on D1, so SRD is **not** amended;
  - B1 lives at `/dashboard` and the Orga-Dashboard O1 at `/organization`;
  - the household account lands on O20.

  Maßgeblich: `screens/B-start.md` B1/B4, `03-PRD.md` §4.1.2.
- [x] 1.6 Leave every other *„5 von 7"* mention alone. They concern D1, the quorum or v0.2 (SRD
  S-29, `adr/0007-…`, `adr/0014-…`, the compliance annex, the roadmap, the EP-A/EP-D stubs). Say in the
  apply report that they were checked and left.
- [x] 1.7 Run `node tools/check-refs.ts`: 0 findings.

## 2. The pure rule: precedence and phase

- [x] 2.1 Create `src/modules/casting/task-precedence.ts` with **no** import from `src/db/`,
  `schema.ts` or `repository.ts` (design Decisions 5 and 6). It exports:
  - `TaskType`, `OpenTask` (`type`, `dueAt: Date | null`, a stable `key: string`);
  - `orderTasks(tasks)`: dated ascending, then undated by fixed rank `T1 < T2 < T3 < T4 = T5 <
    T6`, ties by `key`; drops T6 when any T5 is present; returns a new array and never mutates its
    input;
  - `phaseOf(stateCounts: Partial<Record<ApplicationState, number>>)`: returns one of
    `waiting_for_applications | voting_round_1 | scheduling | voting_round_2 | offer`, using
    `MAIN_PATH` from `./transitions` (export it there if it is not exported; do not copy the list);
  - `distributionOf(stateCounts)`: the four display buckets of Decision 6, non-zero only, in
    main-path order.

  Cite `rahmenwerk.md` §2.2, §2.3 and §3.1 in the header comment.
- [x] 2.2 `tests/unit/casting/task-precedence.test.ts` (no DB), one case per branch:
  - dated beats undated of an earlier rank;
  - two dated, sooner first;
  - an overdue date sorts before a future one;
  - undated order T1…T6 given in reverse;
  - T4 and T5 tie and resolve by `key`;
  - T6 dropped beside T5 and kept without it;
  - the same input shuffled 20 times gives one output;
  - the input array is unchanged;
  - `phaseOf` gives one case per §3.1 row, side states only → `waiting_for_applications`, and
    furthest wins (`{new: 20, offer_made: 1}` → `offer`);
  - `distributionOf` omits zero buckets.

  **Breaks:** (a) swap the dated/undated groups; (b) remove the T6 filter; (c) let a side state
  count as progress. Each must fail at least one case.

## 3. The reads

- [x] 3.1 `src/modules/casting/repository.ts`: add `getStartOverview(context)` per design
  Decision 4. It must:
  - return `null` when `context.profileId === null` as its **first statement**, before
    `withSessionContext`;
  - run one transaction for everything else;
  - keep `notVotedByViewer` as a **private, non-exported** helper that contributes `TRUE`, with a
    comment naming F4 as the change that replaces it;
  - read **no** participation counter (no denominator, no numerator; proposal, docs amendment);
  - make the state counts exclude `deleted_at IS NOT NULL` and use
    `became_resident_id IS DISTINCT FROM <profileId>` as **raw `sql`**, never Drizzle `ne()`
    (which compiles to `<>` and drops every NULL row), with the Decision 7 comment on A-2.4;
  - also return `anyOpenRound: boolean` (existence only, no application data) for the "round
    runs without you" state;
  - choose the active round in the same order `listRoundsForSession` uses.

  It returns plain data only: no strings and no ordering.
- [x] 3.2 Same file: add `listOrganisationTasks(context)` per Decision 4. Rooms qualify when
  `status = 'open'`, `deleted_at IS NULL`, and no round in `draft`/`open`/`paused` covers them
  (`room_ids`). It returns `[]` when `assertHasPermission(context, context.accountId,
  "close_round")` throws `PermissionDeniedError`. Any other error re-throws.
- [x] 3.3 `src/modules/identity/repository.ts`: add `getNavigationAccess(context): Promise<{
  organisation: boolean; membersList: boolean }>` per Decision 4 and proposal Assumptions 1 and 3.
  It goes through `getMembershipForAccount`, so a revoked membership gives both `false`. Its
  comment says it decides visibility only, never authorization. Point O1's inline
  `canSeeMembersList` (`(org)/organization/page.tsx`, after 5.1) at `membersList` for its
  resident branch, so the rule exists once. Keep O1's `profileId === null` arm as it is: the
  household account sees the members link on O1.
- [x] 3.4 `tests/integration/policy/authorization-matrix.test.ts`: add all three to `NOT_APPLICABLE`,
  each with a one-line reason (read-only; visibility tested in 3.5–3.7). **Break:** run the matrix
  *before* adding them and see it fail naming each new export.
- [x] 3.5 `tests/integration/policy/start-overview.test.ts` (real dev DB, teardown in `afterEach`).
  Build a household with residents via `createResidentProfile` + `claimResidentProfile` (the
  pattern in `tests/unit/casting/round-participant-list.test.ts`). Insert applications with
  `withSessionContext` + `tx.insert(application)` (the pattern in
  `tests/integration/policy/household-scoping.test.ts`), but **with a resident's context**
  (`profileId` set, `created_by_profile_id` = that resident), never the household account's. A
  parallel session may add a restrictive RLS policy on `application` in `flatmate-io-dev` that
  refuses profile-less writes, and these tests must pass under either policy. Cases:
  - **(a)** a household-account context gets `null`, and `withSessionContext` records **zero**
    calls. `vi.spyOn` on an ESM namespace export may throw "Cannot redefine property". Use
    `vi.mock("@/db/session-context", async (importOriginal) => …)` to wrap the real function in a
    `vi.fn` (in this case's own file if the mock would disturb the other cases);
  - **(b)** two `new` + one `screened` + one `invited` + one `rejected_by_household` in the open
    round: the T-5 count is 3;
  - **(c)** a participation with `can_vote = false`: no T-5 count for that viewer, but the standing
    is still returned;
  - **(d)** a participation with `removed_at` set: that viewer is not offered the round's T-5;
  - **(e)** a resident who joined the open round after it opened (the trigger path, as
    `join-open-round.test.ts` does) is offered its T-5;
  - **(f)** V-1: an application with `state = 'moved_in'` and `became_resident_id` = the viewer is
    absent from the viewer's state counts and present in another resident's;
  - **(f2)** a `moved_in` application with `became_resident_id` NULL **is** counted (the NULL
    trap);
  - **(f3)** a viewer whose participation has `removed_at` set, while a round is open: no open
    round for them, `anyOpenRound` true, and no state counts returned;
  - **(g)** a `deleted_at` application is absent from every count;
  - **(h)** a `phase_deadline_at` set on the round is returned;
  - **(i)** no open round: the open-round list is empty and nothing throws.

  **Breaks:** (a) move the `null` return below `withSessionContext`: the spy assertion fails;
  (d) drop the `removed_at IS NULL` predicate; (f) remove the `became_resident_id` predicate; (f2) replace it with Drizzle `ne()`;
  (g) remove `deleted_at IS NULL`.
- [x] 3.6 `tests/integration/policy/organisation-tasks.test.ts`:
  - **(a)** an `open` room covered by no round appears once, with its label;
  - **(b)** the same room covered by an `open` round disappears, and likewise for a `draft` round
    created via `createRound` (the only way a draft exists);
  - **(c)** a `planned` room never appears;
  - **(d)** a plain `member` resident gets `[]`;
  - **(e)** a `member` holding a permission other than `close_round` gets `[]`, **and**
    `getNavigationAccess(...).organisation` is `true` for them. This is the spec scenario *"A count the viewer can
    act on"*;
  - **(f)** a moderator (default `close_round`) sees the task.

  **Breaks:** (b) drop `draft` from the covering statuses; (e) remove the permission check.
- [x] 3.7 `tests/integration/policy/navigation-access.test.ts`: `getNavigationAccess` gives:
  - `household_admin` → both true;
  - `moderator` → both true;
  - a member with any permission → `organisation` true, `membersList` false;
  - a plain member → both false;
  - after `removeMember` revokes the membership → both false. **Break:** skip the `revoked_at` lookup by
  querying `membership` directly, and see the last case fail. Revert.

## 4. Landing by identity

- [x] 4.1 Create `src/app/landing.ts`: `landingPathFor(context)` per design Decision 3, pure, no
  I/O.
- [x] 4.2 Apply Decision 3's table exactly. The six sites are `src/app/page.tsx`,
  `src/app/(auth)/sign-in/actions.ts` (compute inside `try`, `redirect()` after it),
  `src/app/(auth)/register/actions.ts` (`/settings` literal + comment),
  `src/app/(auth)/join/[code]/actions.ts` (success stays `/dashboard` + comment; `already_member`
  via `landingPathFor`), and `src/app/(auth)/join/[code]/page.tsx` (`already_member`). Update the
  comments that call `/dashboard` "the temporary Start stand-in": that stand-in no longer exists.
- [x] 4.3 `tests/unit/start/landing.test.ts`:
  - **(a)** `landingPathFor` gives `/settings` for `profileId: null` and `/dashboard` otherwise;
  - **(b)** a source-level check over the six files: no `redirect("/dashboard?note=` literal
    remains, `sign-in/actions.ts` and `page.tsx` import `landingPathFor`, and `register/actions.ts`
    no longer redirects to `/dashboard`. This follows the precedent of
    `tests/unit/identity/join-code-never-in-query-or-log.test.ts`, which reads sources.

  **Break:** restore `redirect("/dashboard")` in `register/actions.ts`.

## 5. Routes: O1 to `/organization`, B5 into the resident group

- [x] 5.1 `git mv "src/app/(org)/dashboard" "src/app/(org)/organization"`. In the moved `page.tsx`,
  remove the `note`/`already_member` block and the `searchParams` prop, and update its header
  comment (Screen O1, now at `/organization`; F3 rebuilds it). Nothing else changes.
- [x] 5.2 Every `href="/dashboard"` back-link in `src/app/(org)/` → `/organization`: `members/page.tsx`,
  `rooms/page.tsx`, `rounds/new/page.tsx` (×2), `rounds/[id]/page.tsx`, `settings/page.tsx` (×2).
  `rounds/new/actions.ts`'s `redirect("/dashboard")` after creating a round → `/organization`.
  Grep `src/` for `/dashboard` afterwards. The only remaining hits may be B1's own route, the
  landing function, the join success redirect and the resident nav.
- [x] 5.3 `git mv "src/app/(org)/who-lives-here" "src/app/(resident)/who-lives-here"` (same URL).
  Its back-link → `/dashboard` with the label `de.nav.start` (key added in 6.5). Delete its `profileId === null`
  branch: the `(resident)` layout (6.1) redirects that session before the page runs. Say so in a
  comment. **Keep** `getCurrentHouseholdMembers` untouched.
- [x] 5.4 Settings (O20) renders the `already_member` note from `searchParams` (design Decision 8)
  above its content, with the same callout markup and key as B1.

## 6. The resident frame

- [x] 6.1 `src/app/(resident)/layout.tsx`: no session → `/sign-in`; `profileId === null` →
  `redirect(landingPathFor(context))`. It renders the header (brand, avatar menu), `<main>` with
  bottom padding for the bar, and the bottom bar. It reads the display name and household name
  via `getIdentityLabel` + `getHousehold` (existing), and `getNavigationAccess` for the menu.
- [x] 6.2 `src/app/(resident)/avatar-menu.tsx` per design Decision 10 (revised): a `<details>` /
  `<summary>` with a `position: absolute` panel below and right-aligned to the trigger, plus a small
  `"use client"` enhancement that closes it on an outside click, on Esc (focus back to
  `<summary>`) and on navigation. **Not** the `popover` attribute. The trigger shows the person
  icon and the display name, and has an `aria-label`. The
  panel, in order:
  - the header block (name, household);
  - a divider;
  - „Mitglieder" → `/members` if `membersList`, else „Wer wohnt hier" → `/who-lives-here`;
  - „Zur Organisation" → `/organization` if `organisation`;
  - a divider;
  - „Einstellungen" → `/account`;
  - „Abmelden" as the button of a `<form action={signOutAction}>` reusing
    `src/app/(org)/sign-out-action.ts`.

  The items use lucide icons (`Users`, `Home`, `Settings`, `LogOut`). The form is **not** nested in
  any other form. Put the item selection in a pure `menuItems(access)` beside it and unit-test it
  (`tests/unit/start/menu-items.test.ts`), one case per rights combination. **Break:** show both
  list links for a moderator.
- [x] 6.2a `src/app/(resident)/account/page.tsx` (E1 placeholder): heading „Einstellungen", one
  sentence that adding an email address and changing the password follow in the next step, and a
  back link to Start. No household-settings content or link. `loading.tsx` skeleton. Change 5
  replaces the body.
- [x] 6.3 `src/app/(resident)/bottom-nav.tsx` (`"use client"` for `usePathname`): two items, Start → `/dashboard` and Casting →
  `/casting`, icon-only with `aria-label`, `aria-current="page"` on the active one (active when
  the path starts with the item's href). Header text links at `md:`. No bell.
- [x] 6.4 `src/app/globals.css`: `.card-quiet`, `.bottom-nav` (+ item/active), `.avatar-menu`
  (+ panel/header/item/divider), all from `09-Design-System.md` tokens and in both themes. No new
  colour values: reuse the existing CSS variables.
- [x] 6.5 `src/ui/strings/de.ts`:
  - `nav`: `start`, `casting`, `whoLivesHere`, `members`, `toOrganisation`, `accountSettings`,
    `openMenu`;
  - a new `start` group: greeting, eyebrow „ALS NÄCHSTES", T-5 heading with count, the reason texts
    (dated / overdue / undated), "und N weitere", phase keys, distribution buckets, the no-round
    sentence, and the bridge's eyebrow, heading (singular and plural), body, button and all-done
    text;
  - the casting, screening and account placeholders, and the error texts.

  Follow C-10 (process, never person).

## 7. B1

- [x] 7.1 `src/app/(resident)/dashboard/page.tsx`: it calls `getStartOverview`,
  `listOrganisationTasks`, `getNavigationAccess` and `getIdentityLabel`/`getHousehold`. It maps
  the result to `OpenTask`s (one T-5 per open round with a positive count, `dueAt =
  phase_deadline_at`, `key = round id`) and runs `orderTasks`. It renders per design Decision 10:
  - the greeting;
  - the note (from `searchParams`);
  - the primary card, whose button goes to `/casting/screening`;
  - up to three rows, and the rest in a `<details>` „und N weitere";
  - when there is no primary, the standing card (`phaseOf`, `distributionOf`, or the no-round
    sentence);
  - **no** participation counter;
  - the bridge, only if `getNavigationAccess(...).organisation`. Its count is `listOrganisationTasks().length`
    with the all-done text at 0, and its button goes to `/organization`.

  The reason text is chosen by the page from `dueAt` vs `now`: dated future, overdue, or undated
  (*„In der Runde „{Titel}" wird gerade abgestimmt."*).
- [x] 7.2 `src/app/(resident)/dashboard/loading.tsx`: a skeleton in the shape of heading, featured
  card and quiet card (`.skeleton`). No spinner, no layout jump.
- [x] 7.3 `src/app/(resident)/error.tsx`: one sentence, „Erneut versuchen" (calls `retry`), and the
  reassurance that nothing was lost. It **logs nothing** derived from the request. Mirror
  `src/app/(auth)/join/error.tsx`, and extend or mirror
  `tests/unit/identity/join-error-boundary-silent.test.ts` for it. **Break:** add a
  `console.error(error)`.
- [x] 7.4 `tests/unit/start/dashboard-view.test.ts`: extract the page's pure mapping into
  `src/app/(resident)/dashboard/dashboard-view.ts` (overview + tasks + now → a view model with
  `primary`, `rows`, `folded`, `standing`, `bridge`, and deliberately no counter field) and test
  that module without the DB:
  - one T-5 → primary, no rows;
  - five tasks → 1 + 3 + folded 1;
  - no open round → `standing.noRound`;
  - `anyOpenRound` but no participation → `standing.runningWithoutYou`, with no numbers;
  - `can_vote = false` → no primary, standing present;
  - bridge absent without access, 0 → all-done, 2 → plural;
  - an overdue deadline → the overdue reason;
  - **no view state yields both a primary and an empty surface**.

  **Breaks:** render rows `[0..4]`; show the bridge without access.

## 8. Casting placeholders

- [x] 8.1 `src/app/(resident)/casting/page.tsx`: call `getStartOverview`. If any open round has a
  positive T-5 count → `redirect("/casting/screening")`. Otherwise render the placeholder card
  („Wird in F4 & F5 gebaut") with a way back to Start. Add a `loading.tsx` skeleton.
- [x] 8.2 `src/app/(resident)/casting/screening/page.tsx`: the placeholder card saying screening
  arrives with F4, with the count of applications awaiting the viewer (from `getStartOverview`)
  and a way back to Start. Add a `loading.tsx` skeleton.
- [x] 8.3 Put the redirect decision in `dashboard-view.ts` (or a sibling pure helper) as
  `shouldOpenScreening(overview)`, and unit-test it: true with a positive count, false with none,
  false for `null`. **Break:** always return false.

## 9. (withdrawn: O2 room pre-selection moves to F3)

> B1 shows only the orga-task **count**, and O1 is not rebuilt here, so nothing in this change
> renders the task row that would link to `/rounds/new?room=<id>`. Pre-selection ships with F3's
> O1 task list (design Decision 12). Nothing to do. The group number is kept so later groups do
> not renumber.

## 10. The ride-along

- 10.1 (withdrawn: no demo applications. F3/F4 seed their own data, human decision
  2026-09-24.) Leave `scripts/seed-demo-household.ts` untouched.
- [x] 10.2 `openspec/config.yaml`: `"the four hand-written guardrail lints"` → `"the six hand-written
  guardrail lints"`. Run `openspec doctor`, which must still parse.

## 11. Verification

- [x] 11.1 `npm run verify` green. Report files/tests counts and check-refs.
- [x] 11.2 Row counts on `flatmate-io-dev` for every table in `HOUSEHOLD_SCOPED_TABLES` are the same
  before and after the suite. Report both. **A parallel session (G-D15 fix) may run its own suite
  against the same database**, so a difference is not by itself a leak. If counts differ, check
  whether the extra rows belong to households this run created (test households are named and
  timestamped by `registerTestHousehold`) and report which. Stop only if they are yours.
- [x] 11.3 **Stop here and hand back.** The walkthrough (B1 in each state, 390 px and desktop,
  light and dark, the avatar menu by keyboard, the Casting redirect, household-account landing on
  O20, the account placeholder) is done by the planning session in the browser preview, not by
  the applier. Do **not** archive, commit or push.
