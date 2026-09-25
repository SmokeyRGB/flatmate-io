# Tasks

> Read `design.md` first. Three things are easy to get wrong: the predicate needs `nullif(…, '')`
> (Decision 1, because `''` is what a reused connection reads). `round_participation` is
> deliberately untouched (Decision 2). The teardown edits in two **guarded** files were approved by the
> human (2026-09-24) for `afterEach` only (Decision 6). Anything beyond that is not covered. If anything here seems to require weakening a
> test listed in `test/guarded.manifest.json`, **stop and report**.

## 1. Docs: record the finding

> German in `docs/review-log.md` (ADR-012). **Nothing under `docs/` may cite `openspec/`**
> (check-refs Rule 7).

- [x] 1.1 `docs/review-log.md` §Offene-Punkte-Register → *Implementierungspflichten*: add one row
  **G-D15 Datenbankhälfte für `Application`** *(neu 2026-09-24)*. It states the finding (only the
  household policy existed; raw `count(*)` possible; the existing raw-SQL test did not query
  `application`), the decision (RESTRICTIVE policies on `application` and on application-subject
  `activity_event` rows; `round_participation` deliberately not restricted, with the reason in one
  sentence), and three residual duties: (a) F3: every new repository function on `Application`
  carries its own early refusal and test. (b) F4: `vote` gets the same policy from its first
  migration, because "5 von 7" becomes derivable. (c) The human decision on retention (2026-09-24, design
  Decision 5): after a concluded round's retention period expires, its applications are deleted
  automatically unless an extension was requested. The deletion runs on a named system path, never
  in a household-account session. The household account is only told that the round's retention
  expires and that the applications will then be deleted if no extension is requested, never how
  many. Its notice and extension act on the round's retention fields. (c) cites `screens/O-organisation.md`
  O17/O18, which already say the same thing (clock starts at round close; warning 14 days ahead;
  *„Keine stille Löschung … Löschung erst nach Ablauf und mit `ActivityEvent`"*). Do **not** restate
  them. **Retention anchor, human decision 2026-09-24:** see task
  1.2. Record it in the same row.
- [x] 1.2 **Retention anchor correction** (human decision 2026-09-24; it agrees with the authoritative
  source). `06-Compliance-Anhang.md` §5 (maßgeblich per `SPEC-INDEX.md`, *Aufbewahrung und
  Löschung*) anchors `Application` at *„Abschluss der `CastingRound`"*, and so do E-18
  (`01-Problem-Framing.md`), `03-PRD.md` row 22 and `screens/O-organisation.md` O17. Two living
  citations contradict it and are corrected to match: `docs/domain/aufbewahrung.md` §7's table (the
  `Application` row's *Anker* `created_at` → `CastingRound.closed_at`), and
  `docs/domain/casting.md`'s `Application.retention_until` row (`Default created_at + 180 Tage` →
  180 days, or `retention_days`, from the round's `closed_at`, citing §7). German, and no other
  wording changes. **Do not touch** the frozen `docs/04-Domaenenmodell.md`, which keeps its snapshot
  wording (lines 676 and 1687). Also update the stale comment on `retentionUntil` in
  `src/modules/casting/schema.ts`: comment only, since the column has no DB default. **Record one
  open row** in *Offen — Entscheidung oder Erhebung nötig*. With the anchor at round close, an
  `Application` whose round never closes, or that belongs to no round (`round_id` is nullable), has
  no deletion date. Owner `06-Compliance-Anhang.md` §5. Do not decide it.
- [x] 1.3 Run `node tools/check-refs.ts`: 0 findings.

## 2. Schema and repository

- [x] 2.1 `src/modules/casting/schema.ts`: add `pgPolicy("application_requires_resident_profile",
  { as: "restrictive", for: "all", using: PROFILE_PRESENT, withCheck: PROFILE_PRESENT })`. Define
  `PROFILE_PRESENT` as design Decision 1's expression, with a comment that cites
  `docs/domain/invarianten.md` §5.5's `app_profile_id()` and explains the `''` case.
- [x] 2.2 `src/modules/audit/schema.ts`: add `pgPolicy("activityevent_application_requires_resident_profile",
  { as: "restrictive", for: "select", using: … })` per design Decision 3, with a comment naming G-D15 and why
  only `subject_type = 'application'` is restricted. Do not import from `casting/schema.ts`. Repeat
  the expression locally, as each schema file already does with `HOUSEHOLD_MATCH`.
- [x] 2.3 `src/modules/casting/repository.ts`: add exported `ProfileRequiredError` (`code =
  "profile_required"`, `name` set). `getApplication` returns `null` when `context.profileId === null`
  before opening a transaction. `transitionApplication` throws `ProfileRequiredError` in the same case
  before any query. Add a comment on each naming G-D15 / ADR-014, in the shape of
  `getRoundParticipants`'s comment.
- [x] 2.4 `src/db/session-context.ts`: correct the doc comment that says an unset `app.profile_id`
  reads as NULL, *never an empty string*. It reads `''` on a connection whose earlier transaction
  set it (cite `pool-reuse.test.ts`), which is why every policy must use `nullif`. Comment only; no
  code change.
- [x] 2.5 Re-run `grep -rn "application" drizzle/*.sql src/ scripts/` and confirm that no
  `SECURITY DEFINER` function and no production path reads `application` in a household-account
  session other than those in design's sibling-path table. Report anything new in the apply report.

## 3. Migration

> Write 4.2 and 4.3 and run them **before** 3.3: the run before the migration is their deliberate
> break.

- [x] 3.1 Run `npx drizzle-kit generate` → `drizzle/0018_*.sql`. It must contain exactly the two
  `CREATE POLICY … AS RESTRICTIVE` statements. Prefix each with `DROP POLICY IF EXISTS "<name>" ON
  "<table>";` (Decision 7). Add a header comment in the style of `drizzle/0017`. Check
  `drizzle/meta/_journal.json` lists `0018`, and that the new snapshot carries both policies.
- [x] 3.2 **Read the file back** before applying. Then run `npm run verify`'s lint half
  (`migration-shape.ts` must pass on `0018`).
- [x] 3.3 Apply `0018` to **`flatmate-io-dev`** (never production) via Supabase MCP
  `apply_migration`. If the harness refuses a statement, stop and hand **that statement** to the
  human. Do not rewrite it to get around the refusal. After any hand-off, verify with `SELECT
  policyname, permissive, cmd, qual, with_check FROM pg_policies WHERE policyname IN (…)`: both rows
  present, `RESTRICTIVE`, and `qual` containing `NULLIF`. If the database does not show this, **stop**.
  Never infer "not yet applied".

## 4. Tests (G-C7: both sides)

> Real `flatmate-io-dev`; teardown in `afterEach`, never `finally`; seed applications under a
> **resident** context (`profileId: uuid()`), since the new policy refuses a profile-less insert.
> Each test is seen failing against its named deliberate break, and the apply report says so.

- [x] 4.1 `tests/integration/policy/application-visibility-household-account.test.ts` (new,
  `[GUARDED] G-D15 (policy layer)` header like the existing G-D15 file). Seed one application in a
  `registerTestHousehold()` household under a resident context. Then check: `getApplication(hh.context,
  id)` is `null`. `transitionApplication(hh.context, id, "screened", actor)` rejects with
  `ProfileRequiredError` (assert `code`, not only the type), and the row's `state` **and**
  `state_changed_at` are unchanged (read back under a resident context). A resident context's
  `getApplication` still returns the row. **Deliberate break:** remove the early throw in
  `transitionApplication`. The test must fail on the error code, since RLS would give *"Application
  not found"*.
- [x] 4.2 `tests/integration/raw-sql/application-visibility-household-account.test.ts` (new,
  `[GUARDED] G-D15 (raw SQL)`). Seed two applications under a resident context. Then, under
  `hh.context` via `withSessionContext`, run raw `tx.execute(sql…)`: `SELECT count(*) FROM
  application` = `0` (**assert the number**). `INSERT INTO application …` rejects (assert the
  Postgres error code `42501`). `UPDATE application SET state='screened'` and `DELETE FROM application`
  each report 0 rows, and both rows are still present and unchanged when read back under a resident
  context. **The `''` case:** in one `db.transaction` via a raw client in the test, run `SET LOCAL
  app.household_id`, then a nested transaction (savepoint) that does `SET LOCAL app.profile_id =
  '<uuid>'` and throws to roll back. Assert the precondition `current_setting('app.profile_id',
  true) = ''`, then assert `count(*) = 0`. If the precondition reads `NULL`, switch to the `max: 1`
  two-transaction method (design Risks) and report it. Include a resident-context control: its count
  is `2`. In the same `''` transaction, also assert that `current_setting('app.profile_id', true)
  IS NOT NULL` is **true** and `nullif(…, '') IS NOT NULL` is **false**. This pins, without
  loosening the dev policy, that a predicate missing `nullif` would admit this session.
  **Deliberate break:** write this file before task 3.3 and run it against the pre-migration
  database. Both count assertions must fail (`2`, not `0`). Never loosen the applied dev policy to
  demonstrate a break.
- [x] 4.3 In the raw-SQL file from 4.2, add a second `describe`: seed an `application.state_changed`
  event and a `casting_round.*` or `household_settings.*` event for the household under a resident
  context. Under `hh.context`, `SELECT count(*) FROM activity_event WHERE subject_type =
  'application'` = `0`, while the other event is still returned. **Deliberate break:** the
  pre-migration run, as in 4.2.
- [x] 4.4 `test/guarded.manifest.json`: add the two new files to G-D15's `testFiles` **after** both
  pass. Status stays `implemented`. Run `scripts/lint/guarded-tests.ts` (via `npm run verify`).

## 5. Teardown fix-ups (Decision 6)

- [x] 5.1 `tests/helpers/identity.ts` `cleanupHousehold`: run the CTE under `{ ...context,
  profileId: context.profileId ?? uuid() }`, with a comment explaining why (the RESTRICTIVE policy
  would make the `application` arm a silent no-op) and citing design Decision 1's stated cost.
  **Check:** a test that seeds an application in a registered household and calls `hh.cleanup()`
  leaves zero `application` rows. Fold this into 4.1's `afterEach`, verified by a resident-context
  count after cleanup in a dedicated `it`.
- [x] 5.2 (Approved by the human 2026-09-24.) Change `afterEach` only: `profileId: null` → `profileId:
  uuid()` in `tests/unit/audit/backward-transition.test.ts` (G-D3) and
  `tests/unit/audit/payload-allowlist.test.ts` (G-D7/G-D8). Diff must show no change inside any `it`.
- [x] 5.3 `grep -rn "profileId: null" tests/` and check each hit that deletes, updates or reads
  `application` or application-subject `activity_event` rows. Fix any the planning missed, and list
  them in the apply report.

## 6. Verify

- [x] 6.1 `npm run verify`: eslint, tsc, the six lints, check-refs, then the full vitest suite
  against `flatmate-io-dev`. All green, including the unchanged
  `tests/integration/policy/round-visibility-household-account.test.ts` (the household account still
  creates rounds, which is Decision 2's point) and `tests/unit/audit/immutability.test.ts`.
- [x] 6.2 Close the review-log row per task 1.1's second half, then re-run `node tools/check-refs.ts`.
- [x] 6.3 Do **not** commit. Report the full diff summary for review.
