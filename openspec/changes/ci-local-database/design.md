# Design

## Context

See `proposal.md` (Why) for the motivation and the nine human decisions this design carries out.
The facts below were checked on 2026-09-26. They are the constraints the decisions have to fit.

- **Hosted dev runs Postgres 17, image `17.6.1.166`** (Supabase `get_project`), and **GoTrue
  `v2.197.0`** (`/auth/v1/health`).
- **Supabase CLI `v2.118.0`** (released 2026-09-25) ships the TypeScript CLI (`apps/cli` in
  `supabase/cli`, pre-mortem 2026-09-26). It defaults to `supabase/postgres:17.6.1.171` and
  `supabase/gotrue:v2.197.0`. Its local pooler is **Supavisor** (`supabase/supavisor:2.9.13`),
  with transaction mode as the default. The tenant id is hardcoded to `pooler-dev`, so a user
  connects as `<role>.pooler-dev`. The pooler authenticates any role that can log in and has a
  password, through `pgbouncer.get_auth`.
  - *Read from the CLI's source, not yet run:* that `app_runtime.pooler-dev` actually connects.
    Task 5.4 proves it before anything else depends on it.
- **The CLI pins image versions only through files in `supabase/.temp/`** (`postgres-version`,
  `gotrue-version`, …, each a bare tag). `config.toml` has no image field, and
  `[db] major_version` is its only version knob. The mechanism is internal to the CLI, not a
  documented contract. The pin is honoured today (`command-internal/db-image.ts`: read,
  trimmed, applied when major > 14).
- **The local API keys are the CLI's fixed public defaults**, not per-run keys: a fixed JWT
  secret, and the same demo `ANON_KEY`/`SERVICE_ROLE_KEY` on every machine. They are local-only,
  so they are harmless, but they aren't secrets and aren't generated per run. Only the
  `app_runtime` password and `SESSION_TOKEN_HASH_SECRET` are generated per run (spec, as amended).
- **`supabase status -o env` quotes its values** (`KEY="VALUE"`) and prints `Stopped services:
  […]` on stderr whenever services are excluded. D4 therefore parses `-o json`.
- **PostgREST sees tables created after start:** the PG17 image ships the `pgrst_ddl_watch`
  event trigger, and default privileges grant `service_role` on `postgres`-created tables.
- **The suite needs Auth, PostgREST and Postgres.**
  - Auth: 14 test files create users or sign in.
  - PostgREST: `serviceRoleClient().from("join_attempt")` in
    `tests/integration/policy/join-rate-limit.test.ts` and
    `tests/integration/raw-sql/record-join-attempt.test.ts`.
  - It uses no Storage, Realtime or Edge Functions.
- **`app_runtime` is created by `scripts/db/bootstrap-roles.sql`, not by a migration.** That file
  is idempotent, and its own header says to run it again after the chain, so the table grants
  cover everything.
- **The chain applies cleanly in order.** `drizzle/meta/_journal.json` lists all 23 files,
  `0000`–`0022`. None uses `CONCURRENTLY`. The two `ADD VALUE` files (`0009`, `0016`) don't use
  the new value in the same file.
- **The runner image `ubuntu-24.04` ships the psql 16.15 client and Docker 28.** The workflow
  pins `ubuntu-24.04` rather than `ubuntu-latest`, so that stays true.
- **`npm run verify` fails on the human's machine today.** `eslint .` also reads the worktree
  copies under `.claude/worktrees/`: 26 files with errors from two stale worktrees. *(Corrected
  during apply, task 1.2: `tsc --listFiles` showed that `tsc` never read them, since its glob
  skips dot-directories. Only ESLint was affected. The `tsconfig.json` exclude stays as a
  harmless, explicit statement of intent.)* Nothing in `src/` is wrong. A pre-push hook would block every
  push until this is fixed (D8).
