Read `proposal.md` (the nine human decisions) and `design.md` (D1–D11) first. Nothing under
`src/`, `tests/`, `drizzle/`, `docs/` or `test/guarded.manifest.json` changes in this change. If a
task seems to need one of them, stop and report.

**Three kinds of commit, never mixed (design D11):**
- **record**: `openspec/changes/ci-local-database/**` only. Never reverted.
- **keepers**: groups 1–3. They land whatever the outcome.
- **experiment**: groups 4–7 and the fix-ups in group 8. Reverted as a whole on a no-go.

Keep a running list of every experiment commit's SHA in the PR description. 7.4 and 9.2 revert
by that list.

## 0. Record

- [x] 0.1 Commit the planning artifacts as `docs(openspec): propose ci-local-database`. It covers only `openspec/changes/ci-local-database/**`. From now on, every tick in this file goes into a record commit of its own, or into the next record commit, never into a keeper or experiment commit. Files: `openspec/changes/ci-local-database/**`.

## 1. Unblock the local gate (D8, human approval 2026-09-26)

- [x] 1.1 Add `".claude/**"` to `globalIgnores` in `eslint.config.mjs` and to `exclude` in `tsconfig.json`, each with a comment: `.claude/` holds tool state and worktree copies, never source; human approval 2026-09-26 under G-G3. Files: `eslint.config.mjs`, `tsconfig.json`.
- [x] 1.2 Show that the real tree is still fully checked:
  - `npx eslint . --format json` file counts outside `.claude/`, before and after 1.1, must be equal;
  - `npx tsc --noEmit` must still type-check `src/`, `tests/`, `scripts/` and `tools/`.

  **Deliberate break:** add a type error and a lint error to a scratch `src/__probe.ts`, see both reported with 1.1 in place, then delete the file. Report the output. Files: none kept.
- [ ] 1.3 Run `npm run verify` on the human's machine (hosted dev), and report that it passes with both worktrees still present. Files: none.

## 2. Pre-push hook (D7)

- [x] 2.1 Create `.husky/pre-push`, containing `npm run verify` and a comment citing decision 2 (F2 plan, section 7), the `verify-hosted` backstop, and D7's known costs. Files: `.husky/pre-push`.
- [ ] 2.2 **Deliberate break.** Wait about 5 min after the last hosted run first (the Auth 429, plan Working tips). On a scratch local branch that is never pushed, add a failing `expect(1).toBe(2)` to a copy of an existing unit test and commit it. Then run `git push --dry-run origin HEAD`. It must end with the hook's non-zero exit and git's `failed to push some refs` line. Report both lines, then delete the scratch branch locally. If `--dry-run` turns out not to run the hook, say so and use `git push origin HEAD:refs/heads/probe/never-lands` instead: the failing hook stops it before anything leaves the machine. Files: none kept.

## 3. Keepers commit (D11)

- [x] 3.1 In `CLAUDE.md`, add only the lines about the `.claude/**` ignore and the pre-push hook (Commands block). Nothing about where CI runs; that is 7.1. Files: `CLAUDE.md`.
- [x] 3.2 Commit groups 1–3 as one commit, `chore: ignore .claude/** in lint and tsc; pre-push verify`. Its message records the human's G-G3 approval of 2026-09-26. `git show --stat HEAD` must list only `eslint.config.mjs`, `tsconfig.json`, `.husky/pre-push` and `CLAUDE.md`. Files: none new.

## 4. The CI stack's config (D1, D2, D3)

