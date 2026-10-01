# WP06 · Environment guard and unwired tooling

> Paste into a fresh Cursor Agent session; read `audit/cursor/README.md` first.

## 1. Goal

- **#9** Replace the duplicated production **denylist** in `tests/setup.ts` and `scripts/seed-demo-household.ts` with one **allowlist** guard (`flatmate-io-dev` by default). It checks `DATABASE_URL` (including pooler forms), `NEXT_PUBLIC_SUPABASE_URL` and the service-role JWT's `ref` claim, requires all three to be set, and explicitly allows CI's local disposable stack without opening a hole.
- **#37 (part)** Make the demo seed safer (no fixed password, accurate failure message) and put the "recorded but not wired" tooling decisions (dependency-cruiser, license-checker-rseidelsohn, `tools/done-check.ts`) in front of a human with ready-to-execute branches.

## 2. Branch, dependencies, conflicts

- Branch: `fix/wp06-env-guard`, from current `main`. No dependencies.
- **Must not run in parallel with WP07.** WP07 owns `.github/workflows/ci.yml`; this package does **not** edit it (the CI drift step already allowlists the dev ref; aligning it with the new guard is a WP07 follow-up, listed in Phase C).
- May run in parallel with WP05 (no shared file). Touches: new `scripts/env-guard.ts`, `tests/setup.ts`, `scripts/seed-demo-household.ts`, new `tests/unit/` test, and, only after a human decision, `package.json` / `docs/review-log.md` (see Phase C).

## 3. Read first