- **Baseline** (PR #26, run `36149332683`): the `npm run verify` step took 344 s, the job 6 min
  17 s.

## Goals / Non-Goals

**Goals:**
- A PR run that tests the same schema, roles, RLS policies, pooler mode and Auth version as
  hosted dev, and reaches nothing outside the runner.
- Every difference between the runner and hosted dev is either pinned, asserted at start-up, or
  named in Risks below.
- A go/no-go answer (decision 9): the PR `verify` job at ≤ 3 min, median of 3 runs, or the
  experiment doesn't merge (D11).
- An experiment that can be undone in one step, before or after the merge (D11).

**Non-Goals:**
- Changing any test, timeout, `tests/setup.ts` or `src/` file. If a test fails only in the runner,
  that is a finding (Risks), not something to edit.
- A local database for developers (decision 1). `supabase/config.toml` is for CI. Nothing in the
  repo points `.env.local` at it, and no npm script starts it.
- G-E2's `up → down → up` cycle (proposal Assumption 4).
- The per-query round-trip work (decision 7, change 8).

## Decisions

### D1 — The Supabase CLI stack, trimmed, not a bare Postgres service

CI starts the stack with `supabase start`, using the CLI installed by `supabase/setup-cli@v3` with
`version: 2.118.0`. It excludes every service the suite doesn't use:

```
-x realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,mailpit
```

It keeps `gotrue`, `kong` (the `http://127.0.0.1:54321` gateway that `supabase-js` talks to),
`postgrest` and `supavisor`.

*Alternative, rejected:* a `postgres` service container plus a GoTrue container. That means
rebuilding what the CLI stack already provides and hosted dev also has: the `auth` schema, the
`anon`/`authenticated`/`service_role` roles, default privileges, `pgbouncer.get_auth`, and Kong's
routing. Each would become a new difference from hosted.

### D2 — Versions: pin files committed, copied into `.temp/`, then asserted

- **The pins.** `supabase/pins/postgres-version` holds `17.6.1.166`, and
  `supabase/pins/gotrue-version` holds `v2.197.0`. Before `supabase start`, the workflow copies
  both into `supabase/.temp/`.
- **Why not commit `.temp/` itself:** the CLI owns that folder, it writes link state there, and
  the CLI's own `.gitignore` lists it.
- **The CLI version** is pinned in the workflow, which also pins the defaults the files don't
  cover, the pooler image among them.
- **`[db] major_version = 17`** in `config.toml`.

Because the `.temp/` mechanism is internal to the CLI, the bootstrap script (D4) **asserts** the
running versions before any test starts:
- `docker inspect supabase_db_flatmate-io-ci --format '{{.Config.Image}}'` must end in exactly
  `:<postgres pin>`, and the same holds for `supabase_auth_flatmate-io-ci` and the GoTrue pin;
- `GET /auth/v1/health` must report exactly the GoTrue pin.

The Postgres check compares the **image tag**, not `select version()`: `17.6` would also match
the CLI default `.171` (pre-mortem finding 4). A CLI release that ignores the files therefore
fails loudly instead of testing a silently different stack.

**Catching drift the other way** (hosted dev moving past the pins): the `verify-hosted` job (D5)
ends with a step that compares hosted dev's `/auth/v1/health` version, and its `server_version`
major.minor, with the pin files. On a mismatch the step **fails**. **Its limit:** `server_version`
shows `17.6` for every `17.6.1.x` image, so a patch-level image move at hosted dev (`.166` →
`.2xx`) goes unseen. Reading the exact image would need a Management-API token, which would be a
new secret. Accepted: whoever bumps the pins re-reads the exact image with Supabase `get_project`
(`supabase/pins/README.md`), and major.minor drift, the kind that changes behaviour, is caught. That job never gates a PR, so
a failure is a visible signal on `main` to bump the pins on purpose, never a merge blocker.
`isEmailTakenError` is never touched to make up for a difference (decision 5).

*Alternative, rejected:* no pins, only the CLI version. The CLI's Postgres default is already
`.171`, not `.166`, and the next CLI release would move Auth without anyone deciding to.

### D3 — `supabase/config.toml`, written for CI only

It is generated with `supabase init` and then edited down to what matters:
- `project_id = "flatmate-io-ci"`.
- `[db] major_version = 17`, and `[db.seed] enabled = false`. There is no `supabase/migrations/`
  directory, so the CLI applies nothing itself. The schema comes from D4 only.
- `[db.pooler]`: `enabled = true`, `pool_mode = "transaction"`, `default_pool_size = 15` and
  `max_client_conn = 200`, both **copied from hosted dev** (its shared pooler, read from the
  dashboard by the human on 2026-09-26, task 4.1). At most 8 workers × 10 client connections = 80
  fit under 200. The backend-connection count is what
  `session-context-set-config.test.ts` (same backend within 20 tries) and the accidental
  serialisation noted in `join-rate-limit.test.ts` depend on, so it matches hosted dev rather
  than being chosen for headroom.
- `[auth.rate_limit]`: `sign_in_sign_ups`, `token_refresh` and `token_verifications` set to
  `10000`, well above what one run uses. (The defaults, 30 / 150 / 30 per 5 min per IP, would
  throttle the suite, and the runner is a single IP.)
- `[auth]`: `minimum_password_length = 6`, the value probed against hosted dev
  (`JOIN_PASSWORD_MIN_LENGTH` in `src/modules/identity/auth.ts`); `enable_signup = true`. Email
  confirmation plays no part: every account is created with `email_confirm: true`.
- `supabase/.gitignore` (from `supabase init`) is committed, and it keeps `.temp/`,
  `.branches/` and `.env` out.

A comment at the top of `config.toml` states that it describes the CI runner's stack, that local
work stays on hosted dev, and why (decision 1).

### D4 — `scripts/ci/bootstrap-local-db.sh`: guard, build, assert, export

A bash script that runs only in the CI job. In order:

1. **Guard.** It reads `supabase status -o json`, parsed with `node -e` (never `grep`/`cut` on
   the quoted env form). Unless the `DB_URL` and `API_URL` hosts are
   `127.0.0.1` or `localhost`, it exits non-zero before any SQL runs (spec: *No run of the suite
   reaches production*).
2. **Roles.** It runs `psql -v ON_ERROR_STOP=1 -f scripts/db/bootstrap-roles.sql` as `postgres`
   against `DB_URL`, then `ALTER ROLE app_runtime WITH PASSWORD '<pw>'`. The password is
   `openssl rand -hex 24`, masked with `::add-mask::`.
3. **Chain.** Each file under `drizzle/` is applied in `_journal.json` order (read with `node -e`),
   one `psql -v ON_ERROR_STOP=1 --single-transaction -f` per file. The first failure stops the
   script and names the file. One transaction per file matches how the human applies a file (the
   whole file at once), and a failing file leaves nothing half-applied.
4. **Roles again**, as `bootstrap-roles.sql`'s header asks, so the grants cover every table.
5. **Assert** the running images and the Auth version (D2).
6. **Probe the pooler path.** Through `127.0.0.1:54329` as `app_runtime.pooler-dev`, it runs
   `select current_user, (select rolbypassrls from pg_roles where rolname = current_user)`. That
   must return `app_runtime | f`. Postgres has no role named `app_runtime.pooler-dev`, so a
   successful login under that name proves the connection went through Supavisor (decision 4).
   It also proves RLS will apply.
7. **Probe PostgREST.** `GET $API_URL/rest/v1/join_attempt?select=id&limit=1`, with the service
   key, must answer `200`. `join-rate-limit.test.ts:27` ignores its cleanup delete's error, so a
   cold schema cache would otherwise pass silently.
8. **Export** to `$GITHUB_ENV`:
   - `DATABASE_URL=postgresql://app_runtime.pooler-dev:<pw>@127.0.0.1:54329/postgres`;
   - `NEXT_PUBLIC_SUPABASE_URL=$API_URL`;
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY`;
   - `SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY` (the CLI's public local default, so masking
     it isn't needed);
   - a random `SESSION_TOKEN_HASH_SECRET` (masked).

**Why psql, not `drizzle-kit migrate`:** hosted dev was built by running these files by hand as
`postgres`. Running them the same way tests that path, and writes no `__drizzle_migrations` table
that hosted dev lacks. The fallback, if the psql 16 client ever trips over a PG17-only statement,
is `docker exec supabase_db_flatmate-io-ci psql …`, with the same flags.

**Why bash, not TypeScript:** it runs only on the Linux runner, it runs psql and the CLI, and it
must not need `.env.local` or `tsx` loading.

### D5 — The workflow: one gate job per PR, one hosted signal job on `main`

The triggers stay as they are (push to `main`, PR to `main`).

- **`gitleaks`** is unchanged.
- **`verify`** runs on every PR and on every push to `main`:
  0. `runs-on: ubuntu-24.04` (see Context);
  1. checkout, setup-node, `npm ci`, `npm run build`;
  2. `supabase/setup-cli@v3` (`version: 2.118.0`);
  3. copy the pins, then `supabase start -x …` (D1);
  4. `scripts/ci/bootstrap-local-db.sh`;
  5. `npm run verify`;
  6. `node tools/check-refs.ts`.

  It references **no** `secrets.*`. `VITEST_MAX_WORKERS` is left unset (the runner's default is 3
  workers). The suite is no longer waiting on the network, so more workers than cores no longer
  pays. Task 8.4 measures 3 against 4 once and records the result. A timing step writes the stack
  start-up time and the `npm run verify` time to `$GITHUB_STEP_SUMMARY`. The job gets
  `timeout-minutes: 20`. That limit is on the job, not a test timeout, so G-G1 is not touched.
- **`verify-hosted`** runs only when `github.event_name == 'push'` (which with these triggers means
  `main`):
  - today's steps, unchanged: the same secrets, `VITEST_MAX_WORKERS: "8"` and the hardcoded dev
    URL and anon key;
  - then the pin-drift step (D2);
  - `concurrency: { group: hosted-dev, cancel-in-progress: false }`, so two quick merges queue
    instead of hitting the Auth 429 together.

  A PR never runs it (spec: *The hosted run never gates a pull request*). It has no `needs:`, so a
  red `verify` doesn't hide what hosted dev says.

*Alternative, rejected:* a `workflow_dispatch` or nightly hosted run. The human chose "on push to
`main`" (decision 6). A nightly run would miss the one case this job exists for: a
`--no-verify` push, seen on the day it lands.

### D6 — Docker image caching: measured, kept only if it wins

The CLI pulls from `public.ecr.aws/supabase` (AWS, close to US runners). Caching several GB with
`docker save`/`load` through `actions/cache` can easily be slower than pulling. So task 8.4,
after the first green run, measures a cold pull first. It then tries a cache keyed on the CLI version plus both pin files,
and keeps the cache only if the whole job is faster. The numbers from both variants go into the PR
description and into this design's Migration Plan. The spec doesn't depend on the outcome.

**Warm or cold.** A PR's cache is scoped to its merge ref, so a PR's first run is cold until
`main` has saved a cache. From then on every PR restores `main`'s cache and runs warm. The
steady state is therefore warm, and the go/no-go median (D11) is taken over warm runs. One cold
run is reported next to it, for information. If the cache is dropped, warm and cold are the same.

### D7 — `.husky/pre-push`

It contains the one command `npm run verify` and a comment citing decision 2. husky's hooks run
under Git Bash on the human's Windows machine, just as `pre-commit` does today. The only bypass is
`git push --no-verify`, and CI's run against hosted dev is the backstop for that case (`verify-hosted`, or the PR
`verify` job again on a no-go). Known costs, accepted by decision 2:
- about 1.5–2 min per push (the full suite measured 82–90 s on 2026-09-26);
- ~~an Auth 429 when a push follows a manual run within about 5 minutes~~ gone since
  2026-09-26: the human raised dev's "sign-ups and sign-ins" **and** "token refreshes" limits to
  1000 per 5 min. GoTrue applies the token-refresh limit to every `/token` call, password grants
  included (Auth logs: a ~30 burst, then ~150 per 5 min). Two back-to-back full runs were green
  afterwards;
- deleting a remote branch and pushing a tag also run the full suite;
- the hook tests the **working tree**, not the commit being pushed, so uncommitted edits count.
  That is husky's normal behaviour, and it's accepted.

### D8 — `.claude/**` out of ESLint and tsc (human approval 2026-09-26, G-G3)

`.claude/**` joins `globalIgnores` in `eslint.config.mjs` and `exclude` in `tsconfig.json`, each
with a comment:
- `.claude/` holds tool state and worktree copies of the repository, never source;
- the human approved the change on 2026-09-26 under G-G3.

No file that ESLint or tsc checks today in the real tree stops being checked (task 1.2: 243
files before and after outside `.claude/`). The worktrees'
own files are checked in their own worktree. This also closes item (1) on the plan's "Open with
the human" list.

*Alternative, rejected:* deleting the two stale worktrees. It works until the next session creates
one.

### D9 — Docs that would otherwise lie

- **`CLAUDE.md`**:
  - the sentence "Tests hit a real Supabase instance … specifically `flatmate-io-dev`" gains:
    PR CI runs against the runner's local stack, and local runs and `verify-hosted` run against dev;
  - the 260–350 s CI figure is replaced by the measured one;
  - the Commands block gains the pre-push hook.
- **The `vitest.config.ts` `maxWorkers` comment** describes both jobs (a comment change only).
- **The `.github/workflows/ci.yml` comments**: the "Since 2026-09-18 this is the flatmate-io-dev
  project" block moves to `verify-hosted`.
- **`.env.example`** gets one line saying CI builds its own environment, and that this file is for
  hosted dev.
- Nothing under `docs/` changes (Rule 7). No `docs/` file states where CI's database lives.

### D10 — Invariants and writers (the design rules)

- This change adds no invariant, no read-then-write and no provider call to the application. No
  `src/` file changes, so the rules on paths to guarded state, serialisation and
  Postgres/Auth boundaries have nothing new to cover.
- The one shared state it touches is **the rows that test runs write into hosted dev**. Three
  writers: local runs, the pre-push hook (the same thing, from the same machine), and
  `verify-hosted`.
  - `verify-hosted` runs are serialised against each other by the `hosted-dev` concurrency group.
  - A `verify-hosted` run and a local run are **not** serialised against each other. Each test
    uses its own freshly created household, and cleanup is per household, so they don't collide
    on data. They can share the Auth 429 budget only if they overlap in time. Accepted: that job
    never gates a merge (proposal, Assumption 5).
- The PR job writes only to its own database, which exists only for that run.

### D11 — The experiment gate and how it is undone (human decision 2026-09-26)

**What is measured.** The duration of the `verify` *job* (its `startedAt` → `completedAt` from
`gh run view --json jobs`), not a single step. That is the same measure as the baseline: 6 min
17 s, run `36149332683`. It is measured on 3 **new** runs of the draft PR, triggered by empty commits. Re-runs keep
the run id, and `gh run view <id>` shows only the latest attempt. The configuration is the final
one (after D6's cache choice and the worker choice in task 8.4), the runs are warm (D6), and the
median counts. A run that failed doesn't count, and is replaced.

**The bar.** A median of **≤ 180 s** is *go*. Anything above is *no-go*. The applier reports the
three numbers and the median, and **the human** makes the call. The applier never merges and
never decides for the human.

**The commits are split so either outcome takes one step.** On `feat/ci-local-database`, in
this order:

0. **Record commits**: `openspec/changes/ci-local-database/**` only, the artifacts first, then
   tick marks and the measured numbers. They are never reverted, whatever the outcome, so the
   change's record (and on a no-go, the experiment's numbers) survives.
1. `4f40e84` `allowedDevOrigins` from `.env.local` (already there, a keeper).
2. **Keepers commit.** `eslint.config.mjs`/`tsconfig.json` (D8), `.husky/pre-push` (D7), and
   the `CLAUDE.md` lines about those two alone.
3. **Experiment commit(s).** `supabase/`, `scripts/ci/`, `.github/workflows/ci.yml`, the
   `vitest.config.ts` comment, the `.env.example` CI note, and the `CLAUDE.md` lines about where
   CI runs. Nothing a keeper needs lives here. Fix-ups during the measurement are separate commits
   under the same rule, and they touch experiment files only: the three `ci: measure` empty commits,
and the `CLAUDE.md` timing figure. Every experiment SHA is listed in the PR description, and a
revert names them all.

**No-go, before the merge** (the expected path, since the measurement happens on the draft PR):
every listed experiment commit is reverted on the branch (`git revert`, never a rewrite of
pushed history). The PR then carries only the keepers, and `ci.yml` is byte-identical to `main`'s.
Merged that way, the change is archived with `openspec archive ci-local-database --skip-specs`,
since the capability was never delivered (tasks 4–8 stay unticked on purpose), and its design keeps the measured numbers as the frozen record of the experiment. The
plan's section 7 gets the numbers and the outcome, so nobody reruns the same experiment blind.

**Rollback after the merge** (a *go* that disappoints later): one `git revert` of the listed
experiment commits on a branch off `main`. That restores today's single hosted `verify` job exactly.
Nothing outside those files depends on them: no npm script, no test and no `src/` file uses
`supabase/` or `scripts/ci/`. The secrets were never removed, so the reverted job works at once.
If the spec was already synced to `openspec/specs/tooling/ci-database/`, the same revert PR
removes it (CLAUDE.md: a fix that changes specified behaviour updates `openspec/specs/` in the
same commit).

*Alternative, rejected:* measuring after the merge. It would make a *no-go* a revert on `main`
instead of a revert on a branch that has not landed.

## Risks / Trade-offs

- **[Supavisor refuses `app_runtime.pooler-dev`]** → Task 5.4 proves the pooler login before
  anything else is built on it. If the login fails and a `config.toml` setting can't fix it, the
  applier stops and reports to the human. Falling back to a direct connection would silently undo
  decision 4.
- **[Local GoTrue answers differently from hosted, even at the same version]** (config defaults,
  Kong in front) → The suite fails in the PR job. The applier reports which test and which
  response, and changes a `config.toml` setting if one explains the difference. Never an
  assertion, never `isEmailTakenError` (decision 5, G-G1).
- **[A test was passing only because hosted dev is slow]** (a race hidden by latency) → That is a
  genuine bug surfacing, and it gets reported as a finding with the test name. It isn't retried or
  skipped (G-G2).
- **[The `.temp/` pin mechanism changes in a CLI release]** → The CLI version is pinned, and D2's
  start-up assertion fails loudly if a pin isn't honoured.
- **[The psql 16 client against a PG17 server]** → Plain SQL files. The `docker exec` fallback is
  named in D4.
- **[Kong routes to an upstream we excluded]** → We exclude nothing Kong routes the suite's
  requests to (`/auth/v1`, `/rest/v1`).
- **[The bar is missed]** → A *no-go* under D11: the experiment is reverted on the branch, and
  the keepers merge alone. The numbers are recorded, not hidden.
- **[Patch-level image drift at hosted dev goes unseen]** → Accepted, see D2's limit. It is
  re-read whenever the pins are bumped.
- **[The median is noisy]** (GitHub runners vary) → 3 runs, median. A result within about 10 s of
  the bar is reported as borderline, and the human decides.
- **[The pre-push hook annoys enough to be bypassed habitually]** → Visible in `verify-hosted`
  runs on `main`. Whether to keep the hook then is the human's call, not something to change
  quietly (decision 2).

## Migration Plan

1. The branch is pushed as a draft PR. Its own PR runs are the first real test of the `verify`
   job and the go/no-go measurement (D11). `verify-hosted` doesn't run on them.
2. The human makes the go/no-go call. On a *no-go*, D11's before-merge path applies, and the
   steps below do not.
3. After the human merges, the first push to `main` runs both jobs, and `verify-hosted` shows the
   pin-drift step green.
4. No repository setting or secret changes. Rollback after the merge is D11's single revert.
5. *Measured timings (cold, warm, workers 3 against 4, the 3-run median) are filled in here by
   task 8.5, as a record commit.*
