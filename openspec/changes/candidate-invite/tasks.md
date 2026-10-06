## 0. Before apply

- [x] 0.1 Bring `feat/candidate-invite` up to `main`. Done by the orchestrator on 2026-10-06: a
  fast-forward to `d05c61e` (PR #55 merged), with no commit of its own. `founding-link-moderator`
  (migration `0034`) has not merged yet. It shares `src/modules/casting/repository.ts`, `de.ts` and
  `authorization-matrix.test.ts`, so whichever PR merges second merges `main` and re-runs verify.
  No migration in this change. If one turns out to be needed, stop and ask: `0034` is taken and
  `0035` is reserved for `candidate-detail`.
- [x] 0.2 **No commits in this apply** (human, 2026-10-06: the human reviews the specs and the
  implementation first). Leave every change in the working tree. The orchestrator commits after the
  review.
- [x] 0.3 Fixtures for every test below:
  - a moderator comes from `setMemberRole` (`createTestModerator` and the existing helpers do this)
    or from a founding-link join, never from "prepare own profile, then claim via a bound link",
    which yields a plain resident;
  - the "may not invite" case is a plain resident from `claimPlainMember`;
  - permission is always read as stored, never as a role;
  - existing helpers to reuse: `setupPipeline`, `eventsOf`, `holdTransaction` and `settlesWithin`
    (`tests/helpers/pipeline.ts`), plus `tests/helpers/applications.ts`, `identity.ts` and
    `votes.ts`.
- [x] 0.4 Run `npm run verify` once before the first edit and record the test count.

## 1. Docs (in the working tree, not committed)

- [x] 1.1 `docs/review-log.md` §Offene-Punkte-Register, each row in the register's own shape with
  today's date:
  - close the row „`screened` ist in v0.1 verdeckt". Finding: no control to remove ever existed;
    the invite passes through `screened` in one transaction, and leftovers still display and stay
    invitable;
  - add a row „Einladen erzeugt zwei `application.state_changed`-Ereignisse statt
    `application.invited`". `docs/domain/zustandsmaschinen.md` names `application.invited`, and the
    code has never emitted it. Both events share one `occurred_at` (transaction time), so a future
    history view orders them by chaining `fromState`/`toState`, never by time. The domain table
    stays as it is. Owner: the history view's change;
  - add a row „Einladen bleibt `state_only`; der Text ist Pflicht der Oberfläche, nicht des
    generischen Pfads" (design D1). `transitions.ts` and the register row „Übergänge je Schritt
    freischalten" planned an `operation` row for F5's invite. It stays `state_only`, because an
    `operation` row would make the reopenings into `invited` unexecutable.
    `transitionApplication(…, "invited")` therefore still invites without text. The only caller
    that shows the text is `inviteApplication`'s UI. **Needs the human's confirmation at review**;
    owner: the change that builds O5's status actions;
  - add a row „P-4: Rückweg aus `invited` hat in v0.1 keine Oberfläche" (human decision
    2026-10-06). The repository allows `invited → screened`. Owner: the change that builds O5's
    status actions (reject, withdraw, reopen, un-invite).
- [x] 1.2 Run `node tools/check-refs.ts` and `node tools/check-refs.ts --scope docs`. Both must exit 0.

## 2. The invite operation (design D1, D2)

- [x] 2.1 `src/modules/casting/repository.ts`: add `"not_invitable"` to
  `ApplicationTransitionErrorCode`.
