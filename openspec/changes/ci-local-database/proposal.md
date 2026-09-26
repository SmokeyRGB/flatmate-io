# Proposal

## Why

The `verify` job in `.github/workflows/ci.yml` runs on a GitHub-hosted `ubuntu-latest` runner in
the US, and every integration test talks to `flatmate-io-dev` in `eu-west-1`. Measured on PR #26
(run `36149332683`, 2026-09-25), the `npm run verify` step alone took **344 s**, and the job
**6 min 17 s**. The same suite takes about 45 s from the human's machine in the EU. The distance
also causes failures that have nothing to do with the code:
- Supabase Auth answers `/token` with 429 when two runs follow each other closely, and `signIn`
  reports every Auth error as "Invalid credentials" (PR #23, #26).
- There are occasional `fetch failed` errors.
- A cancelled or timed-out run leaves households and Auth users behind in the shared dev project.

The human decided the shape on 2026-09-25 and settled its open questions on 2026-09-26. Both are
recorded in the F2 plan, section 7. This proposal carries those decisions, it does not reopen
them. It is run as an **experiment** (decision 9): it lands only if the speed-up is worth the
lost fidelity.

1. Local development and local test runs **stay on the hosted `flatmate-io-dev`**. They are the
   check that catches hosted-version drift, which a local database would hide.
2. A **husky `pre-push` hook runs `npm run verify`** against dev, so the hosted run binds locally.
   Only a deliberate `--no-verify` skips it.
3. **PR CI runs the full suite**, not a reduced set, against a disposable database in the runner.
4. That database runs **behind a transaction-mode pooler**, like production, so G-D10 still
   proves leak-freedom under a pooler and `prepare: false` stays exercised.
5. The runner's **Postgres and Auth versions are pinned to hosted dev's** (Postgres 17, image
   `17.6.1.166`; GoTrue `v2.197.0`, both read from the dev project on 2026-09-26).
   `isEmailTakenError` in `src/modules/identity/auth.ts` is never loosened to make CI pass.
6. A **second job runs the full suite against hosted `flatmate-io-dev` on push to `main` only**.
   It never runs on a PR, so it never blocks one. It keeps the dev secrets, and the PR job needs
   none.
7. The per-query round-trip performance work is **change 8**, not part of this one.
8. `.claude/**` is ignored by ESLint and excluded from `tsc` (G-G3 approval, 2026-09-26).
9. **This is an experiment with a go/no-go gate (2026-09-26).** Testing PRs against a local
   database instead of the real one is a trade-off, and it is worth it only if CI becomes
   noticeably faster. The bar: the PR `verify` job runs in **≤ 3 min end to end**, including
   stack start-up, as the median of 3 runs on the draft PR (today: 6 min 17 s). Below the bar,
   the experiment does not merge. Above it, the experiment stays revertible after the merge with
   one `git revert`. Either way, three parts land because they are useful on their own: the
   `.claude/**` ignore (8), the pre-push hook (2), and the `allowedDevOrigins` commit already on
   the branch.

   **Amended by the human, 2026-09-26, after the first green run** (run `36235230828`, cold,
   no image cache: job 230 s = 3 min 50 s, −39 % against the baseline; stack start-up 92 s,
   `npm run verify` 95 s). The human's words: *"I think 3 min 50 is still better than 6 min 20.
   Its fine if you think the tests provide the same quality as testing against the live
   database."* The main session's assessment, given before the call: equivalent for the PR gate
   **as long as** the pre-push hook and `verify-hosted` stay. The only real loss is a hosted-only
   failure after a `--no-verify` push, which surfaces after the merge instead of before.
   **Decision: go.** The ≤ 180 s bar no longer gates. The deliberate breaks (8.3) and the tuning
   (8.4) still run, and 8.5 still records the final median.

This change serves no `FR`/`AC` requirement and no `S-*` scope line. It is delivery
infrastructure: the automated half of the guardrails (`docs/GUARDRAILS.md`, 🟢 *„CI oder Lint
schlägt fehl"*) is only as useful as the CI that runs it.

## What Changes

- **A Supabase CLI project config, `supabase/config.toml`**, describing the local stack CI starts:
  - only the services the suite uses: Postgres, Auth, the API gateway in front of them, and the
    pooler;
  - the pooler in transaction mode;
  - Auth rate limits high enough that the suite never hits them;
  - Auth settings matching what the suite relies on in hosted dev (sign-up allowed, no email
    confirmation, the same minimum password length).

  Nothing in it holds a secret. The local stack's API keys are the CLI's public, local-only
  defaults, the same on every machine and useless outside the runner.
- **Pinned versions** for the local stack's Postgres and Auth images, and for the Supabase CLI
  itself, in files CI reads. Moving a pin is a deliberate edit, never a side effect.
- **A bootstrap script, `scripts/ci/bootstrap-local-db.sh`**. Against the fresh local database,
  it:
  1. runs the existing `scripts/db/bootstrap-roles.sql` as `postgres`;
  2. gives `app_runtime` a throwaway password generated for that run;
  3. applies `drizzle/0000…0022` in journal order, stopping at the first error;
  4. writes the environment the suite reads (`DATABASE_URL` through the pooler as `app_runtime`,
     the local API URL and keys, a random `SESSION_TOKEN_HASH_SECRET`).

  It only ever targets `127.0.0.1`, and refuses any other host.
- **`.github/workflows/ci.yml` restructured**:
  - the PR job (`verify`) starts the local stack, bootstraps it, and runs the unchanged `npm run
    verify`, with no repository secrets;
  - a new job (`verify-hosted`) runs `npm run verify` against `flatmate-io-dev` on push to `main`
    only, with the existing secrets and worker setting;
  - `gitleaks` is unchanged;
  - each run records start-up and suite time. Docker images are cached between runs only if
    measurement shows the cache makes the job faster.
- **A husky `pre-push` hook, `.husky/pre-push`**, running `npm run verify`.
- **`.claude/**` is ignored by ESLint and excluded from `tsc`** (`eslint.config.mjs`,
  `tsconfig.json`). Today ESLint reads the Claude worktree copies under `.claude/worktrees/` (tsc turned out
  not to, see design Context), so `npm run verify` fails on the human's machine with 26 errors that aren't in the real tree. A
  pre-push hook would then block every push. Human approval: 2026-09-26.
- **Docs**: the CI and test-timing sentences in `CLAUDE.md`, the `vitest.config.ts` worker
  comment, and a short "CI" note in `.env.example`, so none of them still claims CI talks to dev
  from the US.

Not changing: any file under `src/`, any test's assertions or timeouts, `tests/setup.ts`, any
migration, `test/guarded.manifest.json`, or anything under `docs/`.

## Capabilities

### New Capabilities
- `tooling/ci-database`: where each test run gets its database (PR CI in the runner, `main`
  against hosted dev, local runs and the pre-push hook against hosted dev), and what the runner's
  database must match (pooler mode, pinned Postgres and Auth versions, no production, no
  repository secrets in the PR job).

### Modified Capabilities
None. No spec under `openspec/specs/` describes CI or the test environment.

## Guardrails touched

- **G-G3** (*„Checks aus der Pipeline nehmen … erfordert menschliche Freigabe"*). This change
  edits `.github/workflows/`, a guarded file. The hosted run also leaves the PR pipeline and moves
  to `main`. The human's approval for that is decisions 3 and 6 above (2026-09-25/26), and the
  human merges the PR. Every check in `npm run verify` still runs on every PR. None is removed,
  none is made `continue-on-error`. The `.claude/**` ignore in `eslint.config.mjs` and
  `tsconfig.json` is also a G-G3 change. The human approved it on 2026-09-26, and it narrows
  nothing in the real tree.
- **G-G1** (*„Zeitüberschreitungen hochsetzen … verboten"*). No timeout is raised. `testTimeout`
  and `hookTimeout` stay at 60 s, because the `main` job still talks to the EU.
- **G-D / G-D10.** The guarded tests run in both jobs. The PR job runs them behind a
  transaction-mode pooler (decision 4). The manifest does not change.
- **G-C7.** Both halves of every visibility invariant (policy and raw SQL) run in the PR job,
  against RLS policies built from the same migration chain.
- **The production guard** (`tests/setup.ts`, since 2026-09-18) keeps refusing the production ref.
  The bootstrap script refuses any host other than `127.0.0.1`. **G-B2** (*„Kein Dump … gelangt in
  eine lokale oder in eine Testumgebung"*) holds: the runner's database is built from migrations
  only, and nothing is copied from any hosted project.
- **G-A1/G-A2.** No key, password or token is committed. The PR job reads none from the repository.
  The throwaway `app_runtime` password and session secret exist only for the run. The local
  stack's API keys are public local-only defaults, not secrets.
- **G-E3** (*„Die Migrationskette ist die einzige Wahrheit"*). Strengthened, not touched: every PR
  now proves that `bootstrap-roles.sql` plus `drizzle/` build the whole schema on an empty
  database.
- **G-C, G-L:** not touched. No application code changes.

## Assumptions

1. **The local stack's Auth, at the pinned version, behaves like hosted Auth for what the suite
   checks.** Where it doesn't, the PR job fails. The fix is then to change the pin or the config,
   never the assertion (decision 5). If that is impossible, it's a finding for the human, not a
   skip.
2. **The runner's pooler is close enough to Supavisor in the cloud.** It is the same software in
   transaction mode, with a different topology. `tests/integration/policy/join-rate-limit.test.ts`
   already says it is an invariant guard, not a regression test. Nothing new rests on topology.
3. *(Replaced by decision 9, 2026-09-26: timing is now a go/no-go gate, not a target.)*
4. **G-E2's `up → down → up` cycle is not part of this change.** An empty database in CI is what
   G-E2 would need, but the migrations have no `down` files today. That is separate work.
5. **The `main` job may still hit a 429 or a `fetch failed`.** It doesn't block anything, and its
   failure is a signal to read, not a gate.

## Impact

- **New files:** `supabase/config.toml`, `supabase/.gitignore`, `supabase/pins/postgres-version`,
  `supabase/pins/gotrue-version`, `supabase/pins/README.md`,
  `scripts/ci/bootstrap-local-db.sh`, `.husky/pre-push`.
- **Changed files:** `.github/workflows/ci.yml`, `eslint.config.mjs`, `tsconfig.json`, `vitest.config.ts` (comment only), `CLAUDE.md`, `.env.example`.
- **Repository settings:** none change. The three dev secrets stay, used by `verify-hosted` only.
- **Developer machines:** every `git push` now runs the full hosted suite, about 1.5–2 min.
  That cost is accepted by decision 2. (The Auth 429 on back-to-back runs is gone: the human
  raised dev's sign-in and token-refresh limits on 2026-09-26, see design D7.)
