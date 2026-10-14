# Tasks

Gate before 1.1: the human has confirmed or edited the wording in design.md D5. Use the confirmed
text verbatim.

## 1. Pure ordering and step mapping (casting)

- [x] 1.1 In `src/modules/casting/task-precedence.ts`:
  - add the `OrganisationTaskKind` rank map (design D2) and `orderOrganisationTasks(tasks)`, reusing
    the existing key tie-break, not a copy;
  - add `roundStepOf(phase)`, which maps `phaseOf` results to `waiting | voting | invited`, clamping
  every later phase to `invited` (D3).

  Verify with new cases in `tests/unit/casting/task-precedence.test.ts` (create it if absent):
  - fixed order across all six kinds;
  - stable key tie-break;
  - same input gives the same output;
  - clamping of `voting_round_2`/`offer` to `invited`.

  Deliberate break: swap two ranks. The order test must fail. Report seeing it.

## 2. Casting read: per-kind gates (`listOrganisationTasks`)

- [x] 2.1 In `src/modules/casting/repository.ts`, extend `listOrganisationTasks`:
  - replace the early `manage_rounds` return with per-kind checks from one membership read;
  - add `add_room` (`manage_rooms`, no undeleted room), and drop `open_first_round` in that case;
  - return `rankingRoundIds` for open rounds when the caller holds `manage_rounds` and has a resident
    profile, `[]` otherwise;
  - keep the return type exported for the loader;
  - no nested `withSessionContext`.

  Verify in `tests/integration/policy/organisation-tasks.test.ts`:
  - zero rooms gives `add_room` and no `open_first_round`;
  - a room that can be cast for gives `open_first_round`;
  - a household account gets `add_room` but no round kinds and empty `rankingRoundIds`;
  - a plain resident gets nothing;
  - existing scenarios that asserted `open_first_round` with zero rooms are updated, citing the
    `start/next-action` delta.

  Deliberate break: remove the `manage_rooms` check. The plain-resident test must fail.

## 3. Identity read: setup tasks

- [x] 3.1 In `src/modules/identity/repository.ts`, add `listHouseholdSetupTasks(context)`:
  - `invite_flatmates` when the caller holds `manage_join_codes` and the household has no live
    resident membership;
  - `appoint_search_lead` when the caller holds `appoint_moderator` and no live membership of the
    household holds `manage_rounds`, decided via the stored permissions, never a role (R5);
  - it carries `foundingJoinPath` from `getLiveFoundingLinkPath` when that returns non-null;
  - one transaction, no nesting.

  Verify in a new `tests/integration/policy/household-setup-tasks.test.ts`:
  - a fresh household account gets both tasks, with the founding path;
  - after one resident claims, `invite_flatmates` is gone;
  - after appointing a moderator, `appoint_search_lead` is gone for everyone;
  - a non-resident moderator counts as a search lead;
  - a plain resident gets nothing;
  - a spent founding link gives no path.

  Deliberate break: check `role = 'moderator'` instead of the permission. The non-resident-moderator
  case or `role-reads.ts` must fail.
- [x] 3.2 Add `listHouseholdSetupTasks` to `NOT_APPLICABLE_IDENTITY` in
  `tests/integration/policy/authorization-matrix.test.ts`, with reason "read-only; visibility tested
  in household-setup-tasks.test.ts". Verify the matrix test passes, and fails without the entry.

## 4. App-level loader

- [x] 4.1 Create `src/app/(org)/organisation-tasks.ts`, exporting `loadOrganisationTasks(context)`
  (design D1):
  - `Promise.all` of the casting and identity reads;
  - then sequential `getRanking` per `rankingRoundIds`, adding `invite_candidates` when
    `kind === "board"` and `decided.scored.some(r => r.leading)`;
  - return `orderOrganisationTasks(...)`.

  Verify in a new `tests/integration/policy/organisation-loader.test.ts`:
  - a moderator who has voted, in a seeded round with a leading undecided row, gets
    `invite_candidates`;
  - a moderator who has not voted gets none;
  - after inviting the only highlighted row, none;
  - **G-D15:** a household account in a household with an open round and applications gets no
    `invite_candidates`, and the loader issues no ranking read (spy or `getRanking` not reached).

  Deliberate break: drop the `leading` filter. The "invited the highlighted row" case must fail.