- [x] 2.2 Same file: `export async function inviteApplication(context, input: { roundId: string;
  applicationId: string }): Promise<{ alreadyInvited: boolean }>`, exactly in design D2's order:
  1. the profile check, then the id check (both before any query);
  2. `assertHasPermissionTx(…, "change_application_state")`, **before the row is read**, so a member
     without the permission learns nothing about the row's state;
  3. the row `FOR UPDATE` with the `id` + `round_id` + `household_id` predicates, lifecycle columns
     only;
  4. the state switch: `invited` is a no-op, `new` runs two `applyTransitionTx` calls (the second on
     the first's returned row), `screened` runs one, and any other state is `not_invitable`.

  The header comment states:
  - the lock order: membership FOR SHARE → application FOR UPDATE;
  - the writers it is serialised against (design "Every writer …"), in the style of
    `transitionApplication`'s comment;
  - that it reads no vote, no quorum and no round status;
  - that the text is the caller's UI duty (design D1).
- [x] 2.3 Same file: update `applyTransitionTx`'s header comment (around "It stays private here"):
  - the invite is the first caller that runs two rows in one transaction, from inside this file;
  - an export stays the job of the first operation that lives in another module.
- [x] 2.4 `tests/integration/policy/invite-application.test.ts` (new, teardown in `afterEach`). One
  case per scenario of spec `casting/invitation`, requirement 1:
  - **from `new`:**
    - the state is `invited`, and `state_changed_at` is set and later than before;
    - exactly two `application.state_changed` events (`eventsOf`), each with the moderator's
      `actorAccountId` and `actorProfileId`;
    - their payloads, as a set, are `{new→screened}` and `{screened→invited}`, and they chain: the
      `toState` of one equals the `fromState` of the other. Do **not** order by `occurred_at`: both
      share the transaction time;
    - every other application column is unchanged (compare the full row minus `state` and
      `state_changed_at`).
  - **from `screened`:** one event, `{screened→invited}`.
  - **already `invited`:** no event, `state_changed_at` unchanged, returns
    `{ alreadyInvited: true }`.
  - **`rejected_by_household` and `withdrawn`:** `not_invitable` (assert `err.code`), and nothing
    written.
  - **a plain resident:** `PermissionDeniedError` against **three** rows, one in `new`, one in
    `invited` and one in `rejected_by_household`. Never `{alreadyInvited}` and never
    `not_invitable`, which would be a state oracle. Nothing written.
  - **another household's id, and a matching id with another round's id:** `not_found` (assert the
    code).
  - **below quorum** (zero votes, and one vote with quorum 2): succeeds (AC-5.10).

  **Deliberate breaks:**
  - drop the `round_id` predicate → the other-round case fails;
  - make `invited` fall through to `applyTransitionTx` → the already-invited case fails
    (`InvalidTransitionError`);
  - skip the first edge from `new` → the two-events case fails;
  - move the permission check after the state switch → the plain-resident `invited`/`rejected`
    cases fail.

  Report each failure seen.
- [x] 2.5 Same file, concurrency, deterministic with the existing helpers:
  - **Two invites (a regression test of the row lock):**
    1. `holdTransaction` takes `SELECT … FOR UPDATE` on the application row (`new`) and keeps it
       open;
    2. start two real `inviteApplication` calls and assert that neither settles (`settlesWithin`);
    3. release the hold;
    4. assert one call returned `{alreadyInvited:false}` and the other `{alreadyInvited:true}`, the
       state is `invited`, and `eventsOf` returns exactly 2.

    **Deliberate break:** read the row without `FOR UPDATE` in `inviteApplication`. Then either both
    calls settle while the hold is open, or the event count is not 2.
  - **A vote racing the invite (an invariant guard, so named in the test title and comment):**
    1. hold the row `FOR UPDATE` as above;
    2. start `castVote` on the application;
    3. inside the hold, set the state to `invited` by the hold's own SQL, then commit;
    4. assert the vote is refused with `VoteError` code `not_votable` (assert the code) and that no
       vote row exists.

    It exercises the existing `vote_guard` (`drizzle/0028`), not new code. No break is possible
    without a migration, so say so in the comment.
- [x] 2.6 `tests/integration/policy/application-household-account-no-query.test.ts`: add
  `inviteApplication`. The household account is refused with `ProfileRequiredError`, and the
  `withSessionContext` spy is never called. **Deliberate break:** move the profile check after
  `withSessionContext` → the case fails.
- [x] 2.7 `tests/integration/policy/authorization-matrix.test.ts`:
  - add `"inviteApplication"` to `CASTING_CASE_NAMES`;
  - add its plain-resident case among the casting mutator cases, refused with
    `PermissionDeniedError` and nothing written;
  - add its household-account case beside `transitionApplication`'s;
  - add a positive moderator case beside the existing positive ones.

  Classification is exhaustive, so the run fails until the case exists. **Deliberate break:** remove
  the name from `CASTING_CASE_NAMES` → the classification test fails.

## 3. The inviting facts read (design D3)

- [x] 3.1 `src/modules/casting/repository.ts`: `export async function
  listInvitableApplications(context, roundId)`:
  - returns `null` for a profile-less session or a malformed id, before any query;
  - in one `withSessionContext`: `assertHasPermissionTx(…, "change_application_state")`, with the
    lock held through the read;
  - selects this round's and household's rows in `new`/`screened`, ordered by `created_at, id`;
  - returns `{ id, applicantName, collectedFrom, createdAt, categories }` per row, with
    `categories = noticeCategories(row)` (`./application-notice`, which stays string-free). The
    SELECT may read `message_raw`, `attributes` and the contacts to compute the categories; the
    returned objects carry none of them.

  The header comment cites design D3 (the permission mismatch with `listOrganisationApplications`,
  why not the voter port).
- [x] 3.2 `tests/integration/policy/invite-facts-visibility.test.ts` (new):
  - a moderator gets the round's `new` and `screened` rows only (no `invited` and no `rejected`
    row);
  - each object's key set is exactly the five keys;
  - a third-party row with a name and a phone gets `["name","phone"]`;
  - a plain resident gets `PermissionDeniedError`;
  - another round's rows never appear;
  - add the household account (`null`, no query) to
    `application-household-account-no-query.test.ts` beside 2.6's case.

  **Deliberate breaks:**
  - return `message_raw` → the key-set case fails;
  - drop the state filter → the invited-row case fails.
