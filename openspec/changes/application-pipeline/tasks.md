# Tasks

> **Order matters.** Migration `0027` reaches dev only in group 9, after all the code is written.
> Until then, tests that need the new permission cannot pass against dev. As you go, run `npx tsc
> --noEmit`, `npm run lint` and the pure unit tests. The full `npm run verify` runs in group 10.
>
> **Hard floor:**
> - G-C, G-D, G-L, G-G1/G-G3.
> - No `expect` line in a guarded test file changes. Those files are
>   `tests/unit/audit/backward-transition.test.ts` (G-D3) and
>   `tests/integration/policy/application-visibility-household-account.test.ts` (G-D15). Only their
>   setup changes, and the diff is shown to the human.
> - Never mark anything in `test/guarded.manifest.json`.
> - **Never edit an applied migration** (`drizzle/0000`–`0026`).
>
> **Every test task names its deliberate break.** Run the break, see the test fail, revert it, and
> report the failure message. Where a case is held by RLS no matter what the code does, it is
> labelled an **invariant guard**, and it has no break.
>
> **Test files end in `.test.ts`**, never `.tsx`: `vitest.config.ts` only includes
> `tests/**/*.test.ts`. Render tests use `createElement` + `renderToStaticMarkup`, like
> `tests/unit/casting/third-party-notice.test.ts`.
>
> **The no-query spy.** A test that proves "no query runs" (a spy on `withSessionContext`) goes
> into `tests/integration/policy/application-household-account-no-query.test.ts`, which isolates
> that module mock. Never add it to a file that also talks to the database.

## 1. Permission constant, CHECKs and migration 0027 (design D8)

- [x] 1.1 `src/modules/identity/schema.ts`:
  - add `MODERATOR_ONLY_PERMISSIONS = ["reverse_application_state"] as const`, with a comment:
    the matrix gives reversing ❌ (not ⬜) to everyone but the moderator (`03-PRD.md` §4.0.1),
    and the human decision that roles are permission sets;
  - spread it into `MODERATOR_PERMISSIONS`;
  - add `check("membership_moderator_only_permissions", …)` built with `permissionArrayLiteral`
    (never a bound param), with its comment (D8: why a CHECK, and the writer table).
- [x] 1.2 Generate: `npx drizzle-kit generate --name reverse_application_state`. Then hand-edit
  `drizzle/0027_reverse_application_state.sql` into D8's five steps, in order:
  - the LOCK;
  - the precondition `DO $$ … RAISE EXCEPTION … $$`;
  - the moderator backfill (a sorted union);
  - drop and add the moderator CHECK (five values);
  - drop and add the moderator-only CHECK.
  
  Head the file with a comment in `0024`'s style that argues the order. Check:
  `grep -nE '\$[0-9]' drizzle/0027*` → no output (a bound-parameter leak; the `$$` of the DO block
  is expected). Keep `drizzle/meta/` as generated.
- [x] 1.3 `tests/unit/identity/role-permissions-constants.test.ts` (design D8):
  - CHECK assertions: for each constraint name, read the **last** `drizzle/*.sql` file (by file
    name) that adds it, then assert `membership_moderator_holds_role_permissions` (from `0027`) =
    `MODERATOR_PERMISSIONS`, and `membership_moderator_only_permissions` =
    `MODERATOR_ONLY_PERMISSIONS`;
  - `0024`'s backfill test: pin its moderator literal to a frozen `MODERATOR_PERMISSIONS_AT_0024`
    (the four values), declared in the test with a comment that it records history. The
    household and resident sets stay compared with their live constants;
  - new: the `0027` backfill literal = `MODERATOR_ONLY_PERMISSIONS`.
  
  **Break:** remove `reverse_application_state` from the `0027` CHECK literal → the test fails.
  **Do not touch `0024`.**
- [x] 1.4 Grep `tests/` for hand-written moderator permission arrays
  (`grep -rn "close_round" tests/`) and for assertions that the moderator set has exactly four
  values (`moderator-permissions.test.ts`, `founding-resident-permission.test.ts`). Make each use
  `MODERATOR_PERMISSIONS`, or extend it to five. List every file you touched in the report.
