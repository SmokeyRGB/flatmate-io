# WP02 · DB runtime limits, audit-log integrity, DEFINER search_path

> Paste into a fresh Cursor Agent session; read `audit/cursor/README.md` first.

## 1. Goal

Make the database client fail fast with explicit pool bounds and transaction-local `statement_timeout`/`lock_timeout` (**#15, Medium**); bind the audit log's actor to the session and restrict post-retention UPDATEs to the `payload` column (**#14, Medium**); standardise `search_path` on every `SECURITY DEFINER` function and make a missing session context fail closed instead of crash (**#31 first half and #32, Low**, with the threat model written down). Join-code hashing (the second half of #31) is out of scope.

## 2. Branch, dependencies, conflicts

- Branch: `fix/wp02-db-runtime-audit` from `main` **after WP01 is merged** (it reuses `tests/helpers/live-catalog.ts` and `KNOWN_DEFINERS` from `tests/integration/schema/catalog-shape.test.ts`).
- Must not run in parallel with: WP01 (migrations), WP03 and WP04 (they edit `src/modules/casting/repository.ts`, which writes audit events; WP04 removes the caller-supplied `Actor`).
- Migration numbers: `0029` (search_path), `0030` (audit triggers), `0031` (policy `nullif`). **These are placeholders.** WP01, F3 change 4 and change 2b also add migrations. Take the next three free numbers from `ls drizzle/*.sql` at start and substitute them everywhere below. Use `npx drizzle-kit generate --custom --name=…` for 0029/0030.
- Reserved for change 2b: do not touch role checks, capability flags, permission constants, membership CHECKs (`drizzle/0024`, `0027`).

## 3. Read first

`src/db/client.ts`, `src/db/session-context.ts`, `src/db/rls-predicates.ts`, `src/modules/audit/schema.ts`, `src/modules/audit/repository.ts`, `src/modules/identity/auth-provider.ts` (deadline, lines 24-60), `drizzle/0000` (lines 30-43), `0002`, `0003`, `0005`, `0013`-`0015`, `0019`, `0026`, `tests/unit/audit/immutability.test.ts`, `payload-allowlist.test.ts`, `tests/integration/raw-sql/pool-reuse.test.ts`, `session-context-set-config.test.ts`, `tests/integration/policy/revoked-membership-sign-in.test.ts` (deterministic lock test), `tests/helpers/identity.ts` (cleanup), `scripts/lint/session-context.ts`, `scripts/lint/migration-shape.ts`, and the WP01 files above.

## 4. Current state (verified 2026-10-01 on main @ 3401c94; re-verify)

- `src/db/client.ts:7`: `postgres(process.env.DATABASE_URL!, { prepare: false })`. No fail-fast; postgres.js defaults apply (`max` 10, `connect_timeout` 30 s, `idle_timeout` none), so the audit's "no pool bound" is really "not explicit". No `statement_timeout`/`lock_timeout` anywhere in `src/`, `drizzle/`, `scripts/`.
- `npm run build` runs in CI before any database exists and without database env (`.github/workflows/ci.yml:80,150`). A throw at import time in `client.ts` would break it.
- `src/db/session-context.ts:78-95`: one statement `SELECT set_config('app.account_id', …, true) AS account_id, set_config('app.household_id', …, true) …` (+ `app.profile_id` when set). `scripts/lint/session-context.ts` requires each `set_config` call to pass literal `true`, only in this file.
- Auth-provider deadline: `AUTH_PROVIDER_DEADLINE_MS` default 5000, valid 500-60000 (`auth-provider.ts:50-60`), applied per provider request. Provider calls happen inside `withSessionContext` transactions (hazards file) while row locks are held, and `signInWithPasswordWithResend` may send twice. Test timeouts are 60 s (`vitest.config.ts`).
- Audit: `activity_event` policies in `src/modules/audit/schema.ts:22-95`: insert is checked only by `HOUSEHOLD_MATCH`; the restrictive UPDATE policy admits any row whose application passed retention and **any column** may change (`0003`). `FORCE ROW LEVEL SECURITY` is on (`0000:43`). `app_runtime` holds UPDATE/DELETE (bootstrap-roles). `redactExpiredActivityEvents` (`audit/repository.ts`) is the only intended UPDATE and writes only `payload`; `REDACTABLE_KEYS` is empty today, so it is a no-op.
- `recordActivityEvent` callers and the session context each runs under (all in `src/modules`):

  | Caller | Actor written | Session context in that transaction |
  |---|---|---|
  | `auth.ts:241` registerHousehold | `accountId`, profile null | `{accountId, householdId, null}`, same account (the account row is inserted just before) |
  | `auth.ts:426` claimResidentProfile | new `accountId`, `residentProfileId` | **caller's** context (a different account), new account and profile exist in the tx |
  | `auth.ts:1073` joinHousehold | new account + profile | same account and profile |
  | `auth.ts:1421,1503,1786,1810,1875` email/password flows | `context.accountId/profileId` | same |
  | `auth.ts:2164` redeemPasswordReset | **issuer's** account (`createdByAccountId`, may be null), profile null | `bootstrapContext` with a **random** accountId (`auth.ts:2095`) |
  | `identity/repository.ts` 97, 150, 806 | `Actor` passed by caller | caller context |
  | `identity/repository.ts` 928, 1144, 1294, 1434 | `actingAccountId` (asserted equal to the session by the `assert*` helpers) | same |
  | `casting/repository.ts` 166, 399, 463 | `context.*` | same |
  | `casting/repository.ts` 542-1051 (rooms, rounds, settings) | caller-supplied `Actor` (#5, fixed by WP04) | caller context |

  So two legitimate writers (claim, reset) record an actor that is **not** the session's account. A hard `actor = app.account_id` rule would break both.
- Five `SECURITY DEFINER` functions are defined by our migrations: `resolve_account_household(uuid)`, `resolve_join_code(text)`, `claim_join_code(text, join_code_purpose)`, `record_join_attempt(text, int, int)` use `search_path = public` (`0005:9`, `0013-0019`); `casting_round_keeps_applications()` uses `pg_catalog, public` (`0026:34`). The triggers in `0023`/`0025` are not definers (the audit's "0023+" wording is loose).
- `current_setting('app.household_id', true)::uuid` is bare in `src/modules/{audit,casting,identity}/schema.ts` (`HOUSEHOLD_MATCH`, `IS_OWN_HOUSEHOLD*`, `casting/schema.ts:140-141`) and the matching migrations (`0000`, `0001`, `0004`, `0007`, `0013`, `0018`). Only `PROFILE_PRESENT` already uses `nullif` (`rls-predicates.ts:14`). On a pooled connection a transaction that never set the variable reads `''`, and `''::uuid` raises SQLSTATE `22P02` instead of returning no rows.

## 5. Package-specific hazards

- **No transaction spans Postgres and Supabase Auth / One pooled connection per call chain**: timeouts must not make a legitimate long transaction fail. See the numbers in Phase B step 2.
- **Every writer of the same state, pairwise / A sibling entry**: the actor trigger must admit every writer in the table above and every sibling you find; enumerate again with `grep -rn "recordActivityEvent\|insert(activityEvent)" src`.
- **An invariant holds only where it is enforced**: triggers and policies bind raw SQL too; test both sides (policy layer and raw SQL, G-C7).
- **Migrations**: re-runnable; `ALTER FUNCTION` has no `IF EXISTS`, so guard with `to_regprocedure`; the human applies all three files on dev (README rule 5). Hand-run SQL through `DATABASE_URL` is a no-op under RLS.
- **Tests that can fail**: assert SQLSTATE (`42501`, `55P03`, `57014`, `22P02`); drizzle/postgres.js may wrap the driver error, so read `err.code ?? err.cause?.code` and check which one carries it in this repo's versions before you rely on it.
- G-D invariants: `activityevent-scoping`, `immutability`, `pool-reuse` are guarded tests. Do not weaken them; add beside them. If a guarded test must change, stop (README rule 9).

## 6. Plan

### Phase A — characterization / failing tests

Pin what must not change (all **green** before and after):

- **A1** `tests/integration/raw-sql/activityevent-integrity.test.ts`, describe "legitimate audit writers keep working": for a fresh household (random ids; create the account rows with the same helpers other tests use) insert via `recordActivityEvent` (a) actor account = session account, (b) actor null, (c) actor = a *different* account of the same household (the reset shape), (d) actor account created in the same transaction after a different session account (the claim shape), (e) actor profile = session profile. Each must succeed. The existing suites `join-by-link`, `resident-claim-flow`, `password-reset-link`, `account-settings-*`, `member-*` are the end-to-end pins; run them before and after.
- **A2** extend `tests/integration/raw-sql/session-context-set-config.test.ts` (or a new sibling): on a dedicated `max: 1` client, after a `withSessionContextOn` transaction commits, `SHOW statement_timeout` and `SHOW lock_timeout` on the next transaction equal the server defaults, not the application's values. Green today (trivially) and must stay green: it proves the timeouts do not leak across pooled transactions (G-D10 style).
- **A3** `tests/integration/raw-sql/pool-reuse.test.ts` stays unchanged and green.

New-behaviour tests (each seen **red** first):

- **A4** `activityevent-integrity.test.ts`, describe "actor binding": (a) actor account id that exists in no household -> insert rejected, SQLSTATE `42501`; (b) actor account of **another** household -> `42501`; (c) `actorProfileId` that is not a profile of the household -> `42501`. Assert the code and that no row was written. Each from both `recordActivityEvent` (policy layer) and a raw `sql\`INSERT INTO activity_event …\``. Deliberate break: drop the trigger's `EXISTS` branch -> (a) turns green-wrongly; confirm the test goes red when the trigger is disabled (`ALTER TABLE … DISABLE TRIGGER` is owner work, so instead verify by running the test against dev **before** the human applies 0030).
- **A5** same file, describe "post-retention UPDATE is payload-only": use the setup of the existing retention-redaction test in `payload-allowlist.test.ts` to create an application whose `retention_until < now()` and an `application.state_changed` event for it. Then: UPDATE `event_type` -> rejected `42501`; UPDATE `actor_account_id` -> `42501`; UPDATE `occurred_at` -> `42501`; UPDATE `payload` only -> succeeds (this is the redaction path, must stay green); `redactExpiredActivityEvents` still returns the same count as today.
- **A6** `tests/integration/schema/definer-search-path.test.ts` (uses WP01's `isStrictCatalogCheck()`): every non-extension `prosecdef` function in `public` has `proconfig` containing exactly `search_path=pg_catalog, public`. Red today for the four `public`-only functions.
- **A7** `tests/unit/db/client-config.test.ts`: with `vi.resetModules()` and `vi.stubEnv("DATABASE_URL", "")`, `await import("@/db/client")` throws an Error whose message names `DATABASE_URL`; with `NEXT_PHASE=phase-production-build` and no URL it does **not** throw. Red today (no throw). Same file: `readTransactionTimeouts(env)` (step 2) returns the defaults, accepts valid overrides and throws for non-integers and out-of-range values naming the variable.
- **A8** `tests/integration/raw-sql/db-timeouts.test.ts`: (a) *lock timeout*: a dedicated client (`max: 1`, via `withSessionContextOn`) inserts a room in a random household, then holds the transaction open on a promise; meanwhile `withSessionContext` with `DB_LOCK_TIMEOUT_MS=500` runs `SELECT … FROM room WHERE id = … FOR UPDATE` and must reject with SQLSTATE `55P03` in under 5 s; then release the holder and clean up in `afterEach`. (b) *statement timeout*: `DB_STATEMENT_TIMEOUT_MS=500` and `SELECT pg_sleep(5)` rejects with `57014`. (c) with the defaults, a fast statement succeeds. Red today (no timeout, (a) would block until the holder releases). Deterministic: the holder is released only by the test, never by a timer.
- **A9** `tests/integration/raw-sql/missing-session-context.test.ts` (#32): on a `max: 1` client, transaction 1 sets `app.household_id` via `set_config(…, true)` and commits; transaction 2 sets nothing and runs `SELECT count(*) FROM room` -> expects `0` rows counted; and `INSERT INTO room …` -> expects SQLSTATE `42501` (RLS violation). Red today (`22P02`). Before writing it, `grep -rn "22P02\|invalid input syntax for type uuid" tests` and list any test that pins the crash; they change in the same commit as the policy fix with the reason in the body.

### Phase B — change (one commit per step, each green under `npm run verify`)

1. `fix(db): fail fast on a missing DATABASE_URL and set explicit pool bounds` — in `src/db/client.ts`: read `DATABASE_URL`; if empty and `process.env.NEXT_PHASE !== "phase-production-build"` throw `new Error("DATABASE_URL is not set. Copy .env.example to .env.local.")`; during the build phase use a placeholder URL (postgres.js connects lazily) so `npm run build` without env still passes (run it with the variable unset and attach the output). Pass `{ prepare: false, max: Number(DB_POOL_MAX ?? 10), connect_timeout: 10, idle_timeout: 20 }`. `max` 10 equals today's implicit default, so this changes nothing but makes it explicit; note in a comment that `flatmate-io-dev` has 16 server connections for `app_runtime` and that the suite's parallel files share them (hazards file, "One pooled connection per call chain"). Add `DB_POOL_MAX` to `.env.example`. A7 first half green.
2. `fix(db): transaction-local statement and lock timeouts` — in `src/db/session-context.ts` add exported `readTransactionTimeouts(env = process.env)` returning `{ statementMs, lockMs }` from `DB_STATEMENT_TIMEOUT_MS` / `DB_LOCK_TIMEOUT_MS` (defaults **30000** and **20000**; valid integers 100-120000 else throw naming the variable, mirroring `readDeadlineMs`). Read it **per call** inside `applySessionContext` (not at import) so tests can set the env. Add two more `set_config('statement_timeout', '<ms>', true)` / `set_config('lock_timeout', '<ms>', true)` calls **in the existing single statement** (no extra round trip; each on its own line with literal `true`, so `scripts/lint/session-context.ts` stays green).
   Justification of the numbers (restate in the code comment): a lock holder can legitimately sit in provider calls while holding the row lock: deadline 5 s default, up to 2 attempts for sign-in, and the password/email flows make several calls. Count the provider calls made while a lock is held in `auth.ts` (`changeResidentPassword` ~1640-2000, `changeResidentEmail` ~1353-1530, `redeemPasswordReset` ~2073) and write the maximum into the comment. `lock_timeout` must be **larger than the longest legitimate holder** (`max_calls x deadline + 5 s margin`) or an unlucky second request fails while the first is still legitimately working; if your count gives more than 15 s, raise the default above it, keep `lock_timeout < statement_timeout` (so a lock wait reports `55P03`, not `57014`), and keep `statement_timeout` below the 60 s test timeout. `statement_timeout` is per statement, so provider time between statements is not counted by it. Do not set `idle_in_transaction_session_timeout` (out of scope; it would cut the same provider waits). A2, A8, A7 (second half) green.
3. `fix(db): standardise SECURITY DEFINER search_path` — `drizzle/0029_definer_search_path.sql`, header "HUMAN HAND-OFF". For each of the four `public`-path functions:
   ```sql
   DO $$ BEGIN
     IF to_regprocedure('public.resolve_account_household(uuid)') IS NOT NULL THEN
       ALTER FUNCTION public.resolve_account_household(uuid) SET search_path = pg_catalog, public;
     END IF; END $$;
   ```
   (same for `resolve_join_code(text)`, `claim_join_code(text, join_code_purpose)`, `record_join_attempt(text, integer, integer)`; `ALTER FUNCTION … SET` is idempotent and keeps grants and bodies untouched; prefer it over DROP+CREATE for that reason). After the human applies it, the raw-sql tests for all four (`resolve-account-household`, `join-code-isolation`, `record-join-attempt`, `join-by-link-scoping`) must stay green; if one fails because an unqualified name resolved through `public` first, qualify that name in a follow-up migration and report. A6 green. Optionally teach `definer-coverage.ts` that a later `ALTER FUNCTION … SET search_path` counts; skip if it grows beyond a few lines.
4. `fix(audit): bind the actor and lock post-retention updates to payload` — `drizzle/0030_activity_event_integrity.sql`, human-applied, two invoker-rights (not DEFINER) trigger functions with `SET search_path = pg_catalog, public`, each preceded by `DROP TRIGGER IF EXISTS` and `CREATE OR REPLACE FUNCTION`/`DROP FUNCTION IF EXISTS` as `migration-shape.ts` requires:
   - `activity_event_actor_bound` `BEFORE INSERT ... FOR EACH ROW`. **Decision (made here, do not reopen):** an actor is accepted when (1) `actor_account_id` is NULL, or equals `nullif(current_setting('app.account_id', true), '')::uuid`, or is an existing `account` row with `household_id = NEW.household_id`; and (2) `actor_profile_id` is NULL, or equals `nullif(current_setting('app.profile_id', true), '')::uuid`, or is an existing `resident_profile` row of the same household. Otherwise `RAISE EXCEPTION 'activity_event actor is not bound to this household' USING ERRCODE = '42501'` (fixed text, no ids). Why the third branch exists: claim (`auth.ts:426`) and reset (`auth.ts:2164`) legitimately record an actor that is not the session's account, and the audit's strict "equals app.account_id" would break them. What this does and does not give you: it stops forged ids, non-existent actors and cross-household attribution; it does not stop mis-attribution to another member of the *same* household. State that limit in the migration header and the PR. Follow-up (not now): after WP04 makes every writer take its actor from the session and the claim/reset flows stop needing the third branch, the human may tighten it.
   - `activity_event_update_payload_only` `BEFORE UPDATE`: raise `42501` when any column other than `payload` differs between `OLD` and `NEW` (`(NEW.id, NEW.household_id, NEW.round_id, NEW.event_type, NEW.subject_type, NEW.subject_id, NEW.actor_account_id, NEW.actor_profile_id, NEW.occurred_at, NEW.correlation_id, NEW.reverses_event_id) IS DISTINCT FROM (OLD.…)`). Do not constrain the payload's keys: the schema comment (`audit/schema.ts:57-73`) records that key-shape stays an application-layer rule (research.md §4).
   Run the full suite; tests that insert events with invented actor ids (`grep -rn "actorAccountId" tests`) and now fail are listed in the PR and fixed by giving them a real account/null, in this commit, with the reason in the body. A4, A5, A1 green. Add both triggers to `EXPECTED_TRIGGERS` in `catalog-shape.test.ts` and `data-inventory`/`guarded` need no change.
5. `fix(db): a missing session context yields no rows, not a crash` (#32) — in `src/db/rls-predicates.ts` add `HOUSEHOLD_ID_SETTING = sql\`(select nullif(current_setting('app.household_id', true), '')::uuid)\`` and rebuild `HOUSEHOLD_MATCH`/`IS_OWN_HOUSEHOLD`/`IS_OWN_HOUSEHOLD_SETTINGS` from it in the three `schema.ts` files and `casting/schema.ts:140-141` (one definition, DRY; imports only `drizzle-orm`). Then generate the policy migration: run `npx drizzle-kit generate` and compare its `ALTER POLICY` set with `SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies WHERE qual LIKE '%app.household_id%' OR with_check LIKE '%app.household_id%'` on dev; the migration must cover **every** such policy, including ones created only in raw SQL (`0013`, `0018`), each with its other terms (restrictive/permissive, command, roles) unchanged. If the list exceeds roughly 30 policies or `drizzle-kit` output is incomplete, stop and report (stop condition). File: `drizzle/0031_policies_nullif_household.sql`, human-applied. Extend `catalog-shape.test.ts` with: no policy `qual`/`with_check` in `public` contains `app.household_id` without `nullif`. A9 green; `household-scoping`, `*-household-scoping`, `activityevent-scoping` suites unchanged and green.
6. `docs(hazards): threat model of the session context` — add a short section to `.claude/rules/implementation-hazards.md` (new heading, under "An invariant holds only where it is enforced" or after it; keep existing headings, other files cite them): any SQL that runs as `app_runtime` can call `set_config('app.household_id', …)` itself, so RLS guards against application bugs and cross-household mistakes in TypeScript, not against SQL injection or a compromised app process; the real boundary is `import-boundary.ts`, `session-context.ts` being the only setter, validated UUIDs, and never concatenating user input into SQL. Mention the new timeouts and the actor rule in one line each.

### Phase C — follow-through

- 🛑 HUMAN: apply `drizzle/0029`, `0030`, `0031` in this order on `flatmate-io-dev` via the Supabase SQL editor (each file in full, each re-run once to prove re-runnability). Tell the agent; then run `DATA_INVENTORY_LIVE_STRICT=1 npx vitest run tests/integration` and the full `npm run verify`.
- CI `verify` builds the stack from `drizzle/` alone, so it needs no manual step; confirm green.
- Update `openspec/specs/` only if a spec states the old behaviour (`grep -rn "statement_timeout\|actor" openspec/specs`). Never edit `openspec/changes/archive/**`.
- Production stays at `0012` until the end of v0.1; list `0029-0031` in the PR as part of the go-live set (after WP01's `0028`).

## 7. Acceptance criteria

- [ ] `npm run build` passes with `DATABASE_URL` unset; importing `@/db/client` outside the build phase without it throws a message naming `DATABASE_URL`.
- [ ] A held row lock makes a competing `withSessionContext` fail with `55P03` after `DB_LOCK_TIMEOUT_MS`; a long statement fails with `57014`; neither value leaks to the next transaction on the same connection.
- [ ] The documented default `lock_timeout` is larger than the maximum lock-holding provider time counted in `auth.ts`, and the count is written in the code comment.
- [ ] Every writer in the table in section 4 still succeeds; forged or cross-household actor ids and profile ids are rejected with `42501` in both layers; post-retention UPDATE of any column other than `payload` is rejected, payload redaction still works.
- [ ] All non-extension DEFINER functions in `public` carry `search_path=pg_catalog, public` (catalog test strict in CI, green on dev after the human applies 0029).
- [ ] No policy references `app.household_id` without `nullif`; a context-less transaction on a reused connection reads zero rows and cannot insert (`42501`).
- [ ] Hazards file documents the threat model; `npm run verify` green; guarded tests untouched.

## 8. Out of scope & stop conditions

Out of scope: hashing join codes (#31), mapping `55P03`/`57014` to user-facing messages (WP08/#10), `idle_in_transaction_session_timeout`, removing the caller-supplied `Actor` (WP04), tightening the actor rule (follow-up after WP04), subject-id binding for audit events. Stop and report if: the actor trigger breaks a writer not in the table above and you cannot admit it without dropping a branch; a guarded test must change; the lock-holder count gives a `lock_timeout` above ~25 s (then the real fix is shorter transactions, not a bigger timeout); `npm run build` cannot pass without env; the policy list for step 5 is incomplete or very large; any `src/modules/casting/repository.ts` edit seems necessary (WP03/WP04 own it).

## 9. Hand-back report

```
WP02 hand-back
Branch / PR:
Commits (hash + message):
Red-run evidence per test A4-A9 (command + failing assertion/SQLSTATE):
Provider-call count per lock-holding flow and the chosen timeouts (numbers + reasoning):
Actor-trigger decision as implemented; tests changed because of it (list + reason):
Policies altered in 0031 (count, list) and tests that pinned 22P02:
Migrations for the human: 0029, 0030, 0031 (applied on dev: yes/no, by whom, when; re-run once: yes/no)
Verify output (pass/fail counts, duration):
Open questions / skipped:
```