1. `audit/cursor/README.md`, `CLAUDE.md`, `.claude/rules/implementation-hazards.md` ("Migrations": `DATABASE_URL` connects as `app_runtime`), `.claude/rules/guardrail-lints.md`.
2. `audit/technical-debt.md` findings #9 and #37.
3. `tests/setup.ts` (whole file; the guard sits in its first 35 lines), `scripts/seed-demo-household.ts`, `scripts/cleanup-demo-household.sql`, `.env.example`.
4. `.github/workflows/ci.yml` in full, and `scripts/ci/bootstrap-local-db.sh` (the `verify` job's environment is produced there).
5. `docs/MINIMAL-GATE.md` rows 8 and 9, `docs/GUARDRAILS.md` G-I1 / G-H2 (read-only), `tools/README.md` ("The four tools", the allowlist), `docs/review-log.md` line ~93 (tool choice marked "geschlossen").

## 4. Current state (verified 2026-10-01 on main @ 3401c94)

**#9 confirmed.**
- `tests/setup.ts:19-33` and `scripts/seed-demo-household.ts:42-53` each define `const PRODUCTION_PROJECT_REF = "cjinhzzvjryojvhngjjn"` and test `value?.includes(ref)` for `DATABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` only. An unset variable passes silently (`?.`); `SUPABASE_SERVICE_ROLE_KEY` is not looked at; any project other than production (staging, a recreated prod with a new ref) passes.
- The ref appears as a literal in exactly four files in the repo: those two, `ci.yml`, and `audit/cursor/README.md`. The dev ref `jrhkhjeybtkqpkggssif` appears in `ci.yml` only (hosted job env and the drift step).
- CI's drift step (`ci.yml` ~205-212) already does the safe thing in shell: `case "$DATABASE_URL" in *jrhkhjeybtkqpkggssif*) ;; *) exit 1`.
- **URL shapes** (`.env.example`): `DATABASE_URL="postgres://app_runtime.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@[YOUR-POOLER-HOST]:6543/postgres"`. So on a hosted project the **ref is the part of the username after the first dot** (`app_runtime.<ref>`) and the host is `aws-N-<region>.pooler.supabase.com`; a direct connection would be `db.<ref>.supabase.co` with user `postgres`/`app_runtime`. `NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"`.
- **CI's `verify` job runs against a local stack** (`scripts/ci/bootstrap-local-db.sh`, step 9, writes to `$GITHUB_ENV`): `DATABASE_URL=postgresql://app_runtime.pooler-dev:<generated>@127.0.0.1:54329/postgres`, `NEXT_PUBLIC_SUPABASE_URL=$API_URL` (a `127.0.0.1`/`localhost` URL, the script refuses any other host), `SUPABASE_SERVICE_ROLE_KEY` = the Supabase CLI's fixed local demo JWT. Its username tenant is `pooler-dev` (not a ref) and the demo service-role JWT has **no** `ref` claim (its issuer is the CLI's demo issuer). A naive "must contain the dev ref" guard would break every pull request. The guard therefore needs a loopback branch.
- `tests/setup.ts` runs for **every** test file, including the DB-less `tests/unit/lint/*` ones. Requiring the variables to be set means someone without `.env.local` can no longer run even those unit tests. That is a deliberate behaviour change (decision D1 below).

**#37 (audit claims checked).**
- dependency-cruiser and license-checker-rseidelsohn: `docs/MINIMAL-GATE.md` rows 8 and 9, `tools/README.md` and `docs/review-log.md` record them as the chosen tools; neither is in `package.json`, no config file exists, `verify` does not run them. Accurate.
- `tools/done-check.ts` "called by nothing": not called by `package.json`, CI, or a hook. It **is** documented (`tools/README.md`, `docs/README.md:215`, `docs/GUARDRAILS.md:1236`, `docs/COVERAGE.md`). Accurate for automation, slightly overstated for documentation. Its header says it is for the sprint branch ("Six conditions that must all hold before this branch merges into main").
- Seed: `PASSWORD = "demo-password-not-real-1234"` is a fixed literal printed at the end; `DEMO_EMAIL` is fixed so a re-run fails at "email already registered" (documented as "not idempotent by design"); the catch block tells the reader to sign in with `${DEMO_EMAIL} / ${PASSWORD}`. `scripts/cleanup-demo-household.sql` matches the demo household by the **email** only, so a random password does not break cleanup, but a random email would.

## 5. Package-specific hazards

- **The guard must fail closed and must not open a hole for CI.** Parse URLs with `new URL()` and compare the hostname **exactly** against `{"127.0.0.1", "localhost", "::1", "[::1]"}`. Never `includes("localhost")` or `endsWith` (`localhost.evil.test`, `evil-127.0.0.1.nip.io`). Loopback mode applies only when **every** URL variable that is set is loopback. A mix (local DB URL, hosted API URL) is refused, not half-allowed.
- A string that cannot be parsed, or a hosted URL from which no ref can be extracted, is a refusal, not a pass.
- The service-role JWT is **decoded, not verified** (no secret available). It is a tripwire against pointing at the wrong project, not an authentication check. Say so in the file header. Never log the key or any part of it; error messages name the variable and the ref found, nothing else.
- **gitleaks** (pre-commit and CI) scans test files: do not write a JWT-shaped literal in a test. Build the token at runtime (`header.payload.sig` from `Buffer.from(JSON.stringify({...})).toString("base64url")`).
- New-format Supabase keys (`sb_secret_…`) are opaque, not JWTs. For a **hosted** URL with a non-JWT key the guard cannot check the ref; decision D2 below. Local mode skips the key check unless it decodes to a JWT with a `ref`, in which case that ref must be allowlisted.
- Do not apply the guard to `src/db/client.ts` or any runtime path: production legitimately runs against the production ref. The guard is for the test suite and dev scripts only.
- Never put real credentials, ports from `.env.local`, or the production ref in new prose beyond what is already in the repo. The default allowlist contains the **dev** ref only; the production ref is no longer needed in code (an allowlist makes it redundant). Record this in the commit body.
- `scripts/` is scanned by `data-inventory.ts` for table-builder imports only; a new `scripts/env-guard.ts` is fine. `tsx` honours the `@/` alias (the seed already uses it).

## 6. Plan

### Phase A — characterization / failing tests

File: `tests/unit/scripts/env-guard.test.ts` (new; fake env objects, no network, no DB). The guard is a pure function `checkSupabaseEnv(env: Record<string, string | undefined>, options?): EnvGuardResult` plus a throwing wrapper `assertSafeSupabaseEnv(env = process.env, context: "tests" | "seed")`.

Create `scripts/env-guard.ts` with the signatures and a `throw new Error("todo")` body first so the test file imports; run it and see every case red. The existing behaviour (denylist) has no test, so the **pin** half is a table test against the old rule: *the production ref in `DATABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` is refused* (this stays true under the allowlist). Build tokens with a helper `fakeJwt(payload)`.

Cases (all expected red until Phase B step 2, except where noted):

1. Dev ref in all three (pooler `postgres://app_runtime.<dev>:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`, `https://<dev>.supabase.co`, JWT `{ref: dev, role: "service_role"}`) -> ok.
2. Production ref in `DATABASE_URL` only (pooler form) -> refused, naming `DATABASE_URL`; production ref in `NEXT_PUBLIC_SUPABASE_URL` only -> refused; production ref only in the JWT `ref` -> refused (this is the case the old guard missed).
3. An unknown third ref (`"aaaaaaaaaaaaaaaaaaaa"`) in any one variable -> refused (this is the allowlist's point; today's denylist passes it).
4. Each variable unset, and each empty string -> refused, naming the variable (today: silent pass).
5. Direct-host form `postgresql://postgres:pw@db.<dev>.supabase.co:5432/postgres` -> ok; same with `<unknown>` -> refused. A hosted URL with no extractable ref (`postgres://u:p@somehost.example:5432/db`) -> refused.
6. **CI local stack** (must be ok): `DATABASE_URL=postgresql://app_runtime.pooler-dev:pw@127.0.0.1:54329/postgres`, `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `SUPABASE_SERVICE_ROLE_KEY=fakeJwt({iss: "supabase-demo", role: "service_role"})` (no `ref`). Also `localhost` and `[::1]` hosts.
7. **Loopback must not be spoofable** (all refused): `http://localhost.evil.test:54321`, `http://127.0.0.1.nip.io`, `http://user@evil.test@127.0.0.1` style tricks that `new URL` parses to a non-loopback host, a hosted `NEXT_PUBLIC_SUPABASE_URL` with a loopback `DATABASE_URL` (mixed), and a loopback setup whose JWT carries `ref: <production>` or `ref: <unknown>`.
8. `ALLOWED_SUPABASE_REFS` override: `"<dev>,<other>"` (comma separated, trimmed) allows `<other>`; empty string falls back to the default (dev only). The production ref is not special-cased: an allowlist makes the literal unnecessary, and keeping it only to hard-refuse it would put it back in code. Pin only that an explicitly listed ref is allowed and the default is the dev ref.
9. Non-JWT service key on a hosted URL -> behaviour per decision D2 (default: refused with a message naming the variable). Malformed JWT (two segments, bad base64, non-JSON payload) on hosted -> refused; on loopback -> ignored.
10. Error text never contains the key value or the password (assert `message` does not include the password or any JWT segment used in the fixture).
11. Deliberate break: replace the exact hostname match with `url.hostname.includes("localhost")`, see case 7 red; remove the JWT check, see case 2c red; revert to `includes(prodRef)`, see case 3 red.

Seed test (cheap, same file or `tests/unit/scripts/seed-credentials.test.ts`): not a DB test. Extract the password generator to `scripts/env-guard.ts`? No (unrelated). Instead keep the seed change small and untested by unit test; verify manually (Phase B step 4) and say so in the hand-back.

### Phase B — change (one commit each, `verify`-green after each)

1. `test(env): characterization for the Supabase environment guard`: Phase A file with the stub, red as stated (commit it only together with step 2 if the hook requires green; otherwise squash 1+2 and record the red run in the PR description).
2. `fix(env): add one allowlist guard for the Supabase environment`: implement `scripts/env-guard.ts`:
   - `DEFAULT_ALLOWED_SUPABASE_REFS = ["jrhkhjeybtkqpkggssif"]` (dev); read `ALLOWED_SUPABASE_REFS` (comma list) when non-empty.
   - Required variables: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
   - `refFromUrl(raw)`: `new URL`; loopback -> `{kind: "local"}`; host `<ref>.supabase.co` -> ref; host `db.<ref>.supabase.co` -> ref; host ending `.pooler.supabase.com` -> ref = text after the first `.` in the username (`app_runtime.<ref>`); anything else -> refusal.
   - `refFromJwt(raw)`: split on `.`, base64url-decode segment 2, `JSON.parse`, return `payload.ref` if a string. No signature check (header comment says so).
   - All variables loopback -> ok (a JWT with a `ref` claim must still be allowlisted); otherwise every variable must resolve to an allowlisted ref; collect all problems and throw one `Error` listing them (variable name, reason, found ref), prefixed with the same guidance the old message had ("Point .env.local at flatmate-io-dev, see .env.example").
   - Make the Phase A cases green.
3. `refactor(tests): use the shared environment guard in the test setup`: in `tests/setup.ts` replace lines ~19-33 (keep the incident history comment, shortened to what the guard protects against: irreversible append-only `activity_event` rows) with `assertSafeSupabaseEnv(process.env, "tests")`, placed immediately after `config({ path: ".env.local" })` and before any dynamic import. Keep the comment about why the guard runs before the dynamic `./helpers/identity` import.
4. `fix(seed): use the environment guard and a per-run password`: in `scripts/seed-demo-household.ts` remove `PRODUCTION_PROJECT_REF` and the loop, call `assertSafeSupabaseEnv(process.env, "seed")` at the same place (still before any query). Replace the constant password with `process.env.DEMO_PASSWORD ?? randomBytes(18).toString("base64url")` (`node:crypto`), keep `DEMO_EMAIL` fixed (the cleanup SQL matches on it). Fix the catch-block hint: no more "sign in with email / password"; say "a demo household already exists: run scripts/cleanup-demo-household.sql in the Supabase SQL editor for flatmate-io-dev (as postgres), then re-seed". Update the file header comment ("Not idempotent by design" stays true; add that the password is random per run and printed once). Manual verification (no DB writes by you): run `npx tsx --env-file=.env.local -e "import('./scripts/env-guard').then(m=>m.assertSafeSupabaseEnv(process.env,'seed'))"` with a throwaway env that points at a fake non-allowlisted ref and see it refuse; do **not** run `npm run seed:demo` against any database.
5. `chore(env): .env.example names ALLOWED_SUPABASE_REFS` : add a commented, optional entry (default is the dev ref). `.env.example` is not under `docs/`.

### Phase C — follow-through

- Run `npm run verify` locally (hits dev; the guard must pass with the developer's `.env.local`). Then simulate CI's local-stack env without a stack: `DATABASE_URL=postgresql://app_runtime.pooler-dev:x@127.0.0.1:54329/postgres NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<fake demo-style jwt built in-shell> npx vitest run tests/unit/scripts/env-guard.test.ts` is enough; the real proof is the pull-request `verify` job on this branch. **Watch that job**; if `tests/setup.ts` refuses in CI, stop and report the exact message.
- 🛑 HUMAN D1: confirm that requiring `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for every test file (including DB-less unit tests) is acceptable. Alternative if not: apply the "required" part only to files under `tests/integration/**` via a second `setupFiles` entry or a per-file guard, and keep the allowlist check for whatever is set. Recommended default: require (a half-configured environment should not run anything).
- 🛑 HUMAN D2: hosted URL plus a non-JWT (`sb_secret_…`) service key: refuse (default, fail closed) or allow with a warning. Check what the dev project's real key looks like **without printing it** (length/prefix only).
- **WP07 follow-up** (hand to that package, do not do it here): make the CI drift step's `case` statement read the same default ref, or note why it stays shell-only.
- 🛑 HUMAN D3 (#37): tooling decision. Present both branches, do not choose:
  - **Option W (wire in).** `npm i -D dependency-cruiser license-checker-rseidelsohn` (network, changes `package-lock.json`). `dependency-cruiser`: a `.dependency-cruiser.cjs` with `forbidden` rules encoding ADR-001 (a module's `schema.ts` and `repository.ts` are not importable from another module; `src/app` may import module public functions only; nothing imports `src/db/client.ts` outside `src/db/**` and `*/repository.ts`) and `tsConfig: { fileName: "tsconfig.json" }`; add `depcruise src --config` to `verify`. **It will not pass today**: `casting/repository.ts` imports `@/modules/identity/schema` and `audit/repository.ts` imports the identity enums (finding #13, fixed by WP12). So either generate a baseline of known violations (`depcruise --init` then `--output-type baseline`; commit it; WP12 deletes entries as it fixes them) or sequence the wiring after WP12. `license-checker-rseidelsohn`: `--production --onlyAllow "MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;0BSD;Unlicense;CC0-1.0;Python-2.0"` (the allowlist in `tools/README.md`); run it first and **report** every package it rejects (SPDX expressions such as `(MIT OR Apache-2.0)`, `MPL-2.0`/`LGPL` native image binaries pulled by Next, `CC-BY-4.0` data packages are likely). Widening the allowlist is a G-H2 decision for the human, never the agent. Decide production-only vs all dependencies.
  - **Option R (record the deviation).** Add rows to `docs/review-log.md` §Offene-Punkte-Register (the only place status lives) stating the tools are chosen but deferred, why, and the reopening condition. This edits `docs/`: run `node tools/check-refs.ts` afterwards, never edit the frozen files, write German in the reasoning doc (ADR-012).
  - In either case also decide `tools/done-check.ts`: (a) leave it manual and documented, (b) add a CI step `node tools/done-check.ts` (its six conditions concern the sprint branch; run it first and report whether it passes on `main`), (c) retire it by a human-recorded decision (docs mention it in four places). Recommended: (a) now.
- Do not start Option W or R without the human's answer; stop and hand back.

## 7. Acceptance criteria

- [ ] One `scripts/env-guard.ts`; the production-ref literal no longer exists in `tests/setup.ts` or the seed (`grep -rn cjinhzzvjryojvhngjjn tests scripts src` finds nothing).
- [ ] Unit tests cover cases 1-10; each was seen red against the stub and the three deliberate breaks (case 11) were seen red.
- [ ] Unset or empty required variable, unknown ref, production ref in URL or JWT, mixed local/hosted: refused. Dev-only hosted setup and the CI local-stack setup: accepted.
- [ ] Pull-request CI `verify` job (local stack) is green on this branch; local `npm run verify` (dev) is green.
- [ ] Seed: no fixed password in source, hint message correct, still uses the fixed `DEMO_EMAIL`; not run against a database by the agent.
- [ ] Error messages leak no key, password or JWT segment.
- [ ] D1, D2, D3 raised to the human with the options above; nothing under `docs/` or `package.json` changed without an answer.

## 8. Out of scope & stop conditions

Out of scope: `ci.yml` (WP07), runtime guards in `src/`, `JOIN_ATTEMPT_TRUSTED_IP_HEADER` startup assertion (finding #39, WP01/WP02), idempotent seeding (a `--reset`/upsert mode), rotating any real key.

Stop and report if: CI's `verify` job fails in `tests/setup.ts`; `.env.local` of the developer fails the new guard (print only which variable and why); a decision D1-D3 is needed before continuing; the production ref or any real key would have to be written into a new file.

## 9. Hand-back report (template)

```
WP06 hand-back
Commits: <hash> <subject>
Guard: file scripts/env-guard.ts; allowlist default = dev ref; env var ALLOWED_SUPABASE_REFS; required vars; loopback rule (exact hostnames)
Tests: cases 1-10 red-before/green-after: <list>; deliberate breaks seen red: <list>
CI: pull-request verify job result <link/status>; local verify <counts>
Seed: password source; hint message; manually verified refusal with a fake ref: yes/no
Behaviour changes to confirm: D1 (require vars for all tests) <answer/pending>; D2 (non-JWT key on hosted) <answer/pending>
#37: D3 options presented <yes>; answer <W/R/pending>; done-check recommendation <a/b/c>; license-checker dry-run findings (if run) <rejected packages list or not run>
WP07 follow-up noted: CI drift step vs guard default
Skipped / open questions: <...>
```
