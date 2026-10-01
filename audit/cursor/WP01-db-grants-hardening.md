# WP01 · Revoke anon/authenticated grants; live catalog test

> Paste into a fresh Cursor Agent session; read `audit/cursor/README.md` first.

## 1. Goal

Close the Supabase-default exposure of the database: `anon` and `authenticated` can EXECUTE every `SECURITY DEFINER` function and hold full DML on all 14 public tables (**#2, Critical, v0.1 blocker**). Add the missing live-catalog test that would have caught it, including expected policies, `relrowsecurity`/`relforcerowsecurity` and triggers per table (**#25, Medium**). Make a production deployment fail at startup when `JOIN_ATTEMPT_TRUSTED_IP_HEADER` is unset (**#39, Low**; the other half of #39, the DEFINER exposure of `record_join_attempt`, is closed by #2's REVOKE).

## 2. Branch, dependencies, conflicts

- Branch: `fix/wp01-db-grants` from current `main`.
- Depends on: nothing. WP02 depends on this package (it reuses the live-catalog helper added here).
- Must not run in parallel with: WP02 (both add migrations).
- **Migration numbers in this file (`0028`) are placeholders.** F3 change 4 and change 2b also add migrations. At start, take the next free number from `ls drizzle/*.sql` and substitute it everywhere below.
- Reserved for change 2b, do not touch: role checks, `getResidentList`/`getNavigationAccess` flags, permission constants, membership CHECKs in `drizzle/0024`/`0027`. This package touches none of them.

## 3. Read first

- `tests/integration/schema/data-inventory-live.test.ts` (strict-vs-warn rule `isLocalDatabase()`, header comment explains design D5).
- `tests/integration/policy/table-ownership.test.ts` (catalog-query pattern as `app_runtime`).
- `scripts/db/bootstrap-roles.sql`, `scripts/ci/bootstrap-local-db.sh`, `.github/workflows/ci.yml` (the `verify` job builds a disposable Supabase stack; `verify-hosted` uses dev).
- `scripts/lint/definer-coverage.ts` and `scripts/lint/sql-statements.ts`.
- `drizzle/0005`, `0013`, `0014`, `0015`, `0019`, `0026` (the five DEFINER functions) and `drizzle/0000` lines 32-43 (the only `FORCE ROW LEVEL SECURITY`).
- `src/app/(auth)/join/[code]/request-ip.ts` and `.env.example` lines 51-59.
- Next.js `instrumentation.ts` guide: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`.
- Supabase docs on the Data API / default privileges (use the Supabase MCP `search_docs` if available; otherwise state your assumption in the PR).

## 4. Current state (verified 2026-10-01 on main @ 3401c94; re-verify before editing)

- Catalog query on `flatmate-io-dev` (done by the auditor): `anon` and `authenticated` hold EXECUTE on `claim_join_code(text, join_code_purpose)`, `resolve_join_code(text)`, `record_join_attempt(text, int, int)`, `resolve_account_household(uuid)`, `casting_round_keeps_applications()`, `rls_auto_enable()`, and SELECT/INSERT/UPDATE/DELETE on all 14 public tables. RLS is enabled on all; FORCE RLS only on `activity_event` (`drizzle/0000_panoramic_bucky.sql:43`).
- Migrations only `REVOKE ALL ON FUNCTION … FROM PUBLIC` then `GRANT EXECUTE … TO app_runtime` (e.g. `drizzle/0005…sql:12-13`, `0014…sql:87-89`, `0019…sql:138-140,208-210`). Supabase's default ACLs grant `anon`/`authenticated` explicitly, so that does not remove them. No file under `drizzle/` or `scripts/db/` names `anon` or `authenticated`.
- **`rls_auto_enable` is not ours.** `grep -rn rls_auto_enable drizzle scripts src tests` finds nothing; it is the helper Supabase installs for its "auto-enable RLS" event trigger. The migration must therefore handle it by catalog lookup, not by a hard-coded `CREATE`/`GRANT` of ours, and it must be skipped when absent (local stack and older projects may not have it). Revoking EXECUTE from `anon`/`authenticated` on it does not stop the event trigger firing (event triggers do not check the DDL caller's EXECUTE privilege); confirm with Supabase docs and state the source in the PR.
- The five definer functions in our migrations: `resolve_account_household`, `resolve_join_code`, `claim_join_code`, `record_join_attempt` (all `search_path = public`), `casting_round_keeps_applications` (`pg_catalog, public`, `0026`).
- `src/` never uses the anon key: `grep -rn "ANON_KEY\|\banon\b" src` only hits a comment in `src/modules/identity/auth-provider.ts:24`. `tests/` and `scripts/` never use `authenticated`. The service role (`SUPABASE_SERVICE_ROLE_KEY`) is used by `tests/integration/policy/join-rate-limit.test.ts` cleanup and by `scripts/ci/bootstrap-local-db.sh` step 8 (PostgREST probe on `join_attempt`). **Do not revoke anything from `service_role`.**
- `supabase/config.toml:21` exposes `public` in the CI stack's Data API, same as Supabase's hosted default.
- Objects are created by the `postgres` role (migrations run as `postgres` via SQL editor/psql; `bootstrap-roles.sql` runs as `postgres`). Supabase's default ACLs live `FOR ROLE postgres IN SCHEMA public` (and `supabase_admin`). Verify with `SELECT defaclrole::regrole, defaclobjtype, defaclacl FROM pg_default_acl;` (run it as a catalog query inside the new test's exploration, not as owner work).
- Production (`cjinhzzvjryojvhngjjn`) is paused at `0012` but already has `resolve_account_household` from `0005`.
- `JOIN_ATTEMPT_TRUSTED_IP_HEADER` is read only at `request-ip.ts:27`. When unset every request shares one rate-limit bucket (global limit, documented as conservative). There is no `src/instrumentation.ts`, no startup assertion, and `.env.example:58-59` leaves it commented out.
- CI `verify` job runs `npm run build` before the database exists and with no database env (`.github/workflows/ci.yml:80`); anything you add that runs at import or build time must not need env.

## 5. Package-specific hazards

- **An invariant holds only where it is enforced** (hazards file): the REVOKE is the second layer behind RLS for DEFINER functions, which run past RLS and answer unauthenticated callers. Test it from the catalog, not from the TypeScript.
- **Migrations**: re-runnable; privilege DDL is human-applied (README rule 5); `DATABASE_URL` is `app_runtime`, so hand-run SQL through it does nothing. Never execute the migration yourself.
- **Tests that can fail**: the new test must be seen red on dev and on a fresh stack before the migration exists, then green after.
- **Tests hit a real database** and `flatmate-io-dev` is shared: a strict failure on dev would block every branch's `pre-push` (data-inventory D5). Mirror D5: strict on a repository-built database, warning on shared hosted dev.
- Do not break Supabase internals: leave `service_role`, `supabase_*` roles, `auth`, `storage`, `extensions` schemas, extension-owned functions and `postgres` alone.

## 6. Plan

### Phase A — characterization / failing tests

Extract first (commit 1, no behaviour change): move `isLocalDatabase()` out of `data-inventory-live.test.ts` into `tests/helpers/live-catalog.ts` (exported `isStrictCatalogCheck()`), import it from both tests. Run `data-inventory-live.test.ts` before and after; green both times. No new characterization test is needed for the helper beyond that.

**A1. `tests/integration/schema/role-grants.test.ts`** (new). Reads `pg_catalog` through `db` (as `app_runtime`; catalog views are world-readable). Use `has_function_privilege(role, oid, 'EXECUTE')` and `has_table_privilege(role, oid, priv)`, which include inherited and PUBLIC grants. Cases:

1. `anon` and `authenticated` have no EXECUTE on any function in schema `public` with `prosecdef = true` (exclude functions that are members of an extension: `NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')`). Failure message lists `role proname(args)`.
2. Neither role has SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on any ordinary or partitioned table or view in `public` (`relkind IN ('r','p','v')`; the view `casting_round_admin_view` counts). Include sequences with USAGE/SELECT/UPDATE.
3. Non-vacuity: the query found at least the four DEFINER functions named in section 4 plus `casting_round_keeps_applications` on a repository-built database (`isStrictCatalogCheck()`); on hosted dev require only that it found at least one.
4. Positive control (guards against over-revoking): `app_runtime` still has EXECUTE on `resolve_account_household(uuid)`, `resolve_join_code(text)`, `claim_join_code(text, join_code_purpose)`, `record_join_attempt(text, integer, integer)` and DML on every table `data-inventory.yml` lists. `service_role` still has SELECT and DELETE on `join_attempt` (the CI probe and a test cleanup use it); skip this one assertion if the role does not exist.
5. Default privileges (the "future objects start closed" claim): `pg_default_acl` rows `FOR ROLE postgres IN SCHEMA public` grant nothing to `anon`/`authenticated` for tables ('r'), functions ('f') and sequences ('S'). Parse with `aclexplode(defaclacl)`. If the role `postgres` has no such entry, pass.

Strictness: use `isStrictCatalogCheck()`: `expect(findings).toEqual([])` when strict, `console.warn("role-grants live check: …")` otherwise. In strict mode the test must be non-vacuous.

Expected status today: **red** (new behaviour). "Seen failing" evidence: (a) run it against dev with `DATA_INVENTORY_LIVE_STRICT=1 npx vitest run tests/integration/schema/role-grants.test.ts` and paste the findings; (b) it is red in CI's `verify` job on the first push before the migration lands (push a commit containing only the test first, see Phase B step 2, and link the failed run). Deliberate break for the positive controls: temporarily `REVOKE`-equivalent cannot be tested without owner work, so break case 4 by asserting a function name that does not exist and confirm red.

**A2. `tests/integration/schema/catalog-shape.test.ts`** (new, #25). Same strictness helper. Cases:

1. For every table loaded by `loadSchemaTables` (scripts/lint/data-inventory.ts) that is exported as a Drizzle table, every policy name from `getTableConfig(table).policies` exists in `pg_policies` for that table (`schemaname='public'`). One direction only, like columns: policies the database has beyond schema.ts are listed as a warning (hand-written migration policies). Failure message names `table.policy`.
2. `relrowsecurity` is true for every ordinary table in `public`. Constant `FORCE_RLS_TABLES = ["activity_event"]` with a comment: add a table here only together with the migration that forces it; `relforcerowsecurity` must be true exactly for these and false for all others.
3. Trigger presence: constant `EXPECTED_TRIGGERS` listing `[table, trigger]` pairs; build it from `grep -n "CREATE TRIGGER" drizzle/*.sql` (today: `session_acting_profile_id_immutable` (0006), `membership_auto_join_open_rounds` (0010), `resident_profile_unremoval_final` (0017), `application_round_same_household` (0023), `casting_round_keeps_applications` (0026)); find each trigger's table in its migration. Assert each exists in `pg_trigger` (`NOT tgisinternal`, `tgenabled <> 'D'`).
4. Every `SECURITY DEFINER` function in `public` that is not extension-owned appears in a constant `KNOWN_DEFINERS` (the five above). A sixth one fails the test with the message "add it to KNOWN_DEFINERS and to the grants coverage in definer-coverage.ts". `rls_auto_enable` is Supabase's: allow it by name in an `IGNORED_PLATFORM_FUNCTIONS` constant with the comment why.

Expected status today: cases 1-3 **green** (characterization of current catalog); case 4 green once `rls_auto_enable` is on the ignore list. Prove each can fail: rename a trigger name in `EXPECTED_TRIGGERS`; add a bogus policy name; flip `FORCE_RLS_TABLES` to `[]`; remove `casting_round_keeps_applications` from `KNOWN_DEFINERS`. Each must turn red. Record the four runs in the PR.

**A3. `tests/unit/identity/join-attempt-startup.test.ts`** (new, #39). Pure function tests for `assertTrustedIpHeaderConfigured(env)` (see Phase B step 6): production + unset -> throws an Error whose message names `JOIN_ATTEMPT_TRUSTED_IP_HEADER`; production + whitespace-only -> throws; production + `x-vercel-forwarded-for` -> ok; production + unset + `JOIN_ATTEMPT_SHARED_BUCKET_OK=1` -> ok; non-production + unset -> ok. Expected: **red** until step 6 (the function does not exist; the import fails). Deliberate break: make the function return without checking; the first case must fail.

### Phase B — change

1. `test(db): add live role-grants and catalog-shape checks` — A1, A2 and the helper extraction. Push this commit alone first so CI's `verify` job shows the red run for A1 (note: pre-push runs `npm run verify` against dev where A1 only warns, so the push succeeds; strict only in the runner stack). If you prefer not to push a red CI run, run the CI stack locally via `scripts/ci/bootstrap-local-db.sh` instructions and attach the output; say which you did.
2. `fix(db): revoke anon/authenticated grants` — create the migration with `npx drizzle-kit generate --custom --name=revoke_anon_authenticated` (produces `drizzle/0028_revoke_anon_authenticated.sql` plus journal and snapshot; check how `0026`/`0027` did it and match). Header comment: HUMAN HAND-OFF, run the whole file in the Supabase SQL editor on `flatmate-io-dev`, production only at go-live. Skeleton (every statement re-runnable; use `--> statement-breakpoint` between statements as the other files do):
   ```sql
   -- 1. Tables, views, sequences: nothing for the Data API roles.
   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
   REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
   -- 2. Functions: only anon/authenticated, never PUBLIC wholesale (policies/CHECKs call
   --    non-definer helpers as app_runtime and need PUBLIC EXECUTE).
   REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
   -- 3. Supabase's own rls_auto_enable() may be granted to PUBLIC; the grants test counts that.
   DO $$ BEGIN
     IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
       REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
     END IF; END $$;
   -- 4. Future objects start closed. Objects are created by `postgres`.
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
   ```
   Decide the owner list from the `pg_default_acl` query in section 4: if `supabase_admin` also has public defaults, add the same three statements inside a `DO` block that catches `insufficient_privilege` (the SQL-editor role cannot always alter another role's defaults) and say in the PR which outcome you saw. If the `ALTER DEFAULT PRIVILEGES` for `postgres` is not what step 4's `pg_default_acl` shows, stop and report (README rule 9).
   Do not touch `service_role` or `app_runtime`. Because step 1 also removes the (unused) PostgREST route to `casting_round_admin_view`, confirm in the PR that nothing calls it via REST.
   **🛑 HUMAN** applies this file on dev, then tells the agent. Until then the tests only warn on dev.
3. `fix(db): mirror the revoke in bootstrap-roles.sql` — append to `scripts/db/bootstrap-roles.sql` (it runs twice in CI, before and after the chain, and on fresh projects, as `postgres`): the same table/sequence/function REVOKEs and `ALTER DEFAULT PRIVILEGES`, each guarded by `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')` so a plain Postgres without Supabase roles still bootstraps. Update the file header sentence about order. Check `rls_auto_enable` handling is also guarded there. Rerun the CI script locally if you have Docker; otherwise rely on the CI run and say so.
4. `test(db): extend definer-coverage with the grants rule` — in `scripts/lint/definer-coverage.ts` add rule `"missing-grants-coverage"`: every current `SECURITY DEFINER` name must appear in `tests/integration/schema/catalog-shape.test.ts`'s `KNOWN_DEFINERS` list (read the file as text, match the quoted names). Add unit cases in the existing lint test for definer-coverage (find it under `tests/unit/lint/`): a fixture migration directory with a new definer function that is absent from the list -> violation; present -> none. Deliberate break: delete a name from the list; `npx tsx scripts/lint/definer-coverage.ts` must exit non-zero. Update `.claude/rules/guardrail-lints.md` row for `definer-coverage.ts` ("…and is listed in KNOWN_DEFINERS of the catalog test").
5. `fix(app): fail startup in production without a trusted client-IP header` (#39). In `src/app/(auth)/join/[code]/request-ip.ts` export `assertTrustedIpHeaderConfigured(env: Record<string, string | undefined>): void`: throws when `env.NODE_ENV === "production"` and the trimmed `JOIN_ATTEMPT_TRUSTED_IP_HEADER` is empty, unless `env.JOIN_ATTEMPT_SHARED_BUCKET_OK === "1"` (explicit, named acknowledgement for a deployment that deliberately runs the global bucket, and for `next start` on a laptop). Create `src/instrumentation.ts` with `export function register()` that, only when `process.env.NEXT_RUNTIME === "nodejs"`, imports the function with a dynamic import and calls it with `process.env` (follow the Next doc you read; it is not called during `next build`, so CI's build is unaffected, verify by running `npm run build` with no env). Update `.env.example` comments (the variable, the acknowledgement flag). Check `openspec/specs/` (`grep -rn "TRUSTED_IP\|x-forwarded" openspec/specs`) and update the spec in the same commit if it states the behaviour.

### Phase C — follow-through

- Confirm `data-inventory.yml` needs no change (no columns added) and the cleanup-inventory test is unaffected.
- `test/guarded.manifest.json`: no G-D entry maps to these tests; do not add one.
- 🛑 HUMAN: apply `drizzle/0028_…` on `flatmate-io-dev`; then the agent runs `DATA_INVENTORY_LIVE_STRICT=1 npx vitest run tests/integration/schema` and expects green on dev.
- 🛑 HUMAN, optional, no code: Supabase dashboard (dev, then prod at go-live) -> Project Settings -> API -> remove `public` from "Exposed schemas" (or disable the Data API). The app only needs Auth and the pooler. Tell the human the consequence: `NEXT_PUBLIC_SUPABASE_URL` still serves `/auth/v1`; only `/rest/v1` changes; the CI stack's `supabase/config.toml` line 21 and the PostgREST probe in `bootstrap-local-db.sh` (step 8) use the REST API with the service role, so leave the CI stack as it is.
- 🛑 HUMAN, production go-live checklist (put it in the PR description, not in `docs/`): apply `0028` after the rest of the chain; re-run `bootstrap-roles.sql`; confirm `resolve_account_household` (live in prod since `0005`) is no longer executable by `anon`; set `JOIN_ATTEMPT_TRUSTED_IP_HEADER` in the production environment; remove `public` from exposed schemas.

## 7. Acceptance criteria

- [ ] `role-grants.test.ts` and `catalog-shape.test.ts` exist, each with a recorded red run (A1 on dev with `DATA_INVENTORY_LIVE_STRICT=1` and/or in CI; A2 by the four deliberate breaks).
- [ ] After the human applies `0028` on dev: `anon`/`authenticated` have no EXECUTE on any DEFINER function and no table/sequence privilege; the positive controls (`app_runtime`, `service_role`) still pass; the full suite is green against dev.
- [ ] Re-applying `0028` and the new `bootstrap-roles.sql` section a second time errors on nothing.
- [ ] CI `verify` (fresh stack) is green with the strict grants test; `bootstrap-local-db.sh` PostgREST probe still returns 200.
- [ ] `definer-coverage.ts` fails for a new definer function missing from `KNOWN_DEFINERS`.
- [ ] In a production-mode start without the header (and without the acknowledgement) the server refuses to start with a message naming the variable; `npm run build` with no env still passes.
- [ ] `npm run verify` green; `node tools/check-refs.ts` unaffected (no `docs/` edits).

## 8. Out of scope & stop conditions

Out of scope: hashing join codes (#31), FORCE RLS on other tables (add only to the constant if a human decides), changing any RLS policy, `search_path` standardisation (WP02), role checks (2b). Stop and report if: `pg_default_acl` does not show `postgres` defaults for `anon`/`authenticated`; the strict grants test cannot be green because Supabase re-grants after the REVOKE (e.g. platform migrations); any test turns out to use `anon`/`authenticated`; the Next.js `instrumentation.ts` is not callable on the production runtime you can determine; you need to touch `docs/`.

## 9. Hand-back report

```
WP01 hand-back
Branch / PR:
Commits (hash + message):
Red-run evidence: A1 dev strict (paste findings) / CI run URL; A2 four breaks (what, red/green)
Migration file(s) for the human: drizzle/0028_… (applied on dev: yes/no, by whom, when)
pg_default_acl as observed (owner roles found, ALTER DEFAULT PRIVILEGES outcome):
rls_auto_enable: present on dev? source of "safe to revoke":
Verify output (pass/fail counts, duration):
Spec/openspec files updated:
Open questions / skipped:
Go-live checklist (pasted into PR): yes/no
```
