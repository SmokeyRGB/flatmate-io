# WP07 · CI hardening and test-helper structure

> Paste into a fresh Cursor Agent session; read `audit/cursor/README.md` first.

## 1. Goal

- **#24** Harden `.github/workflows/ci.yml` (least-privilege `permissions`, actions pinned by full commit SHA, the anon key written once) and declare the Node version in `package.json` (`engines`).
- **#23** Split `tests/helpers/identity.ts` (285 lines, six responsibilities) into `cleanup.ts`, `households.ts` and `fixtures.ts` with `identity.ts` re-exporting everything, so no test import breaks. Add a `TEST_PASSWORD` constant and a `useTestHousehold()` helper that owns the `afterEach`; adopt both in a few files only. Fix the `createTestModerator` cleanup monkey-patch leak and the duplicated household registration in `authorization-matrix.test.ts`.

## 2. Branch, dependencies, conflicts

- Branch: `chore/wp07-ci-and-test-helpers`, from `main` **after WP05 and WP06 are merged** (WP06 edits `tests/setup.ts` and adds an env guard; WP05 makes the lints stricter and `cleanup-inventory`-adjacent lints scan `tests/`). Rebase on `main` first and re-run `npm run verify` before starting.
- **Must not run in parallel with WP05, WP06**, or anything else editing `tests/helpers/**` or `.github/workflows/ci.yml`.
- Split into **two PRs if the reviewer prefers** (Part 1: CI + engines; Part 2: test helpers). They share no file. The plan below keeps them as separate phases so that is easy.
- Must not touch: `src/**`, `docs/**`, `test/guarded.manifest.json`, registered G-D test *behaviour* (adopting `TEST_PASSWORD` / `useTestHousehold` in a registered file is a G-D file edit: do not, see hazards).

## 3. Read first

1. `audit/cursor/README.md`, `CLAUDE.md` (Commands, tests section), `.claude/rules/implementation-hazards.md` ("One pooled connection per call chain", "Tests that can fail"), `.claude/rules/guardrail-lints.md` (`cleanup-inventory`).
2. `audit/technical-debt.md` findings #23 and #24.
3. `.github/workflows/ci.yml` (full), `scripts/ci/bootstrap-local-db.sh` (header only), `package.json`.
4. `tests/helpers/identity.ts` (full), `tests/helpers/pipeline.ts`, `tests/setup.ts`, `tests/unit/lint/cleanup-inventory.test.ts` (full), `tests/integration/policy/sweep-abandoned-household.test.ts`, `tests/integration/policy/authorization-matrix.test.ts` (lines 1-60 and the `beforeAll`/`afterAll` blocks), `tests/integration/policy/revoked-membership-sign-in.test.ts` (the `afterEach` shape).

## 4. Current state (verified 2026-10-01 on main @ 3401c94)

**#24, claim by claim.**
- No `permissions:` anywhere in `ci.yml`: confirmed. Jobs: `gitleaks`, `verify` (pull_request and push), `verify-hosted` (push only).
- Actions on mutable tags: confirmed. `actions/checkout@v4` (x3), `supabase/setup-cli@v3` (with `version: 2.118.0` for the CLI itself), `actions/setup-node@v4` (x2, `node-version: 24`, `cache: npm`). The gitleaks step uses `docker://ghcr.io/gitleaks/gitleaks:v8.30.1`, already pinned to a release tag (a digest would be stricter; optional).
- "The same (public, local-stack) anon JWT is pasted twice": **the key is pasted twice, but it is not the local-stack key.** Both copies are the hosted `flatmate-io-dev` anon key (JWT `ref` claim = dev ref): once as `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `verify-hosted`'s `npm run verify` step and once as `HOSTED_ANON_KEY` in the drift step, each with `# gitleaks:allow`. The local `verify` job gets its keys from `bootstrap-local-db.sh` via `$GITHUB_ENV` and pastes none.
- `package.json` has no `engines`: confirmed. CI uses Node 24; `node tools/check-refs.ts` relies on native TypeScript stripping; the dev machine runs v24.14.0.
- "check-refs runs twice": **true but deliberate.** `npm run verify` runs `node tools/check-refs.ts --quiet`, and both `verify` and `verify-hosted` then have an explicit non-quiet `node tools/check-refs.ts` step whose comment says it is kept as the named gate (same for the data-inventory step: MINIMAL-GATE gate 4 asks for "eigener CI-Schritt"). Treat "drop the duplicate" as a human decision (D1), default **keep**, and do not touch the data-inventory step.
- `verify-hosted` has `if: github.event_name == 'push'`: **changes to that job cannot be exercised by a pull request.**