- [x] 3.3 `authorization-matrix.test.ts`: classify `listInvitableApplications` in
  `NOT_APPLICABLE_CASTING` as `"read; visibility tested in invite-facts-visibility.test.ts
  (design D3)"`.

## 4. The dialog, its text and the action (design D4)

All new UI files live in `src/app/(org)/rounds/[id]/applications/`, beside `notice.tsx`, whose
pieces they reuse. The scoreboard imports them across route groups, as it already does from
`../dashboard`. Design D4 records why.

- [x] 4.1 `src/ui/strings/de.ts`: add a `de.invite` block. Use the draft in design „Open
  Questions", and reuse the existing notice strings (`applicantText`, `thirdPartyText`,
  `deadlineLine`, `deadlinePassed`, `linkHint`, `nameFallback`) by reference, never copied.
  - `heading(name)`, `intro`;
  - `text({ name })`, the intro sentence that **leads** the Art. 13 composition;
  - `afterNotice`, the sentence that **follows** the Art. 14 notice and has no greeting of its own;
  - `confirm` („Eingeladen!") and `confirmHint`;
  - `open` („Einladen") and `openLabel(name)`;
  - one refusal sentence per action code (`not_found`, `not_invitable`, `not_allowed`,
    `no_session`, `failed`), in the „Sorry, …" du-tone.
- [x] 4.2 `notice.tsx`, a DRY extraction with unchanged behaviour:
  - export a pure `thirdPartyNoticeText({ name, household, categories })` (the seed
    `ThirdPartyNotice` builds today: the name fallback, the category words, `thirdPartyText`);
  - export a `DeadlineLine({ name, dateLabel, deadlinePassed })` component;
  - `ThirdPartyNotice` uses both.

  The existing `tests/unit/casting/third-party-notice.test.ts` (or whichever file renders
  `ThirdPartyNotice`) stays green unchanged.
- [x] 4.3 `invite-text.ts` (new, pure, no React):
  - `inviteText({ name, household, collectedFrom, categories })`:
    - for `data_subject`: `de.invite.text({ name })`, a blank line, then `applicantText`;
    - for `third_party`: `thirdPartyNoticeText(...)` (its own „Hey {Name}, …" greeting, verbatim
      Compliance §4.5), a blank line, then `de.invite.afterNotice`. There is never a second
      greeting;
  - `inviteDialogProps(row, household, now)`, which builds the dialog's props (`categories`, the
    deadline label and passed flag via `oneMonthAfter`) from a row. Both mount points use it.

  Unit test `tests/unit/casting/invite-text.test.ts`, with every string read from `de`:
  - `data_subject` starts with `de.invite.text` and ends with `applicantText`;
  - `third_party` starts with the §4.5 text carrying the given categories in words and ends with
    `afterNotice`;
  - the greeting appears exactly once in each;
  - neither contains the deadline sentence.

  **Deliberate break:** swap the two branches → the test fails.
- [x] 4.4 `invite-actions.ts` (`"use server"`; export only the async action and its types):
  `inviteApplicationAction(prev, formData)` for `useActionState`.
  - It reads only `roundId` and `applicationId` from the form, checks both with `isUuid`, and gets
    the session from `getCurrentSession`.
  - It calls `inviteApplication` and maps errors to codes:
    - `ApplicationTransitionError` → its code;
    - `PermissionDeniedError` → `not_allowed`;
    - `ProfileRequiredError` → `not_allowed`;
    - anything else → `failed`.
  - On `ok` it calls `revalidatePath("/casting")`, `revalidatePath(`/rounds/${roundId}`)` and
    `revalidatePath(`/rounds/${roundId}/applications/${applicationId}`)`, built only after the
    `isUuid` checks.
  - It returns codes only.
- [x] 4.5 `invite-dialog.tsx` (`"use client"`): `InviteDialog`, following `new-room-dialog.tsx`
  (native `<dialog className="dialog">`, × close). **The body mounts only once opened** (`opening >
  0`), so a closed row carries no text, no date and no numeral. A `defaultOpen` prop exists for
  tests only. Per design D4, it has:
  - a trigger: `type="button"` „Einladen" with `aria-label={openLabel(name)}`;
  - `NoticeTextPanel` seeded with `inviteText(...)`, outside the form;
  - for Art. 14, `DeadlineLine` beside the panel;
  - a `<form action>` with two hidden inputs and `<SubmitButton>` „Eingeladen!", plus
    `confirmHint`;
  - on `ok`, the dialog closes; on a refusal, the code's sentence shows with `role="alert"`;
  - no send, share or mailto element.
- [x] 4.6 `tests/unit/casting/invite-dialog.test.ts` (`renderToStaticMarkup`; mock
  `invite-actions` as `organisation-access.test.ts` mocks action modules):
  - closed (default): the markup holds the trigger and no textarea, no form and no digit;
  - `defaultOpen`: the textarea holds the seeded text, has no `name` attribute and is not inside
    the `<form>`;
  - `defaultOpen`: the form's only named fields are `roundId` and `applicationId`;
  - `defaultOpen`: no `mailto:`, „Senden" or „Teilen";
  - `defaultOpen`, Art. 14: the deadline line is outside the textarea;
  - `defaultOpen`: the confirm button is the shared `SubmitButton`.

  **Deliberate breaks:**
  - give the textarea `name="text"` → the test fails;
  - mount the body while closed → the closed case fails.

## 5. Wiring: the scoreboard and O5 (design D5, D6)

- [x] 5.1 `src/app/(resident)/casting/page.tsx`: when `ranking.kind === "board"`, call
  `listInvitableApplications(context, ranking.round.id)`.
  - Catch `PermissionDeniedError` → no invite.
  - When any row is `third_party`, also call `getHousehold(context)`.
  - Build `invite: ReadonlyMap<string, InviteDialogProps> | null` with `inviteDialogProps`,
    **filtered to the ids of `ranking.decided` rows only**, so facts for invited, hidden or own
    rows never sit in a prop.
  - Pass it to `RankingBoard`.

  The redirect and `getRanking` stay unchanged. A plain resident pays one refused permission read
  per board view (design D5).
- [x] 5.2 `src/app/(resident)/casting/ranking-board.tsx`:
  - `RankingBoard` takes an optional `invite` map;
  - `Group` takes `invite?: ReadonlyMap<…>`, passed for the `decided` group only, and renders
    `<InviteDialog …/>` in a row whose id is in the map;
  - the `invited` group and the hidden rows never get it.

  Update the file's header comment: the dialog is the one client island.
- [x] 5.3 Render tests in `tests/unit/casting/ranking-board.test.ts` (mock `invite-actions`). Cover
  the spec `deliberation/ranking` ADDED scenarios plus `casting/invitation` „Where the invitation is
  offered":
  - with an `invite` map, every decided scored and unscored row has the trigger, and no invited or
    hidden row has it;
  - without one (`null`), there is no trigger anywhere;
  - a decided row missing from the map has no trigger;
  - the existing digit assertions (C-5.1, unscored rows) still hold with a map, because closed
    dialogs carry no digits.

  **Deliberate break:** pass the map to the `invited` group too → the test fails.
- [x] 5.4 `src/app/(org)/rounds/[id]/applications/[applicationId]/page.tsx`:
  - generalise `holdsCreateApplication` to `holdsPermission(context, permission)`;
  - add a pure exported helper `showInvite(permitted, state)` in `invite-text.ts`: true iff
    permitted and the state is `new` or `screened`;
  - when it is true, render a small „Status" block with `InviteDialog` (props via
    `inviteDialogProps` from the already-read row and the household name, read for third-party as
    today);
  - keep the existing `Promise.all` shape.

  Also add `vi.mock` of `invite-actions` to `tests/integration/policy/organisation-access.test.ts`,
  beside its other action mocks.