- [x] 1.5 `tests/integration/raw-sql/membership-role-integrity.test.ts`, three new cases (spec
  "A membership that contradicts its roles cannot exist"), each asserting the refusal's SQLSTATE
  `23514` and the constraint name:
  - (a) a live member (not a moderator) updated by raw SQL to hold `reverse_application_state` →
    refused (`membership_moderator_only_permissions`);
  - (b) the same member updated to hold `change_application_state` → accepted;
  - (c) a moderator's permissions updated with `array_remove(permissions,
    'reverse_application_state')` → refused (`membership_moderator_holds_role_permissions`).
  
  **Break:** comment out the new `check()` and run against a database without it. The agent cannot
  drop a constraint as `app_runtime`, so argue this break in the report instead: without the
  CHECK, (a) succeeds. Then run (c)'s break by using a pre-`0027` literal in a scratch assertion.

## 2. `transitionApplication` guarded (design D6, D6a)

- [x] 2.0 `src/modules/casting/transitions.ts` (D6a):
  - `PENDING_STEPS` (a runtime `as const` array: `appointment`, `interview`, `offer`, `move_in`,
    `move_in_reversal`, `retention`), `PendingStep` derived from it, `TransitionKey`,
    `TransitionRule`;
  - `TRANSITION_RULES = new Map<TransitionKey, TransitionRule>([...])` with explicit type
    arguments. One entry per `TRANSITIONS` pair (54), written out per row:
    - the 18 `state_only` rows exactly as D6a lists them, each with its `requires` spelled out
      (`["change_application_state"]`, or with `"reverse_application_state"` added for a backward
      row and every reopening);
    - the other 36 are `pending`, with their `step` by D6a's table and rule (a side row takes the
      step of the main-path state it leaves or re-enters);
  - `ruleFor(from: ApplicationState, to: ApplicationState)`, which throws `InvalidTransitionError`
    when undeclared.
  
  A header comment covers:
  - how a later step extends the table (D6a "Extending"), and that the `operation` kind is added by
    the first feature that builds one;
  - that a reopening is re-classified with its target's forward row;
  - `F1_REACHABLE_TRANSITIONS` (`room-transitions.ts`) as the sibling pattern.
  
  The file stays pure: at most `import type` from identity. `TRANSITIONS`,
  `assertTransitionAllowed` and `isBackwardTransition` stay as they are.
- [x] 2.0a `tests/unit/casting/transition-rules.test.ts`:
  - the key set of `TRANSITION_RULES` equals the pair set of `TRANSITIONS` exactly (54);
  - **the whole table equals a literal in the test**: each pair with its kind, and its exact
    `requires` array or its `step`. A wrong permission on any row (for example an extra
    `create_application` on `new->screened`) fails here, not only a wrong kind;
  - independently: every `state_only` row's `requires` contains `change_application_state`, and
    contains `reverse_application_state` exactly when `isBackwardTransition` is true;
  - every permission in any `state_only` `requires` is in `MODERATOR_PERMISSIONS`;
  - every `pending` row's `step` is in `PENDING_STEPS` (the runtime array);
  - 18 `state_only`, 36 `pending`.
  
  **Breaks:**
  - mark `interviewed->offer_made` as `state_only` → the literal case fails;
  - drop `reverse_application_state` from `screened->new` → the literal and backward cases fail;
  - add `create_application` to `new->screened` → the literal case fails.
- [x] 2.1 `src/modules/casting/repository.ts`:
  - new `ApplicationTransitionError` (codes `not_found`, `step_not_available`);
  - rewrite `transitionApplication(context, applicationId, toState)` per D6 steps 1–4 and D6a's
    order:
    - the `actor` parameter removed;
    - `assertHasPermissionTx(change_application_state)`;
    - the row `FOR UPDATE` with the household predicate;
    - `ruleFor` (instead of `assertTransitionAllowed`);
    - `pending` → `step_not_available`;
    - **every** permission of the row's `requires`, `change_application_state` included (finding 1
      of the second pre-mortem: the helper never assumes an entry was checked earlier);
    - the actor from `context`;
    - **the SELECT and the `.returning()` both list lifecycle columns only**.
  
  Keep `ruleFor`, the `pending` check, the `requires` loop, the UPDATE and the event in one private
  helper (`applyTransitionTx`). Its comment says it is exported, with `expectedKind`, by the first
  feature that owns an operation **or** needs two or more rows in one transaction (F5's „Als
  eingeladen markieren", `new → screened → invited`).
  
  Update its comment block, including the lock order and D7's writer table (short form).
- [x] 2.2 Update every caller to the new signature:
  - `scripts/seed-demo-household.ts`: drop the actor argument and the stale "still unguarded"
    comment; Alex is a moderator, so it still works;
  - `tests/integration/policy/start-overview.test.ts` (f5): the walk-back from `moved_in` passes
    `pending` rows, which are now refused. Insert the application directly at `invited`, with
    `becameResidentId` set to the **founder's** profile, as today. Then `founder` (the moderator)
    takes `invited → screened`. Add a comment: the plain resident's walk-back was reachable only
    while the function was unguarded, and the row is inserted because the declared walk-back's
    steps are not built yet. A `screened` row with `became_resident_id` is reachable through that
    walk-back (P-4, `zustandsmaschinen.md` §3.1). Do not cite G-D9 as a guarantee: it is still
    `pending`. The assertions stay unchanged;
  - `tests/integration/policy/application-visibility-household-account.test.ts` (**guarded,
    setup-only**): drop the `actor` argument only. Its break comment (lines ~101–105) becomes
    inaccurate: without the early check, a profile-less session now fails with
    `PermissionDeniedError`, since `null === null` passes the profile match, instead of
    "Application not found". Leave the guarded file's comment as it is and **report** it for the
    human;
  - `tests/unit/audit/backward-transition.test.ts` (**guarded, G-D3, setup-only**):
    - replace the invented account and household with `registerTestHousehold` +
      `createTestModerator` + `insertTestRound`;
    - keep `const actor = { accountId: moderator.accountId, profileId: moderator.profileId }`,
      because the `expect` lines read `actor.accountId`/`actor.profileId`;
    - call with the moderator's context;
    - replace the `seededHouseholds` teardown with `afterEach(() => hh?.cleanup())`.
    
    Every `expect` line stays byte-identical;
  - `tests/integration/policy/decidable-mutator-authorization-fixes.test.ts`: the comment only.
  
  `grep -rn "transitionApplication(" src scripts tests` must show no call with four arguments.
- [x] 2.3 `tests/integration/policy/authorization-matrix.test.ts` (D6):
  - remove `KNOWN_OPEN_CASTING`'s entry and the "no route caller yet" test (remove the record
    entirely if nothing else uses it);
  - classify `transitionApplication` and `updateApplication` as mutators that refuse a plain
    resident, in the file's existing shape;
  - add `listOrganisationApplications` to `NOT_APPLICABLE_CASTING`: "read; its visibility is
    tested per read in `application-pipeline-list.test.ts`".
  
  The file's "every export is classified" test must pass. **Break:** remove the
  `change_application_state` check → the matrix fails for `transitionApplication`.
- [x] 2.4 New `tests/integration/policy/application-transition-guard.test.ts` (FR-3.24, AC-3.21).
  Use real households, `createTestModerator`, and a claimed plain resident. Cases, each asserting
  the **error class and code**, and that `state`, `state_changed_at` and the event count are
  unchanged on refusal:
  - (a) a plain resident, forward → `PermissionDeniedError`;
  - (b) a resident granted only `change_application_state` by raw SQL (⬜ is legal), forward
    `new → screened` → it succeeds;
  - (c) the same resident, backward `screened → new` → `PermissionDeniedError`;
  - (d) a moderator, backward → it succeeds; assert `state`, `state_changed_at` and one event with
    the moderator's `actor_account_id`/`actor_profile_id` and `{fromState, toState}`; assert the
    returned object has **no** `applicantName`/`contactEmail`/`messageRaw` key;
  - (e) the household account → `ProfileRequiredError` (the no-query half goes into the no-query
    file, see the header);
  - (f) an application id of another household → `ApplicationTransitionError` `not_found`. This is
    an **invariant guard**: RLS hides the row whatever the predicate says, so there is no break;
  - (g) a malformed id → `not_found`;
  - (h) a moderator, `invited → scheduled` and (a row inserted at `interviewed`) `interviewed →
    offer_made` → `ApplicationTransitionError` `step_not_available`; `state`, `state_changed_at`,
    `assigned_room_id` and the event count unchanged;
  - (i) the granted resident of (b) reopens a `rejected_by_household` row into `screened` →
    `PermissionDeniedError`; a moderator doing the same → it succeeds;
  - (j) a moderator, `invited → screened` → it succeeds (a `state_only` backward row).
  
  **Breaks:**
  - drop the reverse check → (c) and (i) fail;
  - drop the lifecycle column list (back to `.returning()`) → (d)'s key assertion fails;
  - skip the `pending` check → (h) fails.
- [x] 2.5 Same file, the concurrency case (D7). Open a raw transaction that holds `SELECT … FOR
  UPDATE` on the application (uncommitted). Start `transitionApplication` `new → screened`. Assert
  it has not resolved after a short wait. Then commit the holder's own UPDATE to `screened` and
  assert the transition fails with `InvalidTransitionError` (it re-read `screened`). This is the
  deterministic pattern of `revoked-membership-sign-in.test.ts`. **Break:** remove `.for("update")`
  → both succeed, or the assertion that the transition was still waiting fails.
- [x] 2.6 `tests/integration/policy/application-household-account-no-query.test.ts`: add
  `transitionApplication`, `listOrganisationApplications` and `updateApplication` for a
  profile-less context. Each is refused (or `null` for the read), and `withSessionContext` is never
  called. **Break:** move the profile check below `withSessionContext` in one of them → it fails.

## 3. Audit and vocabulary

- [x] 3.1 `src/modules/audit/repository.ts`: register `"application.updated": ["fields"]` with the
  comment of D4 (field names only, never values, G-D7; not redactable; the F5 marker reads the
  content subset).
- [x] 3.2 `src/ui/strings/de.ts`:
  - `status.application`, the eleven §8.6 words verbatim;
  - `applications.list`: heading „Bewerbungen", empty „Noch keine Bewerbung erfasst", the group
    label `(word, n) => \`${word} · ${n}\``, the age `(n) => \`${n} Jahre\``, and the load error
    of D2;
  - `applications.notice.applicantText` (Compliance §4.5 Stufe 1 **verbatim**, with a comment
    citing it), `showApplicantNotice` „Datenschutz-Hinweis anzeigen", `hideApplicantNotice`,
    `whyToggle` „Warum steht das hier?", and `why` (D3's draft, marked in a comment as awaiting
    the human's wording);
  - `applications.edit`: heading „Bewerbung bearbeiten", save „Änderungen speichern", pending,
    `updated` „Änderungen gespeichert", `permissionDenied` „Bewerbungen bearbeitet die Moderation
    der WG.", `editLink` „Bearbeiten", and `stale` (D4's sentence);
  - `applications.errors.not_found` and `stale`, if the edit action maps them there.
- [x] 3.3 A unit test (`tests/unit/casting/application-state-words.test.ts`): the keys of
  `de.status.application` equal `applicationStateEnum.enumValues` as a set. **Break:** delete one
  key → it fails.

## 4. The list read and grouping (design D1)

- [x] 4.1 New `src/modules/casting/application-groups.ts`: `APPLICATION_STATE_ORDER` and
  `groupApplicationsByState`, pure, per D1.
- [x] 4.2 `tests/unit/casting/application-groups.test.ts`:
  - the order equals the enum set, with no duplicates;
  - the main path comes first, then the side states;
  - empty groups are dropped;
  - the input order is kept within a group;
  - the counts equal the row counts.
  
  **Break:** leave `archived` out of the order → the set test fails.
- [x] 4.3 `src/modules/casting/repository.ts`: `listOrganisationApplications(context, roundId)`
  per D1 (the null cases before any query; the locked permission check; the column list without
  `message_raw`/`attributes`; the round and household predicates; `ORDER BY created_at DESC`).
  Comment it as the sibling of `getOrganisationApplication`, with the same rule, and why it is not
  merged with it.
- [x] 4.4 New `tests/integration/policy/application-pipeline-list.test.ts`:
  - (a) a moderator sees `new` and `screened` rows of the round, grouped via 4.1 (AC-3.13), with
    the ids exact;
  - (b) rows of another round of the same household are absent;
  - (c) a round id of another household → `[]` (an **invariant guard**: RLS, no break);
  - (d) a plain resident → `PermissionDeniedError`;
  - (e) a malformed id → `null`;
  - (f) the result carries no `messageRaw`/`attributes` key;
  - (g) a revocation in flight is waited for: hold an uncommitted revoking UPDATE on the reader's
    membership, start the read, assert it is pending, commit, and assert `PermissionDeniedError`.
  
  **Breaks:** drop the round predicate → (b) fails. Drop the lock (`{ lock: false }`) → (g) fails.
  Select the whole row → (f) fails.

## 5. The round page (O4, design D2)

- [x] 5.1 `src/app/(org)/rounds/[id]/page.tsx`:
  - header and „Bewerbungen" in one `panel-round`, participants below;
  - the three viewer cases of D2's table;
  - the groups, with the §8.6 word and count as each heading;
  - rows as link-cards to the detail (name, state badge, „Über jemand anderen" when third party,
    the muted age · contacts line);
  - the empty state, with „Bewerbung erfassen" only when `canCapture` and no second capture
    button;
  - the load-error sentence, logging `{ code: "unexpected", name }` only. `TypeError` and
    `ReferenceError` are **rethrown**, and the capture link stays in the error state (D2).
  
  Put the section in `applications-section.tsx` (server-renderable, props only), so it can be
  render-tested. All text comes from `de.ts`. No `dangerouslySetInnerHTML`.
- [x] 5.2 `src/app/(org)/rounds/[id]/loading.tsx`: the D2 skeleton (a heading, then the list,
  inside one `panel-round`); keep the `@/ui/skeletons` import (pending-feedback lint).
- [x] 5.3 Render test `tests/unit/casting/round-applications-section.test.ts` (`createElement` +
  `renderToStaticMarkup`). Cases:
  - the groups and counts;
  - the third-party marker on exactly the third-party row;
  - empty with and without `canCapture`;
  - the household sentence with no count anywhere in the output (no digit from the data);
  - the load-error state, with the capture link.
  
  **Break:** render the count for the household case → the test fails.
- [x] 5.4 `tests/unit/casting/round-page-capture-link.test.ts` (pre-mortem M7): extend its
  `@/modules/casting/repository` mock with `listOrganisationApplications` (rows for the moderator
  case, a `PermissionDeniedError` for the plain resident). Assert that the moderator case renders
  a group heading. **Break:** drop the new mock entry → the test fails with the rethrown
  `TypeError`, not a silent error state.

## 6. The notice on every application (design D3)

- [x] 6.1 Rename `src/app/(org)/rounds/[id]/applications/third-party-notice.tsx` →
  `notice.tsx`, and update the O3 import. Extract `NoticeTextPanel` unchanged in behaviour. Add
  the `why` prop to `ThirdPartyNotice`. Add `ApplicantNotice` (collapsed, secondary button,
  `aria-expanded`, `NoticeTextPanel` seeded with `applicantText`) and `WhyNotice`. Keep the header
  comment's rules (no name on the textarea, outside any form, no send control).
- [x] 6.2 `src/app/(org)/rounds/[id]/applications/[applicationId]/page.tsx`:
  - a third party gets `ThirdPartyNotice why`;
  - the applicant gets `ApplicantNotice` + `WhyNotice`;
  - „Bearbeiten" (a secondary link to `edit`) only for a `create_application` holder (try/catch as
    on the round page);
  - `SavedToast` with `param="updated"` when `?updated=1`;
  - `getHousehold` still only for a third party.