**#23, claim by claim.**
- `tests/helpers/identity.ts` is 285 lines: confirmed. Contents: `HOUSEHOLD_SCOPED_TABLES`, `buildHouseholdCleanupStatement`, `cleanupHousehold`, `adminClient`, `testEmail`, `TestHousehold`, in-flight registry (`inFlightHouseholds`, `registerTestHouseholdInner`, `registerTestHousehold`, `lastSweepCount`, `getLastSweepCount`, `sweepAbandonedHouseholds`), `makeCleanup`, `deleteTestAccount`, `cleanupAll`, `createTestModerator`, `createNonResidentModerator`.
- 105 files under `tests/` (plus `tests/setup.ts`) import from `helpers/identity`. The password literal `"test-password-not-real-1234"` appears in 66 test files plus `identity.ts` (x2) and `pipeline.ts`. `afterEach` appears 124 times across `tests/` (the "~78 copy-pasted blocks" are the common `let hh; const accountIds; afterEach(cleanupAll(...))` shape; 66 files in `tests/integration/policy` have an `afterEach`).
- **Monkey-patch leak confirmed** (`identity.ts:247-250`): `createTestModerator` replaces `hh.cleanup` with `async () => { await originalCleanup(); await deleteTestAccount(accountId); }`. If `originalCleanup` throws (DB cleanup or household Auth user deletion), the moderator's Auth user is never deleted. A caller that stored `hh.cleanup` *before* calling `createTestModerator` (e.g. `join-sign-out-and-return.test.ts` pushes `hh.cleanup` right after registering) keeps the original and never sees the patch. There is also a latent ordering problem in `makeCleanup`: if `cleanupHousehold` throws, `deleteTestAccount(context.accountId)` is skipped, leaking the household's own Auth user.
- `authorization-matrix.test.ts:19-37` `registerSharedHousehold` re-implements `registerHousehold` + `makeCleanup` minus the in-flight registry (needed because a household shared across `it`s in `beforeAll` would be swept by `tests/setup.ts` after the first test).

**How `cleanup-inventory.test.ts` reads the helper (checked exactly).**
1. `import { HOUSEHOLD_SCOPED_TABLES } from "../../helpers/identity"` (works through a re-export).
2. `readFileSync(join(ROOT, "tests", "helpers", "identity.ts"), "utf8")` then `expect(helperSource).toMatch(/delete from household where id = \$\{id\}/)`. **This reads the file text.** After the split the SQL moves to `cleanup.ts`, so this assertion goes red unless the test is updated in the same commit to read `tests/helpers/cleanup.ts` and import `HOUSEHOLD_SCOPED_TABLES` from `../../helpers/cleanup`. Keep the SQL text byte-identical (`with … delete from household where id = ${id}`). The second half of that file reads `src/modules/identity/auth.ts`, unaffected.
3. `tests/setup.ts` dynamically imports `./helpers/identity` for `sweepAbandonedHouseholds` (after dotenv, because `src/db/client.ts` reads `DATABASE_URL` at load).

## 5. Package-specific hazards