## 5. O1 page rebuild

- [x] 5.1 Rebuild `src/app/(org)/organization/page.tsx` per design D4 (variant D with A's section tiles;
  the untracked prototype `src/app/design-preview/o1/page.tsx` is the visual reference, never
  imported), with server components beside it only as needed (e.g. `status-sentence.tsx` with the
  progress bar, `section-tiles.tsx`); the status sentence and progress caption are a pure helper
  with a unit test (each D4 sentence case incl. the household account's number-free one):
  - keep the layout-level session/access checks, the back link for residents and the
    `already_member` note;
  - the founding link stays a plain `<a>`;
  - counts come only from `getStartOverview` (profile sessions);
  - tiles come from `getNavigationAccess`;
  - „Alle Bewerbungen", „Weitere Runde eröffnen" (`manage_rounds` only) and other rounds sit in the
    closed „Mehr" `<details>`;
  - the founding offer stays standalone while live and `appoint_search_lead` is not open.

  Verify by `npm run lint` + `tsc`, and by the walkthrough in 11.2.
- [x] 5.2 Add the few component classes (`org-tile`, `org-progress`) to `src/app/globals.css` with existing
  tokens only, for light and dark. Reshape `src/app/(org)/organization/loading.tsx` to the new layout
  with `@/ui/skeletons`. Verify that `tsx scripts/lint/pending-feedback.ts` passes.
- [x] 5.3 Update `tests/unit/casting/organization-round-button.test.ts` to the new structure, so that
  "another round" is offered only with `manage_rounds` and is not the primary element. Deliberate
  break: render it unconditionally. The test must fail.

## 6. B1 bridge and strings

- [x] 6.1 In `src/app/(resident)/dashboard/page.tsx`, use `loadOrganisationTasks` instead of
  `listOrganisationTasks`. In `dashboard-view.ts`, keep the count logic and switch the empty text to
  the D5 bridge wording. Verify with `tests/unit/start/dashboard-view.test.ts`:
  - the empty bridge shows the new text and never „Alles erledigt – gut gemacht";
  - the count includes `add_room` and `invite_candidates`.

  Deliberate break: restore `allDone`. The test must fail.
- [x] 6.2 Add every D5 key to `src/ui/strings/de.ts` and its twin to `en.ts`, and remove keys that
  are no longer used (`allDone`, `noRoundYet*` if unused). Verify `tsc` (the `en.ts` type mirrors
  `de.ts`) and `grep` that no removed key is still referenced.

## 7. Rooms (folded in, design D7)

- [x] 7.1 In `src/app/(org)/rooms/page.tsx`, replace the status `<select>` and the „Status ändern"
  link with one `SubmitButton` form per target from `f1TargetStatusesFor(r.status)`, minus the
  current status, labelled per D7. Move „Entfernen" to its own line behind a native-`<dialog>`
  confirm, as a new `remove-room-form.tsx` modelled on `members/remove-member-form.tsx`. Add the D7
  strings to de/en.

  Verify in a new `tests/unit/casting/rooms-actions.test.ts`, or the nearest existing rooms render
  test:
  - a planned room offers exactly "mark as free";
  - an open room offers exactly pause and not-available;
  - the remove form submits only from inside the dialog.

  Deliberate break: offer all statuses. The planned-room case must fail.

## 8. Members (folded in, design D8)

- [x] 8.1 In `src/modules/identity/repository.ts`, add
  `.orderBy(residentProfile.createdAt, residentProfile.id)` to `getResidentList`. Verify in the
  members integration test (or a new case in it): three profiles created in turn come back in
  creation order on two reads. Deliberate break: order by `displayName`. The case must fail.
- [x] 8.2 In the members create-profile action (`src/app/(org)/members/actions.ts`): after
  `createResidentProfile`, when the caller holds `manage_join_codes`, call
  `issueJoinCode(..., { residentProfileId, maxUses: 1, validDays: <existing default> })` as a
  separate call, never inside the first call's transaction. On failure, keep the profile, log, and
  report it as created. Make sure the new profile's entry in `members-view.tsx` shows the link with
  `JoinCodeCopyButtons`.

  Verify in `tests/integration/policy/` (members suite):
  - the household account creating "Alex" yields one bound single-use link for Alex;
  - a caller without `manage_join_codes` yields none;
  - the profile survives when the issue step throws (stub the second call).

  Deliberate break: skip the permission check. The no-permission case must fail.
- [x] 8.3 In `members-view.tsx`, switch the generic `t.joinCode.warning` callout to `callout-info`
  with the `Info` icon. Leave the founding-link, removed-joiner and reset-link cautions untouched.
  Verify by render or text check, and by the walkthrough.

## 9. Capture copy (folded in, design D9)

- [x] 9.1 In `src/ui/strings/de.ts`, make `thirdPartyText` omit the „WG " prefix when the household
  name already starts with „WG" (word boundary, case-insensitive); twin in `en.ts`. In
  `capture-form.tsx`, label the third-party step-2 submit „Weiter zum Hinweis" / "Continue to the
  notice". Keep „Speichern" for data-subject captures, and leave the "[Link]" note alone.

  Verify in `tests/unit/casting/third-party-notice.test.ts`: "WG Gartenstraße" renders once as
  „von der WG Gartenstraße", and "Sonnenhaus" as „von der WG Sonnenhaus".

  Deliberate break: always prefix. The first case must fail.

## 10. Sign-in prefill and profile menu (folded in, design D10–D11)

- [x] 10.1 In `src/app/(auth)/sign-in/sign-in-form.tsx`, set a ref flag when the effect prefills the
  household code. `onFocus` selects the field's content while the flag is set; the first input
  event clears it. Verify with a jsdom unit test, or the existing sign-in form test: a prefilled
  field, then focus and type a full code, holds only the typed code. Deliberate break: remove the
  select. The test must fail (it appends).
- [x] 10.2 In `src/app/_frame/avatar-menu.tsx`, move `LanguageToggle` above the divider, next to the
  account settings link, and give „Abmelden" its own divider. Verify with a render test of the
  avatar menu: sign-out is the last item and a divider directly precedes it. Deliberate break:
  restore the old order. The test must fail.

## 11. Verification, walkthrough, plan

- [x] 11.1 Run `npm run verify` from the worktree. On a failure in a shared-dev-flaky suite, rerun
  that file alone before treating it as real (R10). Report the result.
- [ ] 11.2 Re-run the three persona walks against port 3001 with fresh throwaway households
  (`scripts/seed-persona-household.ts`, untracked, never committed): household account fresh,
  moderator pre-round, moderator mid-round, each a Sonnet agent with persona and goals only. Each
  must find its next step from O1 without guessing. Record clarity scores and remaining friction in
  `exploration.md` under "After".
- [ ] 11.3 Update the F3 plan file (Status, change 5 section, Log): what landed, the `deliberation`
  read used (`getRanking`, R3), the follow-up R8 (`identity/join` O20 wording), and cleanup of the
  `persona-%@example.test` households (SQL editor, human).

## 12. Fix round after the re-walk (design "Fix round", F1–F6)

- [x] 12.1 F1 in `task-precedence.ts` (or `status-sentence.ts` if the step model lives there): add a
  pure step-state helper (done / current / running / next) from `stateCounts`. Rename the step
  strings to the action labels. Add the running-step caption suffix and the new screen-reader
  states. Change `in_screening` to „in Abstimmung", with en twins. Update `progress-bar.tsx` to
  render running segments lighter.

  Verify with unit cases:
  - one invited and six new gives current = invite step, voting = running, and the caption carries
    „Abstimmen läuft noch";
  - all decided gives voting = done;
  - the household account (no counts) gives no running state.

  Deliberate break: mark earlier steps done unconditionally. The first case must fail.
- [x] 12.2 F2 in `organization/page.tsx`: with no task and an active round in the voting or invite
  step, a profile caller gets primary „Zum Casting" (`/casting`) and secondary „Bewerbung
  erfassen". In the collecting step, keep capture as primary. Verify with a unit test on the
  extracted decision helper. Deliberate break: always capture. The voting case must fail.
- [x] 12.3 F3 + F4 in `identity/repository.ts` `listHouseholdSetupTasks`:
  - add `invitationsOutstanding` on `invite_flatmates` (an unused, unexpired, undeleted
    non-founding link exists);
  - add `canAppointMember` on `appoint_search_lead`;
  - drop `appoint_search_lead` when neither the founding path nor an appointable member exists.

  Wire the copy into `organisation-task-view.ts` and `page.tsx`, with de/en strings.

  Verify in `household-setup-tasks.test.ts`:
  - a profile with an issued invitation, nobody joined, gives `invitationsOutstanding: true`;
  - a spent founding link with nobody joined gives no `appoint_search_lead`;
  - one joined plain member gives `canAppointMember: true`.

  Deliberate break: always set `canAppointMember: true`. The spent-link case must fail.
- [x] 12.4 F5 + F6: rename the setup step to „Suche starten". In `members-view.tsx`, update the
  helper note (only with `manage_join_codes`) and hide the issue button while a live bound
  invitation exists. Verify with render cases in `members-page-capabilities.test.ts`:
  - the issue button is absent beside a live bound invitation and present after it expires;
  - the note text is the new one.

  Deliberate break: always show the button. The test must fail.
- [x] 12.5 Run `npm run verify` again; same flaky-rerun rule as 11.1. Report the result.
- [x] 12.6 F7: in `src/app/_frame/menu-items.ts`, pick the people item by profile presence („Wer hier
  wohnt" with a profile, members list without). In `section-tiles.tsx`, drop the „Wer hier wohnt"
  tile and label the members tile „Mitgliederverwaltung" (de/en). Update the menu-items unit test
  (or add one): a moderator gets who-lives-here and no members item; the household account gets
  the members item. Update the round-button/section-tile tests accordingly. Deliberate break: keep
  the old `membersList` rule. The moderator case must fail.

## 13. Review fixes (design "Review fixes", R-1–R-7)

- [x] 13.1 R-1 + R-5 in `status-sentence.ts` (+ `page.tsx` passes `hasAnyRound`). Unit cases:
  - household with a running round gives step 1 done, the rest next, no caption;
  - household, setup done, no round gives step 4 current.

  Correct test :61 to the spec. Deliberate break: restore the old null mapping. The new case must
  fail.
- [x] 13.2 R-2 in `page.tsx`: pick `active` by the standing's round id when it is open. Extract the
  choice into a tiny pure helper with a unit test (two open rounds, standing on the second). Break:
  first open round always. The test must fail.
- [x] 13.3 R-3 + R-6 in `src/app/(org)/organisation-tasks.ts`: gate `getRanking` on an explicit-zero
  awaiting count from `getAwaitingVoteCounts`. Extend `organisation-loader.test.ts`:
  - a moderator with one vote still awaiting gets no `invite_candidates` and `getRanking` is not
    called for that round;
  - after voting, the task appears.

  Break: ignore the awaiting count. The first case must fail.
- [x] 13.4 R-4 in `page.tsx`: move the standalone founding offer out of „Mehr" into its own card
  below the tiles. Adjust the „Mehr" visibility condition. Render test: with appoint closed and the
  founding path live, the offer link is outside any `<details>`. Break: put it back in „Mehr". The
  test must fail.
- [x] 13.5 R-7 in `prefill-selection.ts` + `sign-in-form.tsx`: add a pointerdown flag. Unit case: a
  focus without a pointer, then a mouseup, means preventDefault is NOT called. Break: set
  `justFocused` on every focus. The case must fail.
- [x] 13.6 Run `npm run verify` (same flaky-rerun rule). Report.
