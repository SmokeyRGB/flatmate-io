# Tasks

> Order matters: migrations 0023/0024 reach dev only in group 9, after everything else is written.
> Until then, tests that need the new columns can't run against dev. Run `npx tsc --noEmit`, `npm
> run lint` and the pure unit tests as you go, and the full `npm run verify` in group 10.
> **Hard floor:** G-C, G-D (no `expect` line in a guarded test file changes), G-L, G-G1/G-G3.

## 1. Schema and migrations

- [x] 1.1 `src/modules/casting/schema.ts`:
  - add the `applicationSourceEnum` (`application_source`: `manual_form`, `paste_parser`,
    `availability_link`, `portal_import`) and the `applicationCollectedFromEnum`
    (`application_collected_from`: `data_subject`, `third_party`), cited to Compliance §4.4;
  - add the nine columns of design D1 step 4, with **no `.default()`** on any of them;
  - make `roundId` `.notNull()`;
  - add the seven CHECKs of D1 step 6 via `check()`. The attributes CHECK's comment says plainly
    that per-element limits are repository-only.

  Also add a comment on `castingRound.status`: every writer of it takes `FOR UPDATE` (D4). Leave
  `deletedAt` untouched (change 4).
- [x] 1.2 `src/modules/identity/schema.ts` (D2/D3):
  - export the plain constants `HOUSEHOLD_PERMISSIONS` (`manage_rooms`, `manage_settings`,
    **not** `close_round`, D13), `RESIDENT_PERMISSIONS` (empty, F4 adds `vote`) and
    `MODERATOR_PERMISSIONS` (`manage_rooms`, `close_round`, `create_application`,
    `change_application_state`), commented per D3 (roles are names for these sets);
  - add `membership_admin_has_no_profile` via `check()`, citing ADR-013 and §2.1;
  - add the four role CHECKs of D2 step 3 via `check()` (`…_moderator_…`, `…_household_admin_…`,
    `…_resident_…`, `membership_revoked_holds_nothing`), each **built from its constant with
    `sql.raw`** (D2), with a comment that a later permission needs
    the constant, a backfill and the CHECK in one change.
- [x] 1.3 Generate one migration per concern, **in this order** (pre-mortem 10): finish 1.1 (casting
  only), run `npx drizzle-kit generate`, and rename the result to `drizzle/0023_application_capture.sql`
  (tag, snapshot and journal consistent). Only then do 1.2 (identity), run `generate` again, and name
  the result `drizzle/0024_membership_role_integrity.sql`. After each run, grep the new file for `$`
  outside the `DO $$` blocks: a `$1` means a `check()` interpolated a value (D1), so fix it with
  `sql.raw` and regenerate.
- [x] 1.4 Hand-edit `0023` to D1's exact order. Keep a header comment arguing the order against the
  constraints live at each statement:
  - `LOCK TABLE`;
  - the `DO` precondition, which raises only if `applicant_name` is absent **and** rows exist;
  - the `DO … EXCEPTION WHEN duplicate_object` type creations;
  - `ADD COLUMN IF NOT EXISTS` ×9;
  - `SET NOT NULL`;
  - `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` ×8 (D1 step 6, with the `not_blank` CHECK and
    the `CASE` form of the attributes CHECK);
  - last, the D12 pairing trigger: `CREATE OR REPLACE FUNCTION application_round_same_household()
    RETURNS trigger` (plpgsql, **not** `SECURITY DEFINER`, `SET search_path = pg_catalog, public`,
    body exactly as in D12, starting with the NULL guard), then `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER … BEFORE INSERT OR
    UPDATE OF round_id, household_id ON application FOR EACH ROW`. drizzle-kit does not generate
    triggers, so this part is hand-written. Add a `schema.ts` comment on `application.roundId`
    pointing at it, and one on `castingRound` saying no path may delete a round or change its
    `household_id` without considering the applications pointing at it.
- [x] 1.5 Hand-edit `0024` to D2's order: `LOCK TABLE membership IN SHARE ROW EXCLUSIVE MODE`; the
  admin/profile CHECK; the four idempotent **backfills** (2a revoked, 2b moderator, 2c household,
  2d resident); then the four role CHECKs (each `DROP … IF EXISTS` + `ADD`). The header
  argues why the lock comes first and why the backfills precede the CHECKs. Add a unit test,
  `tests/unit/identity/role-permissions-constants.test.ts`: each array literal in `0024` equals its
  constant, compared as a sorted set, and the file contains no `$1`. **Break:** add a value to one
  constant only, and it fails.
- [x] 1.6 **Read both files as a human would run them.** Check each statement against Postgres:
  - `DO` blocks are dollar-quoted;
  - a `CREATE TYPE` in `DO` needs its `EXCEPTION` clause;
  - `char_length(btrim(…))` and `~ '[^[:space:]]'`;
  - the attributes CHECK uses `CASE`, because `jsonb_array_length` on a non-array raises `22023`
    and `AND` has no guaranteed order;
  - the trigger's NULL guard comes first;
  - no `$1` anywhere.

  Then run `npx tsx scripts/lint/migration-shape.ts` (or `npm run verify`'s lint step) and confirm
  it is green for 0023/0024.
- [x] 1.7 `data-inventory.yml` → `tables.application.columns` gains the nine entries (D1 step 4):
  - 🔴 with `purpose`, `legal_basis` and `retention`, from Compliance §6.2, for `applicant_name`
    (6b), `age` (6b, 6f), `contact_email`/`contact_phone`/`contact_other` (6b), `message_raw` (6b;
    the purpose names the Art.-9 risk, C-3.4) and `attributes` (6b);
  - ⚙️ with `purpose` for `source` (the technical path, 6f) and `collected_from` (the legal bearer
    of the Art. 13/14 choice, 6c);
  - retention „180 Tage nach Rundenabschluss (Compliance §5.3)" for every 🔴.

  `membership` gains no column. Verify with `npx tsx scripts/lint/data-inventory.ts`.
- [x] 1.8 `grep -rn "application" drizzle/*.sql | grep -i "security definer"` → confirm no
  `SECURITY DEFINER` function touches `application` (the D9 row). Record the result in the report.

## 2. Permissions (identity)

- [x] 2.1 `src/modules/identity/repository.ts` (D3):
  - delete `MODERATOR_DEFAULT_PERMISSIONS` **and** the `household_admin` early return, i.e. both
    role shortcuts;
  - add `export function membershipHoldsPermission(row, permission): boolean` =
    `row.permissions.includes(permission)`. No role is read;
  - route `assertHasPermission` through it;
  - rewrite the comment: a role is a fixed set of stored permissions (both human remarks of
    2026-09-28, quoted), and 0024's CHECKs make a membership without its set a refused write.
- [x] 2.2 Every writer of `role`, `permissions`, `is_resident` or `revoked_at` keeps them consistent,
  in one statement on one row, **computed in SQL inside that `UPDATE`** (D3):
  - `src/modules/identity/auth.ts`: `registerHousehold` inserts `HOUSEHOLD_PERMISSIONS`, and claim
    and join insert `RESIDENT_PERMISSIONS`;
  - `src/modules/identity/repository.ts`:
    - `setMemberRole`: → moderator adds the moderator set; → member removes it and re-adds the
      resident set for a resident;
    - `revokeMembershipForProfileTx`: the existing `UPDATE` also sets `role = 'member'` and
      `permissions = '{}'`, and keeps its `isNull(revokedAt)` guard;
    - `reactivateMember`: sets `permissions` to the resident set, as a member.

  The events are unchanged. Rewrite the stale comment above the old set (pre-mortem 7). Then search
  `src/modules` and `scripts` for every other writer of those four columns, and paste the list into
  the report.
- [x] 2.3 Same file: add `export async function assertHasPermissionTx(tx, context, permission)` and
  `assertHoldsAnyPermissionTx(tx, context, permissions[])` (D4 a). Each does `SELECT membership
  WHERE account_id = context.accountId AND revoked_at IS NULL FOR SHARE`, and refuses with
  `PermissionDeniedError` when there is no row, when `resident_profile_id` ≠ `context.profileId`,
  or when `membershipHoldsPermission` is false for every listed permission.
- [x] 2.4 `tests/integration/policy/authorization-matrix.test.ts`: add the new identity exports to
  `NOT_APPLICABLE_IDENTITY`:
  - `membershipHoldsPermission`: "pure helper";
  - both Tx asserts: "assertion helper — the in-transaction permission primitive".

  `setMemberRole` keeps its existing case.
- [x] 2.5 Move the two tests that set `role: "moderator"` directly
  (`tests/integration/policy/join-code-isolation.test.ts`,
  `tests/integration/policy/resident-list-access.test.ts`) to `setMemberRole`, and give the
  `household_admin` row that `tests/unit/identity/provider-user-compensation.test.ts` inserts
  `HOUSEHOLD_PERMISSIONS`. These are setup changes only, and no `expect` line may change
  (show the grep as in 5.2). Without them, 0024's CHECKs refuse their setup. Then run the whole
  suite once and look for any other setup the CHECKs refuse; fix only setup, and list each file.
- [x] 2.6 New test `tests/integration/policy/moderator-permissions.test.ts`:
  - after `setMemberRole(…, "moderator")` the stored array holds all four, and the moderator may
    open a round, manage a room and capture;
  - after `setMemberRole(…, "member")` the array holds none of the four, and each action is
    refused;
  - a member holds nothing, and a member granted `create_application` holds it with its role still
    `member`;
  - a moderator not granted `manage_settings` is refused a settings change (⬜ stays a grant);
  - `membershipHoldsPermission({ role: "moderator", permissions: [], revokedAt: null },
    "close_round")` and the same for `household_admin` / `manage_settings` are both `false`, because
    the role alone grants nothing;
  - a moderator marked moved out: its row is revoked, `role = 'member'`, `permissions = []`. After
    `reactivateMember` it holds the resident set as a member, and `close_round` is refused until it
    is appointed again;
  - the same after a hard removal (the removal tier);
  - a newly registered household's administering membership stores exactly
    `HOUSEHOLD_PERMISSIONS`, and the household account is refused `create_application` by
    `assertHasPermission` (not only by the profile check).

  **Break:** put either role shortcut back into `membershipHoldsPermission`, and the matching
  case fails.
  Remove the union from `setMemberRole`, and the first case fails (the CHECK refuses the promotion
  write).
- [x] 2.7 New raw-sql test `tests/integration/raw-sql/membership-role-integrity.test.ts`, as
  `app_runtime` in a session of the household. Each of these fails with `23514` and its constraint
  name:
  - an `UPDATE` giving the admin membership a profile (`membership_admin_has_no_profile`);
  - an `UPDATE` removing `create_application` from a moderator's permissions;
  - an `UPDATE` setting `role = 'moderator'` on a member without adding the permissions (both
    `membership_moderator_holds_role_permissions`);
  - an `UPDATE` removing `manage_settings` from the administering membership, and one adding
    `close_round` to it (both `membership_household_admin_holds_role_permissions`);
  - an `UPDATE` giving a revoked membership a permission, or the moderator role
    (`membership_revoked_holds_nothing`).

  Registration still produces an admin membership with a null profile. **Break:** argue it in
  the test's comment, as D11 says, unless a disposable stack is available. Report which.
- [x] 2.8 `tests/integration/policy/founding-resident-permission.test.ts` and
  `join-by-link.test.ts` assert `permissions` equals `[]` for new memberships. That still holds
  (`RESIDENT_PERMISSIONS` is empty), so they stay unchanged and must stay green. Confirm in the
  report. Search the member-removal, move-out and reactivation tests for any assertion that a
  moved-out or reactivated membership keeps `role = 'moderator'`. Each such assertion states
  behaviour D3 deliberately changes: rewrite it, and list it like 2b.3. If it is in a guarded file,
  stop.

## 2b. The household account stops running rounds (D13)

- [x] 2b.1 `tests/helpers/identity.ts`: add `createTestModerator(hh)`, which claims a synthetic
  profile, appoints it through `setMemberRole(…, "moderator")`, and returns
  `{ context, accountId, profileId }`. It registers the new Auth account with the household's own
  cleanup, so `hh.cleanup()` deletes it. Where a household is not a `TestHousehold`, the caller
  deletes it in `afterEach` (pre-mortem 13).
- [x] 2b.2 Find every test that creates, opens or adds to a round with the household context
  (`grep -rln "createRound\|openRound\|createAndOpenRound\|addResidentToRound" tests`, then read
  each file's call sites). Move that setup to `createTestModerator`. For the two guarded G-D15 files
  (`tests/integration/policy/round-visibility-household-account.test.ts`,
  `tests/integration/raw-sql/round-visibility-household-account.test.ts`), it is **setup only**:
  paste the `expect`-line grep of 5.2. It must be empty.
  **Reads too, not only setup (pre-mortem 5):** every read on the household context that only a
  `close_round` holder gets (`listOrganisationTasks`, the start bridge) moves to the moderator's
  context. At least `organisation-tasks.test.ts` cases a (line ~53), b (~69-71) and c (~80) do,
  otherwise (a) fails and (b)/(c) pass vacuously. Sweep `start-overview` and `procedure-lock` for
  the same pattern. Add one explicit case: the household account gets `[]` from
  `listOrganisationTasks`. **Break:** give the household account `close_round` back, and that case
  fails.
- [x] 2b.3 A test asserting that the household account **may** create, open or close a round, or
  add a participant, is rewritten to assert the refusal (`PermissionDeniedError`). List each such
  test in the report under its own heading, with the old and the new assertion and the PRD
  §4.0.1 line quoted. **None of them may be in a guarded file.** If one is, stop and report it.
- [x] 2b.4 `src/app/(org)/organization/page.tsx`: render the „Runde eröffnen" button and link only
  for a session holding `close_round` (try/catch around `assertHasPermission`). Search `src/app`
  for any other link to `/rounds/new` or to a round action shown to the household account, and
  apply the same rule. Check the household account's O20 landing and the O1 copy in `de.ts` for
  text promising round creation, and list what changed. Render test
  `tests/unit/casting/organization-round-button.test.ts`: the button is absent for the household
  account and present for a moderator. **Break:** drop the condition, and it fails.
- [x] 2b.5 `scripts/seed-demo-household.ts`: create and open the demo round as Alex (moderator
  context), not as the household account; the rooms stay with the household account.
- [x] 2b.6a `docs/domain/identity.md` §2.1: amend the `close_round` note from „Vorbelegt bei
  `household_admin` und `moderator`." to „Vorbelegt bei `moderator`", in German, citing `03-PRD.md`
  §4.0.1 and S-50/U-20 („der Haushalts-Account eröffnet und schließt keine Runde"). Do it in the same
  commit as 8.3. The human reviews the wording (pre-mortem 7). Also update the comment in
  `tests/integration/policy/founding-resident-permission.test.ts` (~lines 85-86) that describes
  `close_round` passing via `MODERATOR_DEFAULT_PERMISSIONS` with an empty array. That is a comment
  only; no `expect` changes (pre-mortem 19).
- [x] 2b.6 Search `openspec/specs/` for any sentence saying the household account holds
  `close_round` or runs rounds, and list it in the report; the archive step updates it. Add one
  closed row to `docs/review-log.md` §Offene-Punkte-Register (German): the household account held
  `close_round` implicitly, against `03-PRD.md` §4.0.1 (S-50/U-20); closed by the stored role
  sets.

## 3. Input parsing and notice helpers (pure)

- [x] 3.1 New `src/modules/casting/application-input.ts` (the rules of D4 step 3c):
  - `parseApplicationInput(raw)` → a parsed value, or throws `ApplicationInputError { code, field }`
    with the codes of D4;
  - the limits as exported constants, cited to C-3.14;
  - code-point counting via `[...s].length`;
  - it trims the name, maps empty → `null`, drops empty attribute rows, maps an empty list → `null`;
  - it rejects a missing or unknown `collectedFrom`;
  - it requires one non-whitespace character in the name (matching the `not_blank` CHECK);
  - it rejects `\u0000` and lone surrogates in every text field (`invalid_characters`).

  No error message contains an input value.
- [x] 3.2 New `src/modules/casting/application-notice.ts`: `noticeCategories(fields)` in the fixed
  order of D6, and `oneMonthAfter(date)` → a Berlin calendar date clamped to the month end (A2).
  No DB import.
- [x] 3.3 Unit tests `tests/unit/casting/application-input.test.ts`:
  - name: empty / whitespace → `name_required`;
  - 200 / 201 code points at the name limit;
  - 4000 single-code-point emoji accepted, 4001 → `too_long` with field `messageRaw`;
  - age: −1, 151 and 1.5 → `invalid_age`;
  - 11 attributes → `too_many_attributes`;
  - a label over 60 or a value over 500 → `invalid_attribute`;
  - a missing `collectedFrom` → `collected_from_required`;
  - empty optionals → `null`, never `''`;
  - no error message contains the input;
  - a name of tabs / NBSP only → `name_required`;
  - `\u0000` and a lone `\uD800` in the message → `invalid_characters`.

  **Break:** count with `.length` (UTF-16), and the emoji case fails.
- [x] 3.4 Unit tests `tests/unit/casting/application-notice.test.ts`:
  - categories for name-only, for name + phone, and for all fields;
  - `oneMonthAfter` for 2026-01-31 → 2026-02-28, 2028-01-31 → 2028-02-29, 2026-03-15 → 2026-04-15;
  - a UTC instant late on 31 Jan that is already 1 Feb in Berlin → 1 Mar.

  **Break:** use naive `setMonth(+1)`, and the Jan-31 case fails.

## 4. Repository and audit

- [x] 4.1 `src/modules/audit/repository.ts`: register `"application.created": ["source",
  "collectedFrom"]`, with a comment (G-D7: enum values only). Do **not** add a `REDACTABLE_KEYS`
  entry (D7).
- [x] 4.2 `src/modules/casting/repository.ts`: add `ApplicationCaptureError` (codes `round_not_found`,
  `round_not_open`). Re-export `ApplicationInputError` for callers, or import it from
  `application-input.ts` directly; pick one and use it consistently.
- [x] 4.3 Same file: `captureApplication(context, input)`, exactly D4 steps 1–3 (profile first,
  `isUuid`, one transaction: membership FOR SHARE → round FOR SHARE with the household predicate →
  parse → wrapped insert with the system-set `state`/`source` and actor ids from `context` →
  event). Add `ApplicationWriteError` (D4, "No value leaves in an error").
  The comment states the lock order and what serializes each check. **No `actor` parameter.**
- [x] 4.4 Same file: `getOrganisationApplication(context, roundId, applicationId)` per D5, with the
  `null`-before-query rule for a profile-less session. Comment: `getApplication` is its sibling,
  which change 3 folds in.
- [x] 4.5 `tests/integration/policy/authorization-matrix.test.ts`:
  - `captureApplication` gets a refusal case: a plain resident's own context → `PermissionDeniedError`,
    and no row is written;
  - `getOrganisationApplication` goes into `NOT_APPLICABLE_CASTING` as "read-only; visibility tested in
    organisation-application-visibility.test.ts";
  - `transitionApplication` stays `KNOWN_OPEN` (change 3). Confirm its "no route caller" test
    still passes, because no `src/app` file may reference it.

## 5. Test fixture and the migration of existing insert sites

- [x] 5.1 New `tests/helpers/applications.ts` per D8 (`syntheticApplication`, `insertTestRound`, the
  raw-SQL column/values fragment). The data is synthetic only (G-B1).
- [x] 5.2 Migrate the 7 files in D8's table to the fixture: **setup lines only.** Every raw-SQL
  insert that tests a *refusal* points at **a real round of the same household**. Otherwise D12's
  BEFORE trigger answers `23503` before RLS answers `42501` (D8's order). Its assertion stays exactly
  as it is. If an existing refusal assertion is looser than "the RLS error", leave it, list it in the
  report, and don't tighten it in this change. For each of the four guarded files (G-D3, G-D7,
  G-D8, G-D15), paste
  `git diff -U0 main -- <file> | grep -E '^[-+].*\b(expect|toThrow|rejects)\b'` into the report.
  It must be empty. That is the G-G1 evidence the human reviews.
- [x] 5.3 `grep -rn "insert(application\|INTO application" tests src scripts` returns only fixture
  users, `captureApplication` and the seed. Paste the output into the report.

## 6. Capture tests (real dev DB, synthetic data)

All in `tests/integration/policy/application-capture.test.ts` unless named otherwise. Teardown in
`afterEach`.

- [x] 6.1 AC-3.1/3.3: a moderator captures with a name only. Assert **every written column**:
  - `state = 'new'`, `source = 'manual_form'`, `collected_from = 'data_subject'`;
  - the optionals `NULL`;
  - `round_id`, `household_id` and both `created_by_*` from the session;
  - `state_changed_at`/`created_at` set, `retention_until` null, `became_resident_id` null.

  **Break:** make the repository insert `source` from input, and this fails once the test passes
  `source: "paste_parser"` in the raw input.
- [x] 6.2 AC-3.7 via raw SQL: read `collected_from` with `SELECT collected_from, collected_from IS
  NULL`, and assert `'data_subject'` / `false`. **Break:** add `.default("data_subject")` on a
  scratch branch and drop the explicit value in the repository. Report that the DB-default test
  6.9 catches it, and why this one alone would not.
- [x] 6.3 AC-3.11: two captures, `third_party` and `data_subject`, both `manual_form`, each stored as
  chosen.
- [x] 6.4 AC-3.2/EC-3.10: an empty name and a whitespace name → `ApplicationInputError` with
  `name_required`, and 0 rows and 0 events. EC-3.1/3.11: two rows with the same name are both
  created.
- [x] 6.5 AC-3.5, repository side:
  - member → `PermissionDeniedError`;
  - a member granted `create_application` succeeds;
  - a household-account context → `ProfileRequiredError`, with **a spy proving `withSessionContext`
    was never called** (the start-overview Decision 9 precedent);
  - a context whose `profileId` names another profile of the household → `PermissionDeniedError`.

  Every refusal leaves 0 rows and 0 events.
- [x] 6.6 AC-3.4: a round in `draft`, and a round `closed` via raw SQL → `ApplicationCaptureError`
  `round_not_open`. Another household's round id, and a random uuid → `round_not_found`. A
  malformed id → `round_not_found`, with no DB error.
- [x] 6.7 EC-3.9, deterministic: tx A (its own connection) runs `UPDATE casting_round SET status =
  'closed'` and holds it uncommitted. The capture starts and is observed to wait (it must not have
  resolved after a short fixed delay). Commit A, then assert `round_not_open`. **Break:** remove
  `.for("share")` on the round read, and the capture resolves while A is uncommitted, so the test
  fails.
- [x] 6.8 The concurrent revocation, the same pattern: tx A runs `UPDATE membership SET revoked_at =
  now()` for the capturer, uncommitted. The capture waits; commit A → `PermissionDeniedError`.
  **Break:** move the permission check back outside the transaction (`assertHasPermission`), and
  the capture succeeds.
- [x] 6.9 New raw-sql `tests/integration/raw-sql/application-capture-constraints.test.ts`, as
  `app_runtime` in a **resident** session (so RLS passes and only the constraints decide). Each of
  these fails with its constraint name, or `23502` for NOT NULL:
  - no `collected_from`, no `source`, no `round_id` (each `23502`; the trigger's NULL guard lets
    the missing round reach NOT NULL);
  - a name of only a tab and a newline (`application_applicant_name_not_blank`);
  - a whitespace name, a 201-code-point name;
  - a 255-character email, a 4001-character message;
  - age 151;
  - `attributes = '{}'::jsonb`, `'[]'`, and an 11-element array.

  A valid full row succeeds. Each case asserts the SQLSTATE and the constraint name. **Break:**
  argued in the test's comment (D11), unless a disposable stack is used.
- [x] 6.9a Same raw-sql file, the D12 pairing, as `app_runtime` in a resident session of household A:
  - a row whose `round_id` is a round of household B fails with SQLSTATE `23503` and constraint
    `application_round_same_household`;
  - a row whose `round_id` is a random uuid fails the same way;
  - a row pointing at A's own round succeeds;
  - an `UPDATE` moving an existing A row to B's round id fails the same way.

  Assert the SQLSTATE **and** the constraint name, not just "an error", so the refusal is proven
  to come from the trigger and not from RLS or a NOT NULL. **Break:** argued in the test's comment
  (D11), unless a disposable stack is used. Report which.
- [x] 6.10 Audit (FR-3.7/G-D7): after a capture, exactly one `application.created` event with
  `subject_id` = the new id, `actor_account_id`/`actor_profile_id` = the session's, and payload
  keys exactly `{source, collectedFrom}`. A capture with every field filled leaves no field value
  anywhere in the event row (serialise it and search for each value). **Break:** add
  `applicantName` to the payload, and `recordActivityEvent` throws (the allowlist). Also report
  that the test itself would fail if the allowlist were widened.
- [x] 6.10a No value leaves in an error (D4, pre-mortem 1): fill every field with a distinct
  sentinel string, force a DB refusal of the insert, and assert that the thrown error (`message`,
  `cause`, every own property, `JSON.stringify` of it) contains no sentinel and is an
  `ApplicationWriteError` with `sqlState` and `constraint` only. The refusal is forced through a
  test-only seam that skips the repository's own round check, e.g. an exported
  `captureApplicationTx` used by the repository and the test, or a CHECK the parser is bypassed
  for; say which. Also assert the action logs nothing but `{ code, sqlState, constraint }` (spy on
  `console.error`/`console.log`). **Break:** rethrow the original error, and it fails.
- [x] 6.11 New `tests/integration/policy/organisation-application-visibility.test.ts`:
  - moderator → the row;
  - member without either permission → `PermissionDeniedError`;
  - a member granted only `change_application_state` → the row;
  - household context → `null`, with the `withSessionContext` spy never called;
  - another household's application id → `null`;
  - a mismatched round id → `null`;
  - a malformed id → `null`.

## 7. UI: O3, the detail shell, the round page

- [x] 7.1 `src/ui/strings/de.ts`: a new `applications` block with every string of D6:
  - the form labels (§8.6 / PRD §4.1.3 verbatim for the statement and the checkbox);
  - the counter;
  - the four state texts (§8.6's WG-Konto sentence for the household account);
  - the error texts per code;
  - the success toast;
  - the duty line (both deadlines and the date; a „schon verstrichen" variant);
  - the placeholder hint;
  - `thirdPartyText({ name, household, categories })`, reproducing Compliance §4.5 *Variante
    Dritterhebung* **verbatim** except for its placeholders;
  - the category words.

  Run every label **token** through `matchArt9Term` before committing (split on
  `/[^\p{L}\p{N}]+/u`, 7.6).
- [x] 7.2 `src/app/(org)/rounds/[id]/applications/third-party-notice.tsx` (client), per D6: the
  duty line, a seeded-then-editable `<textarea>`, one copy button (the `JoinCodeCopyButtons`
  pattern), „Text neu erzeugen", and the placeholder hint. There is no send, share or `mailto`
  anywhere.
- [x] 7.3 `src/app/(org)/rounds/[id]/applications/new/`:
  - `page.tsx`, in D6's guard order;
  - `loading.tsx`, importing `@/ui/skeletons` (a heading plus a form outline: 6 field rows, one
    textarea block, one button);
  - `actions.ts`: `captureApplicationAction` maps FormData → the raw input and calls
    `captureApplication`. `redirect()` sits outside the `try/catch`. It never calls
    `console.error(err)`; it logs at most `{ code, sqlState, constraint }` (D4). It returns only `{ status: "error", code, field? }`, maps
    `PermissionDeniedError`/`ProfileRequiredError` to their codes, never returns a message or a
    value, and `redirect`s per D6;
  - `capture-form.tsx`: submits via `onSubmit` + `startTransition` (D6, no `<form action>`
    reset), controlled inputs, the hidden `collectedFrom`, the counter, the attribute
    rows, the notice while ticked, `SubmitButton`, and the client-side whitespace-name block.
- [x] 7.4 `src/app/(org)/rounds/[id]/applications/[applicationId]/page.tsx` + `loading.tsx`: facts
  as text, and for `third_party` the notice with the date from `created_at` and the passed-date
  variant. `null` → `notFound()`, `PermissionDeniedError` → the permission state. Back link to the
  round.
- [x] 7.5 `src/app/(org)/rounds/[id]/page.tsx`: the „Bewerbung erfassen" primary link (profile
  session, `create_application`, round `open`), and the `?saved=1` → `SuccessToast` via a small
  client wrapper. Nothing new is rendered for a profile-less session. Render test in
  `tests/unit/casting/round-page-capture-link.test.ts`: the link is present for a moderator on an
  open round, and absent for a plain member, for a closed/draft round and for the household
  account. **Break:** drop the permission condition, and the member case fails.
- [x] 7.6 Render tests, `tests/unit/casting/capture-page.test.ts` (the `renderToStaticMarkup` +
  mocks pattern of `new-round-page-permission-guard.test.ts`):
  - the permission state renders no `<form>`;
  - the household-account state renders §8.6's sentence and no form;
  - a non-open round renders the no-open-round text and no form;
  - the open-round form renders the statement, an unticked checkbox, and a hidden `collectedFrom`
    with value `data_subject` (AC-3.6);
  - **AC-3.12:** enumerate every `<input>`, `<textarea>` and `<select>` with its `name` and its
    associated `<label>` text. Split each label into tokens on `/[^\p{L}\p{N}]+/u` and assert
    `matchArt9Term` is `null` for the name **and every token**, because `matchArt9Term` alone
    treats a whole label as one word (pre-mortem 4). The test also
    asserts the enumeration found ≥ 8 inputs, so it can't pass vacuously.

  **Breaks:** add an `<input name="religion">`, and it fails; label an existing input
  „Angaben zur Gesundheit", and it fails too.
- [x] 7.7 Render test for the notice, `tests/unit/casting/third-party-notice.test.ts`:
  - rendered with name + phone, the textarea holds the §4.5 text with „Name, Telefonnummer";
  - the markup contains a copy button, and **no `<button>`, `<a>` or `href`** whose text or target
    matches `/senden|send|mailto:|teilen|share/i` (AC-3.10). The regex is not run over the whole
    markup, because the notice text itself may contain such words;
  - the `<textarea>` has no `name` and is not inside a `<form>` (D6);
  - the date is shown.
- [x] 7.8 Action test `tests/unit/casting/capture-action.test.ts`, with the repository mocked to
  throw each error:
  - the returned state is exactly `{ status, code, field? }`;
  - `JSON.stringify(state)` contains none of the submitted values (a PII sentinel string in every
    field).

  **Break:** return `{ ...state, values }`, and it fails.
- [x] 7.9 `npx tsx scripts/lint/pending-feedback.ts` is green: both new routes have a `loading.tsx`
  importing `@/ui/skeletons`, and no plain submit button.

## 8. Seed and register

- [x] 8.1 `scripts/seed-demo-household.ts` per D10: 6 synthetic applications as Alex, 2 moved to
  `screened`. Print counts only.
- [x] 8.2 `docs/review-log.md` §Offene-Punkte-Register / Implementierungspflichten, one row. The
  wording is German, like the file; no status anywhere else: the room, round and settings mutators
  check the permission in a separate transaction from their write, and `captureApplication`'s
  in-transaction check (D4) is the pattern for a later sweep. Then run
  `node tools/check-refs.ts`, which must stay green, and no `docs/` file may point into
  `openspec/`.

- [x] 8.3 `docs/domain/identity.md` §2.1: replace the **„Neue Abgabebedingung"** paragraph (the one
  starting „Eine **fünfte** Rolle-Vorbelegung") with the text below, verbatim. The human reviews
  the German wording before commit. Add one closed row to `docs/review-log.md`
  §Offene-Punkte-Register („Abgabebedingung der Rolle-Vorbelegungen an der Rechtematrix
  ausgerichtet", with the reason). Then run `node tools/check-refs.ts`.

  > **Abgabebedingung (korrigiert 2026-09-28, F3-Planung):** Maßgeblich ist nicht die Zahl der
  > Vorbelegungen, sondern ihre Quelle. Moderator:in ist, wer die Rechte der Moderation **hat**:
  > Die Ernennung trägt die Rechte, die die Rechtematrix (`03-PRD.md` §4.0.1) der Moderation mit ✅
  > gibt und die als Recht geprüft werden, in `Membership.permissions` ein. Die Rückstufung nimmt
  > sie wieder heraus, und die Datenbank verweigert eine Moderation ohne sie. Geprüft wird immer das
  > Recht, nie die Rolle. „Haushalt", „Bewohnende" und „Moderation" sind nur Namen für feste
  > Rechtebündel: Registrierung, Beitritt und Ernennung tragen sie ein; Rückstufung, Auszug und
  > Entfernen nehmen sie wieder heraus. Eine ✅-Handlung, die ein späteres Feature baut (etwa
  > `confirm_appointment`), wird dort zur Vorbelegung, ohne neue Entscheidung. **Ein
  > Vorlagensystem**, über das S-04 ausdrücklich zu entscheiden ist, statt es zu dehnen, wäre
  > dagegen: eine Vorbelegung, die die Matrix der Rolle nicht mit ✅ gibt, oder ein Bündel, das
  > Nutzende selbst zusammenstellen können. *(Vorher: „Eine **fünfte** Rolle-Vorbelegung, oder …" —
  > die Zählung hätte F5 für `confirm_appointment` eine S-04-Entscheidung abverlangt, die die Matrix
  > mit Vorrang 3 längst getroffen hat.)*

## 9. Apply to dev (after groups 1–8 are written)

- [x] 9.1 Read-only precheck on `flatmate-io-dev`: `SELECT count(*) FROM application` = 0, and
  `SELECT count(*) FROM membership WHERE role='household_admin' AND resident_profile_id IS NOT
  NULL` = 0. If either is non-zero, **stop** and report; don't delete anything. Also record
  `SELECT id, role, is_resident, revoked_at IS NOT NULL AS revoked, permissions FROM membership`
  before the apply (the backfills' input; ids only, no names).
- [x] 9.2 **Before applying, tell the human** that from now on every other branch's registrations
  and application inserts fail on dev until this merges (Risks). Apply `0023`, then `0024`, via Supabase MCP `apply_migration`, one file per call, with
  the file's exact content. **If the harness refuses any statement, stop, report the statement, and
  hand off to the human.** Don't rewrite the SQL to get past it.
- [x] 9.3 Verify the catalog, and stop if anything differs:
  - the 9 columns exist with the right types, NOT NULL exactly on `applicant_name`, `source`,
    `collected_from` and `round_id`, and **`column_default IS NULL` for all nine**;
  - both enum types have their exact values;
  - the 7 `application_*` CHECKs, `membership_admin_has_no_profile` and both
    `membership_*_holds_role_permissions` exist (`pg_constraint`);
  - every live row holds its roles' sets (and its other values), the administering row holds
    exactly the household set, and every revoked row is a `member` holding `[]`;
  - the `application_round_same_household` trigger exists and is enabled (`pg_trigger`), and its
    function is **not** `SECURITY DEFINER` (`pg_proc.prosecdef = false`).

  Paste the query output into the report.

## 10. Verify

- [x] 10.1 `npm run verify` green: paste the real tail (files/tests counts). Then the dev row counts
  after the suite: `application` = 0 and no leftover test households beyond the seed's.
- [x] 10.2 The report lists: every deliberate break and whether it was seen failing; the G-G1 diff
  evidence (5.2); the 1.8 grep; anything not done or deviating from design.md, with the reason.
  **A deviation from D4's lock order or transaction shape is not taken on its local merits. Stop
  and report it.**
- [ ] 10.3 Human-gated, **not ticked by the applier**: the browser walkthrough (sign in as the demo
  moderator; capture a name only; capture third-party and see the duty, date and text before
  saving; copy it; no send; land on the detail; a refused save keeps the values; the dev server log
  contains no typed value), done by the planner with the human.