- **Module-level state must live in exactly one module.** `inFlightHouseholds` and `lastSweepCount` belong together in `households.ts`; `identity.ts` only re-exports (`export * from "./cleanup"; export * from "./households"; export * from "./fixtures";`). A second copy of that set would silently disable the sweep.
- **Dependency direction, no cycles:** `cleanup.ts` (no helper imports except `./uuid`) <- `households.ts` <- `fixtures.ts`. `adminClient` and `deleteTestAccount` live in `cleanup.ts` (they are teardown tools). `testEmail`, `TestHousehold`, `TEST_PASSWORD` live in `households.ts`.
- **`tests/setup.ts` must keep importing lazily** (dotenv before `src/db/client.ts`). Do not add top-level imports of any helper to `setup.ts` or to `cleanup.ts`'s import chain that run before `config()`.
- **No mocking of DB or Auth** (README). The leak test below provokes a real failure instead.
- **Registered G-D tests:** `test/guarded.manifest.json` lists 25 files. Do not adopt `TEST_PASSWORD`/`useTestHousehold` in any of them; leave their bodies untouched (the lint `guarded-tests` is not the issue, the human-approval rule for changing a guarded test is). Re-exports keep their imports working unchanged.
- **`flatmate-io-dev` is shared and teardown must be exact**: anything unique project-wide (Auth emails) stays random per run (`testEmail()` already is).
- **Pooled connections:** `cleanupHousehold` opens one `withSessionContext`; never call it inside another session callback.
- SHAs must be resolved from GitHub, never recalled or invented (README says the same for migrations: verify before trusting). A wrong SHA fails the workflow loudly, but a SHA that belongs to a fork commit does not; check ownership.
- Editing `ci.yml` rewrites untested code for `verify-hosted`. See Phase C.

## 6. Plan

### Phase A — characterization / failing tests