- [x] 5.5 Unit test of `showInvite` (in `invite-text.test.ts`):
  - true for `new` and `screened` with the permission;
  - false for `invited` and `rejected_by_household`;
  - false without the permission.

  **Deliberate break:** drop the state condition → the invited case fails.
- [x] 5.6 No new `page.tsx`, so every touched page keeps its sibling `loading.tsx`. Confirm that
  `scripts/lint/pending-feedback.ts` is green.

## 6. Seed (design D9)

- [x] 6.1 `scripts/demo/seed-round.ts`: replace the two `transitionApplication` calls with one
  `inviteApplication(alexContext, { roundId: round.id, applicationId: applicationIds[6] })`.
  - Drop the now-unused import.
  - Update both comments that describe the invite path (around the application list, „passes
    through screened", and above `votesByApplication`, „moves new -> screened -> invited below").
  - Do not touch the applications or the vote table.

  No seed unit test exists.

## 7. Verify and hand back

- [x] 7.1 `npm run verify` green: eslint, tsc, the nine guardrail lints, check-refs and the full
  vitest run against `flatmate-io-dev`. Record the test count against 0.4's. A single timeout
  under load is re-run once, never fixed by raising a timeout.
- [ ] 7.2 Report to the orchestrator:
  - every deliberate break and the failure seen;
  - every file touched;
  - anything in design that turned out wrong.

  **No commit, no push.** Do NOT run the demo reset or the seed against dev; the human does the
  walkthrough reset.

