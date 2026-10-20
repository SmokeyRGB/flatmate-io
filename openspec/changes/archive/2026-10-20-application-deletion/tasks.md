# Tasks: application-deletion

Rules for the applier: never edit an applied migration (`drizzle/0000`–`0037`). Each test task
names a deliberate break. Make the break, see the test fail, revert it, and report that you saw it
fail. Do not commit, push or touch the database except where a task says so. A step the harness
refuses is the human's (group 7). After that hand-off, check the catalog and **stop** if it does
not show the result.

## 1. Permission and `deleted_at` in the code

- [x] 1.1 `src/modules/identity/schema.ts`: add `delete_application: { holders: ["moderator"] }`
  to `PERMISSIONS`, after `reverse_application_state`, with a one-line comment (FR-3.17, matrix
  row „`Application` löschen"). Do not edit anything that derives from it.
- [x] 1.2 `src/modules/casting/schema.ts`: remove `deletedAt` from `application`. Next to the table,
  add `export const APPLICATION_DEPENDENT_TABLES = ["vote"] as const;` with a comment: every table
  with an `application_id` column, deleted by `deleteApplication`, kept honest by
  `application-deletion-inventory.test.ts` (design D5).
- [x] 1.3 `data-inventory.yml`: remove `application.deleted_at`. `src/modules/casting/repository.ts`:
  remove `AND deleted_at IS NULL` from `getStartOverview`'s state-count SQL and from its comment
  („Excludes deleted applications"). Update the comment above `listOrganisationApplications`.
- [x] 1.4 `tests/integration/policy/start-overview.test.ts`: drop the `deletedAt` fixture option
  and its insert column, and the comment at line ~243.
  `tests/integration/policy/application-capture.test.ts:134`: drop `expect(row.deletedAt).toBeNull()`
  (tsc fails otherwise; pre-mortem 5).
  `tests/integration/deliberation/awaiting-vote-counts.test.ts`: reword the comment at line ~74
  (the column is gone). Then `grep -rn "deleted_at\|deletedAt" src tests scripts` must name no
  `application` use.

## 2. Migrations 0038 and 0039 (written, NOT applied)

- [x] 2.1 Run `npx drizzle-kit generate` to get the snapshot and journal for the schema change. Then
  split the result into two files (design D2):
  - `drizzle/0038_delete_application_permission.sql`: lock, report, declared, moderator-only,
    backfill, moderator floor;
  - `drizzle/0039_drop_application_deleted_at.sql`: the one `DROP COLUMN IF EXISTS`.
  Each file gets a header in the style of 0037: the order argument, re-runnability and the
  rollback note. The array literals are exactly the constants. Keep the quoted `"membership"`
  spelling throughout. Check that the journal and snapshots name both files in order, and that
  0039's snapshot no longer has `deleted_at`.
- [x] 2.2 `tests/unit/identity/role-permissions-constants.test.ts` (pre-mortem 3).
  - Freeze `MODERATOR_PERMISSIONS_AT_0037` (the eleven), `MODERATOR_ONLY_AT_0037` (the five) and
    `DECLARED_AT_0037` (the fourteen). Use them for every 0037 assertion: lines ~129
    (`toHaveLength(11)`), ~155–163 (the moderator-only list), ~176 (`toHaveLength(14)`), ~197
    (`literalsIn(moderator)`), ~202 (the strip) and ~210–212 (the report block).
  - Never edit 0037 to make the test pass.
  - Point the "live CHECKs hold exactly the constants" block at 0038 for the three constraints
    0038 re-adds: counts 12 and 15, and `delete_application` in the moderator-only list. Keep it
    on 0037 for the other constraints.
  - Extend the quoted-`"membership"` and no-`$1` assertions to 0038.
  - Add two assertions. 0038's backfill adds exactly `delete_application`, and only to live
    moderators. The statement indices run declared, then moderator-only, then backfill, then floor.
  - Break: move the backfill before the declared CHECK in 0038 → the order assertion fails.
- [x] 2.2b `tests/integration/raw-sql/delete-application-permission.test.ts` (pre-mortem 4), modelled
  on `role-permissions-contract.test.ts`.
  - Set up a scratch copy of `membership` with 0037's CHECKs. Seed a live moderator with the
    eleven, a revoked ex-moderator, a plain member and a household row.
  - Run 0038's membership statements against it twice, redirecting the quoted `"membership"`.
  - Assert: the moderator holds the twelve, sorted; every other row is byte-identical; the second
    run changes nothing.
  - Assert the refusals by constraint name: the floor refuses
    `array_remove(permissions, 'delete_application')` on the moderator, and the moderator-only
    CHECK refuses `delete_application` on the member.
  - Break: drop the backfill statement → the moderator assertion and the floor ADD both fail.
- [x] 2.3 Run `npx tsx scripts/lint/migration-shape.ts`: green on 0038 and 0039.

## 3. Audit: tombstone and redaction

- [x] 3.1 `src/modules/audit/repository.ts`: add `"application.deleted": []` to
  `PAYLOAD_ALLOWLIST` with a comment (G-D7, AC-3.18). Register `"application.created": ["source",
  "collectedFrom"]` in `REDACTABLE_KEYS`, and update the comment on the `application.created`
  allowlist entry. Extract the per-event-type nulling loop into one private helper taking a
  subject predicate. Keep `redactExpiredActivityEvents` (the retention predicate) on it, and add
  the exported `redactApplicationEventsTx(tx, applicationId)` (subject = that id, subject_type
  `application`). Both return the count.
- [x] 3.2 `tests/unit/audit/payload-allowlist.test.ts` (or its current sibling): `application.deleted`
  refuses every key. `redactApplicationEventsTx` nulls `source`/`collectedFrom` of that subject only
  and leaves `fromState`/`toState`/`fields` alone. The existing retention-redaction test still
  passes with the new registry entry. Update its expectations if it asserted a no-op for
  `application.created`, and say so. Break: remove the registry entry → the nulling assertion fails.

## 4. `deleteApplication`

- [ ] 4.0 `src/modules/casting/repository.ts`: `withLockedApplication` takes two new parameters, the
  permission to check and a not-found error factory (design D3, pre-mortem 11).
  `transitionApplication` and `inviteApplication` pass `change_application_state` and
  `ApplicationTransitionError("not_found")`, and their tests stay green unchanged.
- [ ] 4.1 `src/modules/casting/repository.ts`: `ApplicationDeletionErrorCode = "not_found"`,
  `ApplicationDeletionError`, and `deleteApplication(context, input: { roundId, applicationId })`
  exactly as design D3, steps 1–8, with steps 1–4 running through `withLockedApplication`. Include the LOCK ORDER comment and a "writers of the same
  state" comment. Replace the "deleteApplication (change 4) OBLIGATION" line in
  `transitionApplication`'s comment with a pointer to the function. Map SQL errors with
  `toApplicationWriteError` (never values in errors). `input?.`: a malformed call is `not_found`,
  never a TypeError.
- [ ] 4.2 `tests/integration/policy/authorization-matrix.test.ts` (pre-mortem 8).
  - Add `deleteApplication` to `CASTING_CASE_NAMES` (~:957).
  - Add three cases: a plain resident (`PermissionDeniedError`, row intact); the household column
    (`ProfileRequiredError`, ~:573–611); and a moderator-column success (~:614–624).
  - Add `redactApplicationEventsTx` to a "no caller outside casting/audit" source check, like the
    `insertCapturedApplicationTx` seam test (~:263).
  - Break: remove the permission check → the resident case fails.

## 5. Tests of the deletion (real Supabase, `afterEach` teardown)

- [ ] 5.1 `tests/integration/policy/application-deletion.test.ts`:
  - **AC-3.15**: a round with three applications. Snapshot every column of the other two and of
    the round. Delete one. The snapshots are deep-equal and the deleted row is gone. Break: delete
    by `round_id` instead of `id` → fails.
  - **AC-3.16**: four residents vote on application A, and two of them also vote on B. Delete A.
    Read under **each voter's own session**: no vote on A, the B votes are unchanged (every
    column). Break: empty `APPLICATION_DEPENDENT_TABLES` loop → fails.
  - **AC-3.18**: capture (`source`, `collectedFrom` set), correct, and transition A. Delete it.
    Exactly one `application.deleted` row exists with `payload = {}`, the subject id, and the
    actor account and profile. The `application.created` row has `source`/`collectedFrom` null
    and an unchanged `occurred_at`/actor. `application.updated`/`state_changed` are byte-identical.
    B's events are unchanged. Break: skip the redaction call → the created-row assertion fails.
    Break: put `applicantName` in the payload → `PayloadValidationError`.
  - **Any state**: an `invited` application is deletable.
  - **not_found**: a second delete of the same id, the wrong round, an unknown uuid, a malformed
    id, an application of another household. Each is `not_found` and nothing changes. After a
    delete, `transitionApplication` and `updateApplication` on it are `not_found`, and `castVote`
    is refused with its "application missing" code.
  - **Refusals**: the household account → `ProfileRequiredError`, a plain resident →
    `PermissionDeniedError`, and the row is intact in both cases. Assert the error class/code, not
    only the end state.
  - **Atomicity** is not tested separately: everything runs in one `withSessionContext`, and
    adding a failure seam to production code only for a test is not wanted. State that in the file.
- [ ] 5.2 Concurrency, in the same file, using `holdTransaction`/`settlesWithin`
  (tests/helpers/pipeline.ts):
  - **Regression test (pre-mortem 1).** In a voter's session, insert a vote on A without
    committing it, so that `vote_guard` holds A FOR SHARE. Start `deleteApplication` and assert it
    has not settled. Commit the holder. The delete resolves, and the voter's own read shows no vote
    on A. Break: remove the step-4 `.for("update")` → an orphaned vote remains and the test fails.
    Report seeing it.
  - **Invariant guard (label it so).** A holder locks A `FOR UPDATE` and changes its state without
    committing. The delete waits, then deletes A. The `DELETE` would wait on the holder's lock
    anyway, so removing the explicit lock cannot fail this test. Say so in the test.
- [ ] 5.3 Dropped (pre-mortem 7). The household account's raw `DELETE` and a raw `UPDATE` of a live
  event are already tested in
  `tests/integration/raw-sql/application-visibility-household-account.test.ts` and
  `tests/unit/audit/immutability.test.ts`, and this change adds no policy. Cite both in 5.1's
  header.
- [x] 5.4 Move `parseSchemaTables` from `tests/unit/lint/cleanup-inventory.test.ts` to
  `tests/helpers/schema-tables.ts` (pre-mortem 9). Both tests use it, and cleanup-inventory stays
  green. Then write `tests/unit/lint/application-deletion-inventory.test.ts` (design D5: a, b, c);
  it matches `uuid("application_id"`. Break:
  remove `"vote"` from the list → fails, naming `vote`. Add a bogus `"veto"` → fails, naming it.
- [ ] 5.5 `test/guarded.manifest.json`: G-D4 `implemented` with `testFiles` 5.1 and 5.4 (human decision
  2026-10-20, design D9), only after both pass and were seen failing.

## 6. UI

- [x] 6.1 `src/ui/strings/de.ts` and `en.ts`: the keys of design D6 (wording confirmed by the human), under `applications.delete`, plus the round page's
  `deleted` toast. Every `de.ts` key has its `en.ts` twin.
- [ ] 6.2 `src/app/(org)/rounds/[id]/applications/[applicationId]/delete-actions.ts`: the server
  action (design D6). `redirect` stays outside the try.
- [x] 6.3 `src/app/(org)/rounds/[id]/applications/[applicationId]/delete-dialog.tsx`: modelled on
  `rooms/remove-room-form.tsx`, with `useActionState` for the refusal, `SubmitButton` (lint
  `pending-feedback`), `aria-labelledby`, and an × close as in `invite-dialog.tsx`. No new page,
  so no `loading.tsx`.
- [ ] 6.4 `[applicationId]/page.tsx`: read `holdsPermission(context, "delete_application")` in the
  existing `Promise.all`. Show the dialog in the actions row (that row renders when any of the
  three holds).
  - `src/app/(org)/rounds/[id]/page.tsx`: `searchParams` gains `deleted`; show
    `SavedToast param="deleted"`.
  - `src/ui/saved-toast.tsx`: add `"deleted"` to the `param` union.
  - The dialog's cancel button is `type="button"`.
- [x] 6.5 `tests/unit/casting/delete-dialog.test.ts` (`.test.ts` + `createElement`, since
  `vitest.config.ts` collects only `*.test.ts`; copy the `vi.mock`s of
  `invite-dialog.test.ts:10-13`): renders with the name in the heading, the body
  text, a destructive confirm and a cancel; the form posts only `roundId` and `applicationId`.
  Break: drop the name from the heading → fails.

## 7. Database hand-off (human) and checks

- [ ] 7.1 Run `npm run verify` locally, excluding the DB-dependent suites that need 0038 (anything
  that stores the moderator set). Say which suites were excluded. `npm test` alone is not enough.
- [ ] 7.2 **Human:** agree to `git push --no-verify` for this PR until 0038 is on dev (design D8).
- [ ] 7.3 Open the PR. CI's fresh-stack `verify` must be green (it builds from `drizzle/`,
  including 0038 and 0039).
- [ ] 7.4 **Human:** after the reviews and a fresh `git branch -a --no-merged origin/main` check,
  apply `drizzle/0038_delete_application_permission.sql` (0038 only) in the Supabase SQL editor on `flatmate-io-dev`,
  and report the NOTICE counts.
- [ ] 7.5 Applier, read-only catalog check: the three constraints contain `delete_application`,
  and every live moderator holds it. If any check
  fails, **stop** and report; do not infer "not yet applied".
- [ ] 7.6 Run `npm run verify` alone on dev: all green, including group 5. Then the human merges at
  once.
- [ ] 7.7 **Human, after the merge:** apply `drizzle/0039_drop_application_deleted_at.sql` on dev.
  Applier: check that `application.deleted_at` is gone from the catalog, and stop if it is still
  there. Then run `npm run verify` on main; it must be green.

## 8. Docs and record

- [x] 8.1 `docs/review-log.md` §Offene-Punkte-Register: the three rows of design D10, in the
  register's existing format. Run `node tools/check-refs.ts`: green.
- [ ] 8.2 Browser walkthrough on the dev server (the human signs in): delete from the detail,
  cancel, refusal text, toast, and dark mode. Take a screenshot.