1. **`tests/unit/helpers/identity-exports.test.ts` (new, pin).** Import `* as helpers from "../../helpers/identity"` and assert the export name set is a superset of: `HOUSEHOLD_SCOPED_TABLES, adminClient, cleanupAll, cleanupHousehold, createNonResidentModerator, createTestModerator, deleteTestAccount, getLastSweepCount, registerTestHousehold, sweepAbandonedHouseholds, testEmail`. Also assert `HOUSEHOLD_SCOPED_TABLES` equals the current 10-element array (order irrelevant). Green today; keeps passing after the split. Deliberate break: remove one re-export, see it red (record). `tsc` over the 105 importers is the second safety net.
2. **`tests/integration/helpers/moderator-cleanup.test.ts` (new, fix-style; hits dev).** No mocks: provoke a genuine cleanup failure.
   - `hh = await registerTestHousehold()`; `const mod = await createTestModerator(hh)`; remember `realContext = { ...hh.context }`.
   - Corrupt the shared context object the cleanup closure holds: `hh.context.householdId = "not-a-uuid"` (the closure captured the same object). `await expect(hh.cleanup()).rejects.toThrow()` (assert on the thrown class/message, not just rejection; an `AggregateError` after the fix, a raw error before: assert only that it rejects, and in the fix commit also that the AggregateError's `errors` has length 1).
   - Then assert via `adminClient().auth.admin.getUserById(mod.accountId)` that the moderator's Auth user is **gone** (404/`error`). **Expected today: RED** (the patch skipped `deleteTestAccount` after the original threw), and likewise assert the household's own Auth user (`hh.accountId`) is gone (**RED today** for the second leak).
   - `afterEach` (module-scope, not `finally`): `await cleanupAll(cleanupHousehold(realContext, realContext.householdId), deleteTestAccount(mod.accountId), deleteTestAccount(realContext.accountId))` so the test leaves nothing behind whether green or red (the household rows survive the failed cleanup by design of the test).
   - Second case, order independence: `const early = hh.cleanup;` taken **before** `createTestModerator`; after the call, `await early()`; assert the moderator's Auth user is gone. **Expected today: RED** (the stale reference never deletes the moderator). Green after the fix because the moderator is tracked on the household, not on the function.
   - Third case (pin, green today and after): normal path deletes household rows, household account and moderator; calling `hh.cleanup()` twice is a no-op.
3. **`cleanup-inventory.test.ts`**: no new case, but note it as the Phase B step 3 co-change.
4. **CI changes have no unit test.** Their characterization is the green pull-request run (Phase C).

### Phase B — change (one commit each, `verify`-green after each; Part 1 = steps 1-3, Part 2 = steps 4-10)

Part 1 — CI and engines (`.github/workflows/ci.yml`, `package.json`)

1. `chore(ci): least-privilege token permissions`: add a top-level `permissions:\n  contents: read` (after `on:`). Nothing in the three jobs writes to the repo, checks or packages (gitleaks via docker, supabase CLI, npm). If a job later needs more, grant it per job.
2. `chore(ci): pin actions by commit SHA`: for each of `actions/checkout`, `actions/setup-node`, `supabase/setup-cli` resolve the SHA yourself:
   - `gh api repos/<owner>/<repo>/releases --jq '[.[] | select(.tag_name | startswith("v<major>.")) | .tag_name][0]'` to find the newest tag on the **current major** (v4, v4, v3);
   - `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha` to get the commit SHA (dereferences annotated tags);
   - cross-check with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`; confirm `gh api repos/<owner>/<repo>/commits/<sha> --jq .sha` returns the same value.
   Write `uses: actions/checkout@<40-hex-sha> # v4.x.y`. Keep `with:` blocks. Do not change majors. Add a one-line comment above the first pin explaining "SHA pins; bump via the tag in the trailing comment". Optionally resolve the gitleaks image digest (`docker buildx imagetools inspect ghcr.io/gitleaks/gitleaks:v8.30.1`) and pin `@sha256:`; skip if docker is unavailable and say so. Optional, human D2: a `.github/dependabot.yml` with `package-ecosystem: github-actions` so the pins do not rot; do not add without a yes.
3. `chore(ci): write the hosted anon key once and declare the Node version`:
   - In `verify-hosted` move `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to a **step-independent location that does not change `npm run build`**: the build step currently runs without them ("needs no secrets"). Preferred: keep them on the `npm run verify` step, and in the drift step reference the same value via a job-level `env:` entry `HOSTED_ANON_KEY` defined once and consumed as `${{ env.HOSTED_ANON_KEY }}` in both steps (the `build` step then also sees `HOSTED_ANON_KEY`, which no code reads; confirm with `grep -rn HOSTED_ANON_KEY . --include=*.ts --include=*.tsx --include=*.sh`). Keep a single `# gitleaks:allow` on the one remaining literal.
   - `package.json`: `"engines": { "node": ">=24" }` (CI is 24; `check-refs.ts` needs native TS stripping, which is why). No `.npmrc engine-strict`. Run `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` and `npm install --package-lock-only --ignore-scripts` is **not** needed; check `git diff package-lock.json` is empty (engines at the root are mirrored into the lock's root package entry in current npm; if the diff shows only that, commit it).
   - Do **not** drop the duplicate `check-refs` / `data-inventory` steps unless D1 says so.
   - Validate syntax offline: `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"`, and `actionlint` if available (`docker run --rm -v \"$PWD:/repo\" rhysd/actionlint:latest -color /repo/.github/workflows/ci.yml`).

Part 2 — test helpers (all under `tests/`)

4. `test(helpers): pin the identity helper surface and the moderator cleanup leak`: Phase A tests 1-2 (the leak cases are red here; commit with the fix in step 6 if the hook insists on green, recording the red run in the PR description).
5. `refactor(tests): split helpers/identity into cleanup, households and fixtures`: pure move, no logic change.
   - `cleanup.ts`: `HOUSEHOLD_SCOPED_TABLES`, `buildHouseholdCleanupStatement`, `cleanupHousehold`, `adminClient`, `deleteTestAccount`, `cleanupAll`.
   - `households.ts`: `TEST_PASSWORD = "test-password-not-real-1234"` (exported), `testEmail`, `TestHousehold`, in-flight registry, `registerTestHousehold`, `getLastSweepCount`, `sweepAbandonedHouseholds`, `makeCleanup`.
   - `fixtures.ts`: `createTestModerator`, `createNonResidentModerator`.
   - `identity.ts`: three `export *` lines and the header comment pointing to the files. Keep every existing comment with its code.
   - Same commit: update `tests/unit/lint/cleanup-inventory.test.ts` to read `tests/helpers/cleanup.ts` and import `HOUSEHOLD_SCOPED_TABLES` from `../../helpers/cleanup` (adapting a path, same assertions; say so in the commit body), and its comments that name `identity.ts`.
   - Verify: `npx tsc --noEmit` and `npx vitest run tests/unit/lint/cleanup-inventory.test.ts tests/unit/helpers tests/integration/policy/sweep-abandoned-household.test.ts`.
6. `fix(tests): track moderator accounts on the household instead of patching cleanup`: add `ownedAccountIds: string[]` to `TestHousehold`; `createTestModerator` pushes the new account id instead of reassigning `hh.cleanup`; `makeCleanup(context, deregister, owned)` reads `owned` when it runs and does `cleanupAll(cleanupHousehold(context, id), deleteTestAccount(context.accountId), ...owned.map(deleteTestAccount))` so one failure never skips another deletion (the first real failure is rethrown as the `AggregateError` `cleanupAll` already builds). Keep idempotence (`cleaned` flag) and `deregister()`. Leak tests from Phase A are green now; update the helper comment that described the monkey-patch.
7. `refactor(tests): one untracked-household registration`: export `registerUntrackedTestHousehold(name = "WG")` from `households.ts` (same as `registerTestHousehold` but without the in-flight registry, for `beforeAll`/`afterAll` households; documented why). Replace `registerSharedHousehold` in `authorization-matrix.test.ts` and its imports of `cleanupHousehold` / `deleteTestAccount` / `testEmail` if they become unused. The matrix keeps its assertions and its `afterAll` guard.
8. `refactor(tests): TEST_PASSWORD constant`: replace the literal inside `households.ts`, `fixtures.ts`, `pipeline.ts`. Adopt in **at most 6 test files** that are not registered in the guarded manifest and are not touched by in-flight branches (pick two from `tests/integration/policy/account-settings-*.test.ts`, others from `tests/unit/identity/`). Leave the remaining ~58 as they are (list the count in the hand-back for a follow-up).
9. `refactor(tests): useTestHousehold owns the afterEach`: in `households.ts` add

   ```ts
   export function useTestHousehold() {
     // call at module scope or inside describe(): registers one afterEach
     let hh: TestHousehold | undefined;
     const accountIds: string[] = [];
     afterEach(async () => { const h = hh; const ids = accountIds.splice(0); hh = undefined; await cleanupAll(...ids.map(deleteTestAccount), h?.cleanup()); });
     return {
       register: async (name?: string) => (hh = await registerTestHousehold(name)),
       trackAccount: (id: string) => { accountIds.push(id); return id; },
       get household() { if (!hh) throw new Error("useTestHousehold: register() first"); return hh; },
     };
   }
   ```

   (shape illustrative; keep it this small, YAGNI). It imports `afterEach` from `vitest`. Adopt in **3 files** whose current `afterEach` is exactly the `let hh; accountIds; cleanupAll(...)` shape (start with `revoked-membership-sign-in.test.ts`; pick two more, none registered in the guarded manifest). Prove each adopted file still fails when it should: temporarily make one assertion false, see red, revert.
10. `chore(tests): remove stale references`: grep for comments naming the old monkey-patch or "tests/helpers/identity.ts's own comment on cleanupHousehold" and fix those that became wrong (comments only).

### Phase C — follow-through

- `npm run verify` locally, plus `git diff --stat` showing no change outside `.github/`, `package.json`(+lock), `tests/`.
- Open the PR (or two). **Watch the pull-request `verify` and `gitleaks` jobs**; a failure to resolve an action SHA shows up immediately. Confirm the `permissions:` block did not break `supabase/setup-cli` (it needs only the default read token).
- 🛑 HUMAN D3: `verify-hosted` cannot run on a pull request. Options: (a) accept and watch the first push-to-main run, with the pre-merge `ci.yml` ready to revert; (b) add a **temporary** commit changing the job's `if:` to also run on `pull_request`, observe one green run against `flatmate-io-dev`, then revert that commit before merge (it spends a dev run and uses the repository secrets; the human decides). Recommended: (b) once, because pinned SHAs and the anon-key refactor are exactly what a hosted run exercises.
- 🛑 HUMAN D1: keep or drop the explicit non-quiet `check-refs` step (default keep). 🛑 HUMAN D2: Dependabot for actions (default no).
- 🛑 HUMAN D4: `CLAUDE.md`, `.claude/rules/implementation-hazards.md` and `audit/cursor/README.md` say "the delete set in `tests/helpers/identity.ts`". That stays literally true through the re-export, but the code now lives in `cleanup.ts`. Propose the exact one-line edits in the hand-back; do not edit `CLAUDE.md` or `.claude/rules/**` without a yes.
- WP06 left a note: align the drift step's `case "$DATABASE_URL" in *jrhkhjeybtkqpkggssif*` allowlist with the env guard's default ref (or document why shell stays separate). Do it here only if it is a comment, not logic.

## 7. Acceptance criteria

- [ ] `ci.yml` has `permissions: contents: read`; every `uses:` of a third-party action is a 40-hex SHA with a trailing version comment; each SHA was verified with `gh api` to belong to the named repository and tag.
- [ ] The hosted anon key literal appears once in `ci.yml`; `package.json` has `engines.node`; lockfile diff is empty or only the engines mirror.
- [ ] Pull-request CI (`gitleaks`, `verify`) is green on the branch; the `verify-hosted` risk is stated with the human's D3 answer.
- [ ] `tests/helpers/{cleanup,households,fixtures}.ts` exist; `identity.ts` is re-exports only; no test file edits were needed for imports (apart from the adopted ones); `tsc` clean.
- [ ] `cleanup-inventory.test.ts` updated in the same commit as the move and still asserts the same things.
- [ ] Moderator-leak tests: seen red against the old patch (stale-reference case and failing-original case), green after; the household's own Auth user is also deleted when the DB cleanup fails.
- [ ] `registerSharedHousehold` duplicate gone from `authorization-matrix.test.ts`; its assertions unchanged.
- [ ] `TEST_PASSWORD` in helpers plus at most 6 test files; `useTestHousehold` in exactly 3 files; none of them a registered G-D file.
- [ ] `npm run verify` green; pre/post suite durations reported (no regression beyond noise).

## 8. Out of scope & stop conditions

Out of scope: converting all 66 files to `TEST_PASSWORD` or all `afterEach` blocks to `useTestHousehold`, changing `tests/setup.ts` behaviour, the env guard (WP06), lint changes (WP05), Dependabot, the data-inventory/check-refs step removal (default keep), anything in `src/`.

Stop and report if: a SHA cannot be resolved or does not belong to the expected repository; the moved `delete from household where id = ${id}` text no longer matches the lint's regex; the sweep test or `cleanup-inventory` goes red after the pure move (do not "fix" by editing assertions beyond the path change); a guarded test file would need editing; WP05/WP06 are not merged; `verify-hosted` shows a failure you cannot attribute.

## 9. Hand-back report (template)

```
WP07 hand-back
Part 1 (CI): commits <...>; actions pinned: <name@sha # tag> x N; verification commands used; permissions block; engines value; lockfile diff <none/engines only>
Part 2 (helpers): commits <...>; files created; identity.ts is re-exports only: yes/no; cleanup-inventory change: <path edit only>
Leak tests: <case> red before (how) / green after; deliberate breaks seen red: <list>
Adoption: TEST_PASSWORD in <files>; useTestHousehold in <files>; remaining literal count <n>
PR CI: gitleaks <status>, verify <status>; verify-hosted: D3 answer <a/b>, result <...>
Decisions: D1 check-refs step <keep/drop>, D2 dependabot <yes/no>, D3 <...>, D4 doc path edits <proposed diff>
npm run verify: <pass/fail counts>, duration <s>
Audit claims found inaccurate: anon key is the hosted dev key, not the local-stack key; "duplicate check-refs" is intentional
Skipped / open questions: <...>
```
