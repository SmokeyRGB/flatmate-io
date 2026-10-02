# Cursor work packages for the technical-debt audit

This directory turns the findings in [`../technical-debt.md`](../technical-debt.md) into 12 self-contained work packages (WP). Each `WPxx-*.md` file is a **complete prompt for one fresh Cursor Agent session**. To start one, paste the file or `@`-mention it and say *"Execute this work package."*

Every package file says: **read this README first.**

## ⚠️ Act now, before any package: finding #2 is live on dev

`SmokeyRGB/flatmate-io` is a **public** repository. `.github/workflows/ci.yml` (lines ~172–173 and ~200) commits `flatmate-io-dev`'s URL and anon key. Combined with finding #2, anyone can call `claim_join_code`, `resolve_join_code`, `record_join_attempt` and `resolve_account_household` on dev through `/rest/v1/rpc/…`. Tables are guarded by RLS alone.

🛑 **HUMAN, 2 minutes, no code:** in the Supabase dashboard for `flatmate-io-dev`, open Settings → Data API and remove `public` from the exposed schemas (or disable the Data API). The app never uses PostgREST. Two **tests** did: they read and cleaned `join_attempt` through the service-role client. PR #42 fixes the one that failed (merge it before any package, or every pre-push run against dev fails). WP01 is the permanent fix.

*2026-10-01: the Data API appears disabled on dev (inferred from the empty PostgREST error in the pre-push run; confirm in the dashboard).*

## Not in here: finding #1 and the members-page part of #20

Finding #1 (role checks → stored permissions) is **F3 change 2b `role-permissions`**. It runs through the OpenSpec workflow in Claude Code, not in Cursor. Two consequences:

- Packages marked **after 2b** in the table below must not start until 2b is merged to `main`.
- No package may touch the role checks or `getResidentList` / `getNavigationAccess` capability flags. They also must not add, rename or remove permission constants (`HOUSEHOLD_PERMISSIONS`, `MODERATOR_PERMISSIONS`, `RESIDENT_PERMISSIONS`, `MODERATOR_ONLY_PERMISSIONS`) or touch the membership CHECKs in `drizzle/0024`/`0027`.

## Packages and run order

| WP | Title | Findings | Kind | Depends on | Must not run in parallel with |
|---|---|---|---|---|---|
| [WP01](WP01-db-grants-hardening.md) | Revoke anon/authenticated grants; live catalog test | #2, #25, #39 | Fix | — | WP02 (both add migrations) |
| [WP02](WP02-db-runtime-and-audit-integrity.md) | DB client fail-fast and timeouts; audit-log integrity; DEFINER search_path | #14, #15, #31, #32 | Fix | WP01 | WP01, WP03, WP04 |
| [WP03](WP03-casting-concurrency.md) | Settings/openRound lock order; removeRoom race | #3, #4 (locks) | Fix | — | WP04, WP02 |
| [WP04](WP04-casting-validation-and-actor.md) | Household predicates, id validation, actor from context, coded errors | #4 (rest), #5, #26, #29 | Fix + refactor | WP03 | WP03 |
| [WP05](WP05-guardrail-lint-correctness.md) | CRLF-safe guarded-tests lint; shared lint helpers; import-boundary gaps; rls-coverage over the real schema | #8, #22, #36, #13 (lint) | Fix + refactor | — | WP07 |
| [WP06](WP06-env-guard-and-tooling.md) | Production-ref allowlist; seed safety; unwired tooling | #9, #37 | Fix | — | WP07 |
| [WP07](WP07-ci-and-test-infra.md) | CI permissions and pinning; split test helpers | #23, #24 | Fix + refactor | WP05, WP06 | WP05, WP06 |
| [WP08](WP08-app-error-handling.md) | `requireSession`, `(org)/error.tsx`, error→message mappers, settings error mapping, input validation | #10, #16, #17, #33, #34 | Fix + refactor | — (touch `members/actions.ts` only for the session guard) | 2b if 2b is in flight |
| [WP09](WP09-ui-refactors.md) | `capture-form` split; one Berlin date formatter; invite-link origin | #21, #20 (date only), #35 | Refactor + fix | **after 2b** | WP08 |
| [WP10](WP10-identity-provider-and-dedup.md) | Provider-call classification; `createUser` compensation; lock-preamble helpers; DRY leftovers | #7, #18, #28 | Refactor | **after 2b** | WP11, WP12 |
| [WP11](WP11-identity-flow-decomposition.md) | Decompose the credential state machines; incident logging; comments to invariants | #6, #19, #27 | Refactor | WP10 | WP10, WP12 |
| [WP12](WP12-module-structure.md) | Split god files; private unsafe exports; identity API for casting; audit split; stub | #11, #12, #13 (boundary), #30, #38 | Refactor | WP04, WP11 | everything touching `src/modules/**` |

**Suggested order.** These can start right away and in parallel:

1. **WP01** (critical)
2. **WP05**
3. **WP06**
4. **WP03 → WP04**
5. **WP08**