- [x] 6.3 `src/app/(org)/rounds/[id]/saved-toast.tsx`: a `param` prop (default `"saved"`), used in
  the URL cleanup.
- [x] 6.4 Extend `tests/unit/casting/third-party-notice.test.ts` (keep its file name; update its
  import to `notice.tsx`):
  - `ApplicantNotice` is collapsed first and, opened (a `defaultOpen` prop, as in
    `ThirdPartyNotice`), contains the Stufe 1 text and not the third-party sentence („über eine
    andere Person");
  - `ThirdPartyNotice` (`defaultOpen`) contains it;
  - neither renders an element with a `name` attribute, a `<form>`, a `mailto:` or a send/share
    button;
  - `WhyNotice` opens in place with no link.
  
  **Break:** seed `ApplicantNotice` with `thirdPartyText` → the test fails.

## 7. Correction (design D4, D5)

- [x] 7.1 New pure `src/modules/casting/application-changes.ts`: `CORRECTABLE_FIELDS` (the eight,
  in the spec's order), `changedApplicationFields(current, parsed)`, and
  `applicationBaseline(row)` (SHA-256 hex of the canonical JSON of the eight, via `node:crypto`).
  It has no database access.
- [x] 7.2 `src/modules/casting/repository.ts`:
  - `ApplicationUpdateError` (`not_found`, `stale`);
  - `updateApplication` per D4 steps 1–4, with c2 (the baseline);
  - the SET list built from the changed keys only;
  - the assertion that `fields` ⊆ `CORRECTABLE_FIELDS` before recording;
  - a comment that the SET list never contains `round_id`/`household_id` (the pairing trigger),
    and the lock order.
  
  It returns `{ changed }` only.
- [x] 7.3 `tests/unit/casting/application-changes.test.ts`:
  - no change → `[]`;
  - each field alone;
  - attributes reordered → changed;
  - blank vs null → unchanged;
  - the contacts round trip of D4 (the email, the phone, a phone of 51 characters →
    `contactOther`, an "other" value) → `[]` after `parseApplicationInput` of the pre-filled
    contacts;
  - the baseline is stable for equal rows and differs when any one of the eight differs.
  
  **Break:** compare attributes by reference → the "unchanged" case fails.
- [x] 7.4 New `tests/integration/policy/application-correction.test.ts`:
  - (a) AC-3.19: correct the message and switch to `third_party` → both stored; one
    `application.updated` whose payload is exactly `{ fields: ["messageRaw", "collectedFrom"] }`;
    assert that the serialised payload contains neither the old nor the new message, nor
    `third_party`/`data_subject`; both actor ids from the context;
  - (b) nothing changed → the row is byte-identical (every column), and the event count is
    unchanged;
  - (c) extra keys `source: "paste_parser"`, `state: "invited"`, `householdId` of another
    household → `source`, `state`, `round_id` and `household_id` unchanged; and a call naming
    another round of the same household with this application's id → `not_found`;
  - (d) a plain resident → `PermissionDeniedError`, unchanged;
  - (e) the household account → `ProfileRequiredError` (the no-query half is in task 2.6);
  - (f) a whitespace name → `ApplicationInputError` `name_required` / `applicantName`, unchanged;
  - (g) EC-3.6: switch back to `data_subject` → the capture's `application.created` event still
    has `collectedFrom: "third_party"`, and two `application.updated` events exist;
  - (h) a closed round (raw SQL sets `closed`) → the correction still succeeds (A2);
  - (i) **stale**: take the baseline, then a second correction changes the name, then submit a
    message change with the old baseline → `ApplicationUpdateError` `stale`; the second name stays;
    no new event;
  - (j) concurrency (pre-mortem H4): take the baseline; hold an uncommitted `FOR UPDATE` on the
    row; start `updateApplication` with `applicantName = X` (all else unchanged); assert it is
    pending; let the holder commit **only** `applicant_name = X`. Then assert that the correction
    returns `stale`, and that no `application.updated` event was written.
  
  **Breaks:**
  - put `collectedFrom`'s value into the payload → (a) fails;
  - skip the baseline check → (i) fails;
  - drop `.for("update")` → (j) reads the pre-commit row, passes the baseline, diffs against the
    old name and writes a spurious `application.updated {fields:["applicantName"]}`, so (j) fails
    on the event count.
- [x] 7.5 New `src/app/(org)/rounds/[id]/applications/[applicationId]/edit/actions.ts`:
  `updateApplicationAction`, in the capture action's shape (codes only; `redirect` outside the
  try; logs `{ code, sqlState, constraint }` or `{ code: "unexpected", name }` only; passes
  `baseline` through). On success it redirects to the detail with `?updated=1`.
- [x] 7.6 `capture-steps.ts`: `noticeDue(mode, thirdParty)`, per D5 (`firstStep` removed 2026-09-29: both modes open on the message), with
  unit tests in the existing capture-steps test file. **Break:** make `noticeDue` true for an
  application that was already third party → it fails.
- [x] 7.7 `capture-form.tsx`: the `mode` prop of D5 (`stored`, not `initial`, which stays the
  test-only prop):
  - the start step, the heading and the save label;
  - **every** notice branch on `noticeDue`: `decideSubmit`, the step-2 button label, the notice
    mount;
  - `deadlinePassed` from `capturedAt` in edit mode;
  - the action chosen by mode, with the hidden `applicationId` and `baseline`;
  - the `stale` sentence without a step change.
  
  O3's behaviour is unchanged in capture mode, and the existing O3 tests stay green.
- [x] 7.8 New `edit/page.tsx` + `edit/loading.tsx` (the heading-plus-form skeleton from
  `@/ui/skeletons`):
  - read via `getOrganisationApplication`;
  - `notFound()` on null;
  - the refusal text on `PermissionDeniedError`;
  - `applications.edit.permissionDenied` without `create_application`;
  - the pre-filled values (contacts as in D4), `stored.thirdParty`, `capturedAt`, and
    `applicationBaseline(row)`.
- [x] 7.9 A render test of the form in edit mode (extend the O3 render test file):
  - it starts on „Angaben" with the values pre-filled;
  - ticking third party on a data-subject application offers the notice step, with the date
    counted from `capturedAt` (a fixed date, two months back → the "verstrichen" line);
  - an already-third-party application goes straight to save;
  - the `baseline` hidden input is present.

## 8. Docs (design D10)

- [x] 8.1 `docs/backlog/requirements/F3-requirements.md`:
  - FR-3.24 and AC-3.21 as in D10, each with an *(amended 2026-09-29)* note. FR-3.24 also gains a
    sentence: *"A transition whose effects belong to a step not yet built is not executable until
    that step declares its rights and its operation (`domain/zustandsmaschinen.md` §3.1); in F3
    only `new ⇄ screened ⇄ invited`, the exits from those states and their reopenings are."*;
  - §8 item 3: a note that reversing is a third, moderator-only permission.
- [x] 8.2 `docs/domain/identity.md` §2.1: replace the paragraph starting „**Was ausdrücklich kein
  vergebbares Recht ist:**" with this text (German, for the human to read in the diff):

  > **Was ausdrücklich kein vergebbares Recht ist** *(geändert 2026-09-29, F3-Planung)*: Einen
  > Zustand **zurücknehmen** ist das Recht `reverse_application_state`. Es steht nur im
  > Rechtebündel der Rolle `moderator`, und die Datenbank verweigert es jeder anderen
  > Mitgliedschaft. So bleibt das ❌ der Rechtematrix für Bewohnende „nicht vergebbar", und
  > geprüft wird trotzdem, wie überall, das Recht und nie die Rolle. *(Vorher: „hängen an der Rolle
  > `moderator`, nicht an einem Recht" — eine Rollenprüfung neben den Rechten, die die Entscheidung
  > „Rollen sind nur Namen für Rechtebündel" ausschließt.)* `Application` **löschen** hängt, bis
  > die Handlöschung gebaut ist, weiter an der Rolle `moderator` und wird dann ebenso umgestellt.
  > `delete_data` bleibt unvergeben; es gehört zum Löschweg der Aufbewahrung und der
  > Betroffenenrechte (v0.2), nicht zur Handlöschung.

  Also:
  - add one line below the list of grantable values: „Nur im Rechtebündel einer Rolle, nie einzeln
    vergebbar: `reverse_application_state` (Moderation).";
  - in the same section, the sentence „vier feste Vorbelegungen je Rolle" names the moderator's
    five, with a dated note.
- [x] 8.3 `docs/domain/zustandsmaschinen.md` §3.1:
  - the backward table: in each row's "Wer darf", add `reverse_application_state`, with one dated
    note citing `03-PRD.md` §4.0.1 (precedence 3);
  - leave the forward rows' `confirm_appointment`/`manage_members` as they are (D6a: the feature
    that builds the step decides);
  - add one dated note (German) under the tables:
  
  > *(ergänzt 2026-09-29, F3)* **Ausführbar ist ein Übergang erst, wenn der Schritt gebaut ist,
  > der seine Wirkungen trägt.** Solange es keinen Termin, kein Zimmer-Angebot und kein
  > Einzugsprofil gibt, würde ein reiner Zustandswechsel diese Wirkungen überspringen (I-1 bis
  > I-5). v0.1 führt deshalb nur `new ⇄ screened ⇄ invited` aus, dazu die Abbrüche aus diesen
  > Zuständen und das Wiedereröffnen in sie. Jeder weitere Schritt schaltet seine Übergänge
  > zusammen mit seinen Wirkungen und seinen Rechten frei.
- [x] 8.4 `docs/review-log.md`:
  - move „F3: `transitionApplication`" to the closed rows, following the file's existing pattern,
    closed 2026-09-29, citing FR-3.24, `application-transition-guard.test.ts` and the
    authorization matrix;
  - add one register row for the decision that reversing is the moderator-only permission
    `reverse_application_state`, enforced by a CHECK (human decision: roles are permission sets,
    2026-09-28/29);
  - in the closed 2026-09-28 row „Wer Bewerbungen anlegt, ändert und löscht": a dated note that its
    „Zurücknehmen" half is superseded by that row;
  - add one open row, **„Übergänge je Schritt freischalten"** (D10): every later step declares
    its rows in the transition table, with its operation and its permissions, in the feature that
    builds it. The per-transition rights of `zustandsmaschinen.md` §3.1 (`confirm_appointment` for
    `invited ⇄ scheduled`, `manage_members` additionally for `moved_in → offer_made`) are decided
    there. v0.1 executes only `new ⇄ screened ⇄ invited`, the exits from those states, and their
    reopenings. The row also records three rules:
    - a reopening into a state is re-classified with that state's forward row;
    - the reopening *„Begründungsfeld"* arrives with F5;
    - the G-D9 test belongs to the `move_in_reversal` step.
- [x] 8.5 `node tools/check-refs.ts` → 0 failures. No frozen file is touched (Rule 4), and `docs/`
  gains no pointer into `openspec/` (Rule 7).

## 9. Apply 0027 to dev (human informed first)

- [x] 9.1 Tell the human in the report, **before applying**, that `0027` refuses appointments made
  by any branch still on the four-value constant. Stop and wait for the go if the human is
  reachable in the session; otherwise stop here and report.
- [x] 9.2 Apply `drizzle/0027_reverse_application_state.sql` to `flatmate-io-dev` (Supabase MCP
  `apply_migration`, never production). Then check the catalog:
  - `pg_get_constraintdef` of both constraints shows the five-value and the moderator-only literal;
  - `SELECT count(*) FROM membership WHERE revoked_at IS NULL AND role = 'moderator' AND NOT
    permissions @> ARRAY['reverse_application_state']` = 0;
  - the same for non-moderators holding it = 0.
  
  Run this as the owner through the MCP, not as `app_runtime`, which RLS would hide from. If any
  check fails, stop and report. Never infer that the statement simply has not been applied yet.

## 10. Verify and report

- [x] 10.1 `npm run verify` → green. Report the real totals (files/tests) and any flaky timeout
  by name, with a re-run of that file alone.
- [x] 10.2 `grep -rn "deleted_at\|deletedAt" src/modules/casting/repository.ts`: the new reads add
  no filter (D1, change 4 drops the column). Report the lines unchanged.
- [ ] 10.3 Report:
  - every file touched;
  - the diff of both guarded test files (setup only), and the stale break comment of task 2.2;
  - every break run and the failure it produced, plus the breaks that were argued rather than run;
  - anything not done, stated plainly.
  
  Stop before the browser walkthrough: it is done with the human.