- [x] 4.1 **Human task:** read hosted dev's pooler settings (Supabase dashboard → `flatmate-io-dev` → Database settings → Connection pooling). **Answered 2026-09-26:** shared pooler, pool size **15**, max client connections **200**. Files: none.
- [x] 4.2 Run `npx supabase@2.118.0 init` to generate `supabase/config.toml` and `supabase/.gitignore`. Then edit `config.toml` per D3:
  - `project_id = "flatmate-io-ci"`;
  - `[db] major_version = 17`, `[db.seed] enabled = false`;
  - `[db.pooler]`: `enabled = true`, `pool_mode = "transaction"`, `default_pool_size = 15`, `max_client_conn = 200` (both from 4.1);
  - `[auth.rate_limit]`: `sign_in_sign_ups`, `token_refresh`, `token_verifications` = `10000`;
  - `[auth]`: `minimum_password_length = 6`, `enable_signup = true`.

  Add a header comment: CI only, local work stays on hosted dev (decision 1), and that `default_pool_size`/`max_client_conn` were copied from hosted dev on 2026-09-26 (4.1). Don't add `supabase/migrations/`, and don't add any npm script that starts the stack. Files: `supabase/config.toml`, `supabase/.gitignore`.
- [x] 4.3 Create the pin files, each holding one tag and one newline: `supabase/pins/postgres-version` → `17.6.1.166`, `supabase/pins/gotrue-version` → `v2.197.0`. Add `supabase/pins/README.md`, 3–5 lines covering:
  - what the files are;
  - that the workflow copies `*-version` into `supabase/.temp/`;
  - that the bootstrap script asserts the running images match them;
  - that when bumping, you re-read hosted dev's exact Postgres image (Supabase `get_project`), because the drift step only sees major.minor (D2).

  Files: `supabase/pins/*`.
- [x] 4.4 Confirm that `git status` shows nothing under `supabase/.temp/` or `supabase/.branches/`, and that `gitleaks protect --staged` passes on the staged `supabase/` files. Files: none.

## 5. `scripts/ci/bootstrap-local-db.sh` (D4)

- [x] 5.1 Write the script in D4's order, with `set -euo pipefail`:
  1. parse `supabase status -o json` with `node -e`, never `grep`/`cut` on the `KEY="VALUE"` env form;
  2. the host guard;
  3. roles, then the password;
  4. the chain in `_journal.json` order, one `psql -v ON_ERROR_STOP=1 --single-transaction -f` per file, echoing each file's name first;
  5. roles again;
  6. the image assertions (D2);
  7. the pooler probe;
  8. the PostgREST probe (D4 step 7);
  9. export to `$GITHUB_ENV`, with `::add-mask::` for the password and the session secret.

  Mark it executable in git (`git update-index --chmod=+x`). Files: `scripts/ci/bootstrap-local-db.sh`.
- [x] 5.2 **Guard test, locally in Git Bash, with shims.** The shims live in a scratch directory first on `PATH`, never in the repo:
  - a `supabase` shim that prints real-shaped `status -o json` output, plus a `Stopped services: [...]` line on stderr as the real CLI does;
  - a `psql` shim that writes a marker file when called.

  Cases:
  - (a) `DB_URL` host `db.example.invalid`: the script exits non-zero and there is no marker;
  - (b) a remote `API_URL` with a local `DB_URL`: the same;
  - (c) both local: the marker appears, so the guard lets a local stack through.

  **Deliberate break:** remove the guard, see (a) create the marker, then restore it. Report all four results.
- [x] 5.3 **Image-assertion test, locally, with shims.** A `docker` shim answers `docker inspect … --format '{{.Config.Image}}'`, and a `curl` shim answers `/auth/v1/health`.
  - With `supabase_db_flatmate-io-ci` → `…/postgres:17.6.1.166` and health `v2.197.0`: the assertions pass.
  - With `…/postgres:17.6.1.171` (the CLI default): they fail and name both values.
  - With health `v2.196.0`: they fail.

  **Deliberate break:** loosen the Postgres check to a `17.6` prefix, see the `.171` case pass wrongly, then restore the exact check. Report all four results.
