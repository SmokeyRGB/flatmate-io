-- Bootstrap for a fresh Supabase project. Run this ONCE, as `postgres`, BEFORE the first
-- migration in drizzle/.
--
-- Why it is not a numbered migration: drizzle/0005_identity_login_bootstrap_function.sql does
-- `GRANT EXECUTE ... TO app_runtime`, so the role has to exist before the chain starts. A
-- migration appended at the end cannot satisfy that, and migration numbers are never renumbered.
--
-- Why it exists at all: until 2026-09-18 nothing in this repo could bootstrap a fresh database.
-- The `app_runtime` role and its table grants had only ever been created by hand in the Supabase
-- dashboard of the first project, so the schema was reproducible but the role it depends on was
-- not — drizzle/0000_panoramic_bucky.sql:41 already assumes the role exists, and
-- tests/integration/policy/table-ownership.test.ts asserts its exact name.
--
-- Everything here is idempotent, so it is safe to replay against an existing project.
--
--   psql "$MIGRATION_DATABASE_URL" -f scripts/db/bootstrap-roles.sql
--
-- Afterwards, set the role's password out of band (Supabase SQL editor, or psql) — deliberately
-- NOT in this file, so no credential ever lives in the repo:
--
--   ALTER ROLE app_runtime WITH PASSWORD '<generated>';

-- G-C2 / Minimal-Gate item 5: the application connects as a role that RLS actually applies to.
-- NOBYPASSRLS is the entire point — `postgres` has BYPASSRLS and would render every policy in
-- drizzle/ decorative. LOGIN without a password cannot authenticate until one is set above.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    create role app_runtime with login nobypassrls inherit;
  end if;
end
$$;

-- USAGE only, never CREATE: app_runtime performs DML, migrations perform DDL as postgres.
grant usage on schema public to app_runtime;

-- Run again after the migration chain so existing tables are covered; ALTER DEFAULT PRIVILEGES
-- covers everything a later migration creates, which is what stops this drifting again.
grant select, insert, update, delete on all tables in schema public to app_runtime;
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_runtime;