Then run WP02 and WP07. Finally, after 2b is merged, run WP09, then WP10 → WP11 → WP12.

## Human decisions the packages leave open

Each package lists its open points in its own section 8. They are collected here, so they can be decided before a session starts. An undecided point is a stop condition (rule 9), not something the Cursor agent picks.

| WP | Decision | Package's recommendation |
|---|---|---|
| WP01 | Remove `public` from the Data API's exposed schemas permanently? | Yes (appears done on dev) |
| WP01 | `join-rate-limit.test.ts` resets the **shared null-IP bucket** through REST, which is now a silent no-op. Other join tests (empty `Headers`) feed that bucket (limit 20 per 15 min), so parallel runs can hit `rate_limited`. Pick a non-REST reset: a test-only cleanup path, or give tests a trusted IP header so they never share the null bucket. | Decide; add to WP01 Phase B |
| WP01 | Does `ALTER DEFAULT PRIVILEGES` also need `FOR ROLE supabase_admin`? | Check `pg_default_acl` first |
| WP01 | Is `JOIN_ATTEMPT_SHARED_BUCKET_OK=1` acceptable as an opt-out for the trusted-IP-header startup assertion? | Decide |
| WP02 | Default timeouts `statement_timeout` 30 s / `lock_timeout` 20 s | Only after counting the provider calls made under lock |
| WP02 | Actor rule: "any account or profile of the same household" (claim and reset record another actor) | Accept for now; tighten after WP04 |
| WP02 | `nullif` policy migration size | Stop if it exceeds ~30 policies |
| WP03 | `openRound` ignores removed rooms; a round covering only removed rooms fails with `rooms_unavailable` | Accept |
| WP04 | D1: `createRound` accepts a removed room of the same household (refused at open) | Accept |
| WP04 | D2: a `prepared` profile counts as a live resident in `addResidentToRound` | Accept (`quorum-denominator.test.ts` relies on it) |
| WP04 | D3: three error classes, no base class | Accept |
| WP05 | `.gitattributes` `*.ts text eol=lf` | Defer |
| WP06 | D1: require all three env variables for DB-less unit tests too; D2: a non-JWT service key on a hosted URL | Decide |
| WP06 | D3: wire in dependency-cruiser and license-checker (needs a baseline, or after WP12), or record the deviation in `docs/review-log.md` | Decide; `done-check.ts` stays manual |
| WP07 | D1: keep the explicit `check-refs` step (it is a named gate); D2: Dependabot for actions; D3: run `verify-hosted` once from the PR; D4: update the helper path mentions in `CLAUDE.md` and `.claude/rules` | Keep / decide / decide / yes |
| WP08 | Name the open round via an extra read, or carry its title on `ProcedureLockedError` (WP03's file) | Decide |
| WP08 | Unknown `toStatus` is a silent no-op; a foreign error code after the union split is rethrown or shown generically | Decide |
| WP08 | Thrown server-action errors are masked in production (`issuePasswordResetLinkAction`'s German text never reaches the screen). Give it its own package? | Yes, new finding |
| WP09 | Add jsdom and Testing Library to pin interactive handlers; keep the `seed` prop; `formatDateDe` stays separate | Decide |
| WP09 | 🛑 Set `APP_ORIGIN` in Vercel (production, preview) before deploy | Required |
| WP10 | Should register and claim map `email_taken`? Should `moved_in_on` stay a UTC date or become Berlin? | Unchanged in this package; reported |
| WP11 | Commit-failure repair code stays untouched (no test seam without editing `session-context.ts` or killing backends on dev) | Accept; a seam is a separate decision |
| WP11 | Incident logs: keep `accountId`, or only code plus error class? | Decide |
| WP12 | `forceChangeSettingWhileRoundOpen`: validate in place, or move to tests/helpers | Validate in place |
| WP12 | Casting keeps writing `household_settings` as a documented exception; rename `issueJoinCodeTx`?; update `docs/domain/kontextgrenzen.md` §4 or change the code | Exception yes / decide / decide |

## Ground rules (apply to every package)

### 1. Read before you write

These are mandatory, in this order:

- `CLAUDE.md`. It is the project's agent instructions; Cursor does not load it automatically.
- `.claude/rules/implementation-hazards.md`. Every hazard in it cost a review round. Re-read it before any lock, transaction, provider-call, migration or SECURITY DEFINER change.
- `.claude/rules/guardrail-lints.md`, `.claude/rules/openspec.md`, `.claude/rules/spec-ids.md`.
- The finding(s) your package covers in `audit/technical-debt.md`.
- For any Next.js code: the relevant guide in `node_modules/next/dist/docs/`. This Next.js version differs from training data.

**Verify before trusting.** Every file:line in a package was correct on `main @ 3401c94` (2026-10-01). Re-read the code before you edit it. If reality differs from the package, stop and report (rule 9).

### 2. One branch and one PR per package

- Branch from current `main`, named `<type>/wpNN-<topic>`, e.g. `fix/wp01-db-grants`.
- Never commit to `main`.
- Never force-push a shared branch.
- Open the PR only after `npm run verify` is green locally. The pre-push hook runs it anyway, so don't use `--no-verify`.

### 3. Refactor only under characterization tests

This is the audit's central rule.

- **Refactor (no behaviour change).** Allowed only where tests already pin the behaviour. The package says which tests. If a branch you would touch is not pinned, first write the missing characterization test. It passes against today's code. Then prove it can fail: make a deliberate one-line break, run the test, see it red, and revert the break. Record that in the PR description. Only then refactor.
- **Fix (behaviour change).** Characterization tests cannot protect the defect itself. So:
  1. Pin everything that must **not** change.
  2. Write the test for the intended new behaviour and see it **fail against current code**.
  3. Implement the fix, and see it pass.
- `npm run verify` must be green before your first commit and after every commit.
- Never weaken, skip, delete or loosen an existing test or lint to make a change pass. If an existing test encodes the defect (some do; the package names them), change it in the same commit as the fix and explain why in the commit body.

### 4. Hard floor: stop instead of routing around

G-C (authorization/visibility), G-D (the `[GUARDED]` tests in `test/guarded.manifest.json`) and G-L (no AI in housing decisions) are never violated. If a step seems to need it, stop and report. Disabling a check is itself a change that needs human approval (G-G3).

When you add a test that covers a G-D invariant, update `test/guarded.manifest.json` in the same commit. Never mark something `implemented` speculatively.

### 5. Migrations

- Next free number: check `ls drizzle/*.sql` (0027 is the latest on 2026-10-01). Follow `migration-shape.ts` for files after 0017:
  - an enum `ADD VALUE` alone in its file
  - `ADD COLUMN IF NOT EXISTS`
  - `DROP FUNCTION IF EXISTS` before a create
  - `search_path` on every `SECURITY DEFINER`
- Write every migration **re-runnable**.
- **You do not apply migrations.** A human applies `REVOKE`/`GRANT`, `SECURITY DEFINER`, `DROP` and anything privilege-related through the Supabase SQL editor on `flatmate-io-dev`. Stop at that point, say exactly which file to run, and wait.
- `DATABASE_URL` connects as `app_runtime`. Hand-run SQL through it matches zero rows under RLS and *reports success*. Don't use it for owner work.
- There are no foreign keys. A new household-scoped table must join the delete set in `tests/helpers/identity.ts` (the cleanup-inventory test fails otherwise).
- Every new column must be in `data-inventory.yml` with category, purpose, legal basis and retention for personal data.
- Never touch production (`cjinhzzvjryojvhngjjn`). Tests refuse it; you must too.

### 6. Tests hit a real database

- No mocking DB or auth calls; this follows the F0 precedent.
- Teardown belongs in `afterEach`, never in a `finally`.
- Anything unique project-wide (Auth email, join code) must be random per run, because `flatmate-io-dev` is shared with CI and other sessions.
- Concurrency tests must be deterministic. Hold an uncommitted transaction while the other path runs; see `tests/integration/policy/revoked-membership-sign-in.test.ts`.
- Assert error **codes/classes**, not only end states. A status-transition test asserts every column the statement writes.
- Expect ~80–90 s for the full suite against dev.

### 7. Spec and docs boundaries

- `docs/` is the spec handover package. Don't edit it unless the package says so.
- Never edit the frozen files `docs/04-*`, `docs/05-*`, `docs/07-*` or `tools/frozen.sha256`.
- `docs/` must never link into `openspec/` or `audit/`. Run `node tools/check-refs.ts` after any `docs/` edit.
- If a fix changes behaviour described in `openspec/specs/<capability>/`, update that spec **in the same commit**. Never edit `openspec/changes/archive/**`.
- Reasoning docs are German; code, comments, commits and everything under `openspec/` and `audit/` are English (ADR-012).

### 8. Commits

- Conventional commits: `fix(casting): …`, `refactor(identity): …`, `test(db): …`.
- One logical step per commit, and each commit is green.
- **No `Co-Authored-By` or any AI attribution line**, in commits or PR descriptions (`CLAUDE.md`).
- Husky's pre-commit hook runs `gitleaks protect --staged`, so gitleaks must be installed.

### 9. Stop conditions: report to the human instead of improvising

Stop and report when:

- the code differs materially from the package's "Current state"
- a step would need a human-gated action (migration apply, dashboard setting, docs change not named in the package)
- a guarded test would have to change
- you are about to touch a file reserved for change 2b (see above)
- the change grows beyond the package's scope

Partial, honest progress beats a complete-looking guess.

### 10. Hand-back

End every session with the report template at the bottom of the package file:

- what was done, commit by commit
- which characterization tests were added, and how each was seen failing
- verify output (pass/fail counts)
- open questions and anything skipped

Paste that report into the PR description.