- [ ] 5.4 The pooler probe runs `select current_user, (select rolbypassrls from pg_roles where rolname = current_user)` through `app_runtime.pooler-dev@127.0.0.1:54329`, and fails the script unless it returns `app_runtime` and `f`. If Supavisor refuses the login in CI (8.2), and no `config.toml` pooler setting fixes it, **stop and report to the human**. Don't switch `DATABASE_URL` to the direct port (decision 4). Files: `scripts/ci/bootstrap-local-db.sh`.

## 6. `.github/workflows/ci.yml` (D5)

- [x] 6.1 Rewrite `verify` per D5, on `runs-on: ubuntu-24.04` (pinned, for its psql 16 client). The steps:
  1. checkout, setup-node 24 with the npm cache, `npm ci`, `npm run build`;
  2. `supabase/setup-cli@v3` with `version: 2.118.0`;
  3. `mkdir -p supabase/.temp && cp supabase/pins/*-version supabase/.temp/`;
  4. `supabase start -x realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,mailpit`;
  5. `scripts/ci/bootstrap-local-db.sh`;
  6. `npm run verify`;
  7. `node tools/check-refs.ts`.

  No `secrets.*` anywhere in the job. No `VITEST_MAX_WORKERS` (measured in 8.4). `timeout-minutes: 20`. Write the stack start-up and `npm run verify` durations to `$GITHUB_STEP_SUMMARY`. Files: `.github/workflows/ci.yml`.
- [x] 6.2 Add `verify-hosted` per D5:
  - `runs-on: ubuntu-24.04`, `if: github.event_name == 'push'`;
  - `concurrency: { group: hosted-dev, cancel-in-progress: false }`;
  - today's steps and env block unchanged, with today's comments moved along.

  Then add the pin-drift step:
  - `curl` hosted `/auth/v1/health` with the hardcoded dev anon key;
  - `psql "$DATABASE_URL" -tAc 'show server_version'`.

  It fails if the GoTrue version differs from `supabase/pins/gotrue-version`, or if the server version's major.minor differs from the pin's first two components. The failure message names both values and says "bump supabase/pins on purpose". Files: `.github/workflows/ci.yml`.
- [x] 6.3 Leave `gitleaks` byte-for-byte unchanged, and confirm that in the diff. `continue-on-error` appears nowhere (G-G3). Files: `.github/workflows/ci.yml`.

## 7. Docs (D9) and the experiment commit

