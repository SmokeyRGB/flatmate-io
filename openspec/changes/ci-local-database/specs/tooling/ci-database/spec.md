## Purpose

Where each run of the test suite gets its database: a pull request in CI, a push to `main`, a
developer's machine, and the pre-push hook. It also covers what the database a pull request runs
against has to match, so that a green run means what it would mean against the hosted project.

## ADDED Requirements

### Requirement: A pull request runs the full suite against a database inside the runner

Every CI run for a pull request SHALL run the complete `npm run verify` (every lint, the type
check, the cross-reference check and every test file) against a database created for that run,
inside the runner. It SHALL NOT run a reduced or selected set of tests. It SHALL NOT reach
`flatmate-io-dev` or production. Source: human decision 2026-09-25 (F2 plan, section 7, decision
3).

#### Scenario: Every test runs on a pull request
- **WHEN** CI runs for a pull request
- **THEN** it runs every test file the suite contains, with the same assertions and timeouts as a
  local run, and the run fails if any of them fails

#### Scenario: No hosted database on a pull request
- **WHEN** CI runs for a pull request
- **THEN** no connection is made to `flatmate-io-dev` or to the production project

#### Scenario: Each run starts empty
- **WHEN** CI runs for a pull request
- **THEN** the database it tests against holds no rows left by an earlier run

### Requirement: The runner's database is built only from the repository

The runner's database SHALL be built from nothing but files in the repository: the role
bootstrap (`scripts/db/bootstrap-roles.sql`), then every migration under `drizzle/` in journal
order. A migration that fails to apply SHALL fail the run before any test starts. Source:
`docs/GUARDRAILS.md` G-E3 (*„Die Migrationskette ist die einzige Wahrheit"*).

#### Scenario: A broken migration fails the run
- **WHEN** a migration under `drizzle/` cannot be applied to a database that holds every earlier
  one
- **THEN** the pull request's CI run fails at that migration, and no test runs

#### Scenario: A schema object that exists only in hosted dev is caught
- **WHEN** a test depends on a database object that no file in the repository creates
- **THEN** that test fails on the pull request's CI run

### Requirement: The runner's database matches hosted dev where the suite depends on it

The database a pull request runs against SHALL:
- be reached by the application role `app_runtime` through a pooler in transaction mode, as the
  application reaches hosted dev;
- run the Postgres major version and the Supabase Auth version that hosted dev runs, each pinned
  in the repository;
- impose no Auth rate limit that a single run of the suite can reach.

A difference in behaviour between the pinned Auth version and hosted Auth SHALL NOT be resolved
by loosening an assertion or an error match in the application. Sources: human decisions
2026-09-26 (F2 plan, section 7, decisions 4 and 5); `docs/GUARDRAILS.md` G-G1.

#### Scenario: The guarded pool-reuse tests run behind a pooler
- **WHEN** the pull request's run executes the G-D10 tests
- **THEN** their connections go through a transaction-mode pooler, not directly to Postgres

#### Scenario: Versions only move on purpose
- **WHEN** the Postgres or Auth version used by pull-request runs changes
- **THEN** that change is a visible edit to a pinned version in the repository, never an update
  pulled in by the tooling

#### Scenario: No rate-limit failures
- **WHEN** two pull-request runs follow each other immediately
- **THEN** neither run fails on an Auth rate limit

### Requirement: A pull-request run needs no repository secret

A CI run for a pull request SHALL read no repository secret. Every password and secret it
creates (the application role's password, the session-token hash key) SHALL be generated for that
run and SHALL NOT be written to the repository. The only other keys it uses SHALL be the local
stack's public, local-only defaults, which grant nothing outside the runner. Source:
`docs/GUARDRAILS.md` G-A1/G-A2; human decision 2026-09-26 (decision 6).

#### Scenario: A pull request passes without secrets
- **WHEN** CI runs for a pull request in a context where repository secrets are unavailable
- **THEN** the run still sets up its database and runs the full suite

### Requirement: A push to main also runs the full suite against hosted dev

On every push to `main`, CI SHALL additionally run the complete `npm run verify` against
`flatmate-io-dev`. That run SHALL NOT be part of a pull request's checks, so it never blocks a
merge. Its failure SHALL show as a failed run on `main`. Source: human decision 2026-09-26
(decision 6).

#### Scenario: A push with a skipped hook is still checked against hosted dev
- **WHEN** a commit reaches `main` whose author skipped the pre-push hook
- **THEN** CI runs the full suite against `flatmate-io-dev` for that commit

#### Scenario: The hosted run never gates a pull request
- **WHEN** CI runs for a pull request
- **THEN** no job against `flatmate-io-dev` is among its checks

### Requirement: Local runs and the pre-push hook use hosted dev

A test run on a developer's machine SHALL keep using the database that the developer's
`.env.local` names, which is `flatmate-io-dev`. Before every `git push`, a hook SHALL run the
complete `npm run verify` and SHALL stop the push if it fails. Nothing in this capability SHALL
point local runs at a local database. Source: human decisions 2026-09-25 (F2 plan, section 7,
decisions 1 and 2).

#### Scenario: A failing suite stops the push
- **WHEN** a developer runs `git push` and `npm run verify` fails
- **THEN** nothing is pushed

#### Scenario: Local runs are unchanged
- **WHEN** a developer runs `npm run verify` or `npm test` on their machine
- **THEN** it talks to the project named in `.env.local`, exactly as before this change

### Requirement: No run of the suite reaches production

No test run, in CI or locally, SHALL use the production project. The existing refusal in the test
setup SHALL stay. The script that prepares the runner's database SHALL refuse any database host
other than the runner's own, and SHALL copy no data from any hosted project. Sources: the
production refusal in `tests/setup.ts` (2026-09-18); `docs/GUARDRAILS.md` G-B2.

#### Scenario: The setup script refuses a remote host
- **WHEN** the runner's database setup is pointed at any host other than the runner's own
- **THEN** it stops before running any SQL