## 8. Rework: no privacy notice in the invite text (human decision 2026-10-06, after apply)

The human, reviewing the applied change: the notice in the invite text is „overly pushy", it „is
already shown when adding an applicant", and informing the applicant is „the responsibility of the
household, not me". It is removed **completely**, also for Art. 14; the human declined even a quiet
hint. The proposal, design D3–D6 and the `casting/invitation` delta already say so. Still no commit.

- [x] 8.1 Remove the facts read: delete `listInvitableApplications` from
  `src/modules/casting/repository.ts` (and its `noticeCategories` import if now unused), delete
  `tests/integration/policy/invite-facts-visibility.test.ts`, and remove its classification from
  `authorization-matrix.test.ts` and its household-account case from
  `application-household-account-no-query.test.ts`.
- [x] 8.2 `src/app/holds-permission.ts` (new, server-only): `holdsPermission(context, permission:
  PermissionName): Promise<boolean>`. Move it out of O5's page unchanged in behaviour: it wraps
  `assertHasPermission`, maps `PermissionDeniedError` to `false` and rethrows anything else. O5's page
  imports it for both of its checks.
- [x] 8.3 `src/app/(resident)/casting/page.tsx`: drop `inviteFacts`, `getHousehold` and the map. When
  `ranking.kind === "board"`, set `canInvite = await holdsPermission(context,
  "change_application_state")` and pass it to `RankingBoard`.
- [x] 8.4 `ranking-board.tsx`: replace the `invite` map with `canInvite: boolean` (default `false`).
  `Group` takes `canInvite`, which is `true` only for the `decided` group, and renders `<InviteDialog
  roundId={ranking.round.id} applicationId={row.applicationId} applicantName={row.applicantName} />`
  on each of its rows. Update the header comment.
- [x] 8.5 `invite-text.ts`: keep only `inviteText(name: string): string` (`de.invite.text({ name })`,
  the name trimmed and falling back to `de.applications.notice.nameFallback`) and `showInvite`. Delete
  `InviteDialogProps`' notice fields, `inviteDialogProps` and the Art. 13/14 branches. Export
  `InviteDialogProps = { roundId; applicationId; applicantName }` from `invite-dialog.tsx`, or from
  `invite-text.ts`, wherever it reads more simply.