- [x] 7.1 Update `CLAUDE.md`: the "Tests hit a real Supabase instance" paragraph (PR CI uses the runner's local stack; local runs and `verify-hosted` use dev), and the 260–350 s figure (a placeholder until 8.5). Files: `CLAUDE.md`.
- [x] 7.2 Update the `maxWorkers` comment in `vitest.config.ts` (comment only; the value is unchanged), and add the one-line CI note to `.env.example`. Files: `vitest.config.ts`, `.env.example`.
- [x] 7.3 Confirm with `git diff --stat main` that nothing under `docs/`, `src/`, `tests/`, `drizzle/` or `test/` changed, and run `node tools/check-refs.ts`. Files: none.
- [x] 7.4 Commit groups 4–7 as `ci: run PR verify against a local Supabase stack (experiment)`, and add its SHA to the list. `git show --stat HEAD` must list only `supabase/`, `scripts/ci/`, `.github/workflows/ci.yml`, `vitest.config.ts`, `.env.example` and `CLAUDE.md`. **Revert rehearsal:** `git revert --no-commit <every listed SHA, newest first>`, then check:
  - `git diff --cached main -- .github/workflows/ci.yml` is empty;
  - `supabase/` and `scripts/ci/` are gone;
  - the keeper lines in `CLAUDE.md` survive.

  Then `git revert --abort`. Files: none new.

## 8. Prove it in CI, then measure (human confirms before each push)

- [ ] 8.1 **Ask the human before the first push** of `feat/ci-local-database`. After a yes, push and open the PR as a draft. Files: none.
- [ ] 8.2 The draft PR's `verify` run must be green. Report:
  - the stack start-up time, the `npm run verify` time and the job time;
  - that no step references a secret;
  - the pooler probe's `app_runtime | f` line and the PostgREST probe's `200` from the job log.

  If a test fails only here, stop and report it (design Risks) without editing the test. Fixes to experiment files are **experiment fix-up commits**; add each SHA to the list.
- [ ] 8.3 **Deliberate breaks in CI.** Each goes on a throwaway branch `probe/ci-local-database` off the feature branch, opened as a draft PR, then closed and deleted. **Ask the human before pushing it**; note that deleting the remote branch runs the pre-push hook once more.
  - (a) `supabase/pins/gotrue-version` set to `v2.196.0`: the image assertion fails, or the CLI refuses the tag. Either way, no test runs.
  - (b) `supabase/pins/postgres-version` set to `17.6.1.171`: the image assertion fails, and no test runs.
  - (c) a copy of `drizzle/0022_account_password_changed_at.sql` with a syntax error, added as `0023` in the journal: the chain stops at that file.
  - (d) the pooler probe pointed at port `54322` (direct Postgres) with the `.pooler-dev` username: the login fails.

  Report each failing log line. Files: none on the feature branch.
- [ ] 8.4 **Tuning** (D6, D5 workers), each an experiment fix-up commit:
  - the Docker image cache, `actions/cache` + `docker save`/`load`, keyed on the CLI version plus `hashFiles('supabase/pins/*-version')`. Kept only if a warm run beats 8.2's cold run end to end.
  - `VITEST_MAX_WORKERS` default against `"4"`, keeping the faster one, with both times in the comment above the step.

  Report every number. Files: `.github/workflows/ci.yml`.
- [ ] 8.5 **The go/no-go measurement (D11).** On the final configuration, trigger 3 **new** runs with 3 empty commits (`git commit --allow-empty -m "ci: measure (n/3)"`; each is an experiment fix-up), **not** re-runs. Read each job's `startedAt`/`completedAt` with `gh run view <run-id> --json jobs`. Report:
  - the three durations and their median, which is judged against **≤ 180 s**;
  - separately, one **cold** run (the first run after a cache-key change, or with the cache disabled for that run), for information;
  - the baseline, 6 min 17 s.

  Put the numbers into:
  - the `CLAUDE.md` figure from 7.1, as an **experiment** fix-up commit;
  - design.md's Migration Plan step 5, as a **record** commit.

  Files: `CLAUDE.md`, `openspec/changes/ci-local-database/design.md`.
- [ ] 8.6 **Stop and hand the go/no-go call to the human.** Don't mark the PR ready, merge or revert before the human's answer. Files: none.
- [ ] 8.7 `verify-hosted` can't run before merge. Note in the PR description that its first run is the first push to `main` after the merge, and that its pin-drift step must be green there. Files: none.

## 9. Close out, by outcome

- [ ] 9.1 **On go:** run `npm run verify` locally once more and `openspec validate ci-local-database --strict`, then mark the PR ready for review. Update the plan file's Status and section 7 (`~/.claude/plans/the-pr-for-003-atomic-flask.md`) with the numbers, the PR link, and that "Open with the human" item (1) is closed by D8. Files: the plan file.
- [ ] 9.2 **On no-go:**
  1. `git revert` every listed experiment SHA, newest first, never force-pushing.
  2. Confirm that `git diff main -- .github/workflows/ci.yml` is empty, that `supabase/` and `scripts/ci/` are gone, and that the keepers and the record commits survive.
  3. Push after asking the human, and check that the PR's restored hosted `verify` job is green.
  4. Record the numbers and "no-go" in design.md's Migration Plan (a record commit) and in the plan's section 7.
  5. After the merge, archive with `openspec archive ci-local-database --skip-specs`, since the capability wasn't delivered. Tasks 4–8 stay unticked there on purpose. State that in the archive commit message.

  Files: the reverted files, `design.md`, the plan file.