- [x] 8.6 `invite-dialog.tsx`: props are the three above. Remove `DeadlineLine` and every
  notice-related prop. Seed `NoticeTextPanel` with `inviteText(name)` and pass `linkHint={false}`.
- [x] 8.7 `notice.tsx`: restore it to `HEAD` (`git restore --source=HEAD -- <file>`; that removes
  `DeadlineLine` and the `thirdPartyNoticeText` import). Then add one
  optional prop to `NoticeTextPanel`: `linkHint?: boolean` (default `true`), which renders the
  `[Link]` paragraph only when true. Delete `notice-text.ts`. The existing notice tests stay
  unchanged and green.
- [x] 8.8 O5's page: drop `inviteDialogProps`; render `<InviteDialog roundId={id}
  applicationId={application.id} applicantName={application.applicantName} />` under
  `showInvite(...)`. Keep the `categories` local only if `ThirdPartyNotice` still needs it (it does);
  otherwise restore the original inline call.
- [x] 8.9 `de.ts`: remove `de.invite.afterNotice`. `de.invite.text` stays as the whole text; the
  human edits the wording after the walkthrough.
- [x] 8.10 Tests:
  - `invite-text.test.ts`: `inviteText` greets by name and contains neither `applicantText` nor any
    part of `thirdPartyText`, nor the deadline sentence; a blank name uses the fallback. Strings
    from `de`. **Deliberate break:** append `applicantText` → the test fails;
  - `invite-dialog.test.ts`: drop the Art. 14 case. Add „no `[Link]` hint in the dialog" (assert
    `de.applications.notice.linkHint` absent). Keep the textarea/form/no-send/closed-body cases.
    **Deliberate break:** pass `linkHint` true → the new case fails;
  - `ranking-board.test.ts`: rewrite the invite cases to `canInvite`. With `true`, every decided row
    has the trigger and no invited or hidden row has it; with `false`, none. **Deliberate break:**
    pass `canInvite` to the invited group → fails;
  - a unit test of `holdsPermission`, if a cheap one fits (mock `assertHasPermission`): `true`,
    `false` on `PermissionDeniedError`, rethrow otherwise;
  - the `organisation-access.test.ts` mock of `invite-actions` stays.
- [x] 8.11 Docs, each edit marked „(geändert 2026-10-06, Menschenentscheidung, F5 `candidate-invite`)"
  with the human's reason in one German sentence („Der Datenschutzhinweis steht schon bei der
  Erfassung und in der Bewerbung; im Einladungstext wäre er aufdringlich. Informieren ist Sache des
  Haushalts."). Edit only what names the notice in the invite text:
  - `docs/02-SRD.md` S-16 (l.~301): drop „(inkl. Datenschutzhinweis)", and check l.~323/352 for the
    same claim;
  - `docs/03-PRD.md` l.~273 (row 9) and the §4.1.6 criterion l.~790;
  - `docs/06-Compliance-Anhang.md` §4.3: the first paragraph and the sentence „Der Baustein bei
    „Eingeladen" (S-16) bleibt unverändert". State that the invite text carries no notice, and that the
    duty is served by the notices at capture and on the detail (and §4.5's text stays as the wording
    of those notices). Also check the table row at l.~97;
  - `docs/domain/zustandsmaschinen.md` l.50 (and l.70's „Copy-Paste-Text" if it still reads right);
  - `docs/screens/O-organisation.md` O5's core element („Copy-Paste-Text mit Datenschutzhinweis …
    in derselben Handlung, nicht optional"): the text is the invitation without a notice;
  - `docs/backlog/requirements/F5-requirements.md` FR-5.25 and AC-5.21 (V1.2 note, as V1.1 did);
  - `docs/backlog/stubs/EP-E-2-zusage-und-einzug.md` l.~25 („with a privacy notice");
  - `docs/review-log.md`: one register row recording the decision in „In diesem Sprint geschlossen"
    shape, and correct the row on `state_only` (it says the UI shows „den Text": still true, but
    without a notice).

  Do **not** touch the frozen `04`, `05` and `07`, nor `docs/00-Session-Brief.md` (historical) or
  `docs/_logs/`. No `docs/` file may point into `openspec/` (Rule 7). Run `node tools/check-refs.ts`
  and `--scope docs`; both exit 0.
- [x] 8.12 `npm run verify` green; report the count, every break seen failing, and `git status --short`.
  No commit.
