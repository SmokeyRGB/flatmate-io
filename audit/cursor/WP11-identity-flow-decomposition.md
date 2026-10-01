# WP11 · Identity: decompose the credential flows, incident logging, comments to invariants

> One-line: paste into a fresh Cursor Agent session; read audit/cursor/README.md first.

## 1. Goal

All of this is in `src/modules/identity/auth.ts`, and none of it may change behaviour:

- **#6:** break `signIn`, `joinHousehold`, `changeResidentEmail`, `changeResidentPassword` and `redeemPasswordReset` (170–305 lines each) into named, individually reviewable pieces. Replace the loose mutable flags with one small state object per flow. Remove the `data.session!` assertions and the over-narrowing cast.
- **#19:** replace the bare `console.error(err)` calls with one `logIdentityIncident(code, …)` that logs a code and error class, never values.
- **#27:** turn changelog-style comments ("Copilot review round 4 (PR #23)…") into one invariant sentence per function. History lives in git and `openspec/changes/archive/`.

Hard decision for #6, argued in §5 (H1): **the commit-failure repair code is not touched in this package.** There is no way to execute it in a test that this repository allows, so it stays where and as it is. Only the code *around* it is extracted.

## 2. Branch, dependencies, conflicts

- Branch: `refactor/wp11-identity-flow-decomposition`, from `main` **after WP10 is merged** (WP10 introduces the lock helpers, `createAuthUserOrCompensate`, `withResend`, `updateEmailClassified`/`updatePasswordClassified` that this package builds on).
- Start only after F3 change 2b is merged (WP10 already requires it).
- **Step 0: re-verify "Current state".** 2b changed `identity/repository.ts`, and WP10 moved a lot of `auth.ts`. Every line number in §4 is from `main @ 3401c94` and **will have shifted**. Re-derive each from the code.
- Never touch permission semantics (role checks, permission constants, the 0024/0027 CHECKs, `getResidentList`, `getNavigationAccess`).
- Not in parallel with WP10 or WP12. WP12 depends on this package (it moves the files you are about to tidy).

## 3. Read first

1. `audit/cursor/README.md`, `CLAUDE.md`, `.claude/rules/implementation-hazards.md` (all of "No transaction spans Postgres and Supabase Auth", "Every writer of the same state, pairwise", "Tests that can fail").
2. `audit/technical-debt.md` findings #6, #19, #27, and the WP10 file `audit/cursor/WP10-identity-provider-and-dedup.md` (its A1 diff table and its hazards H1/H2/H6 carry over).
3. `src/modules/identity/auth.ts` entire, `auth-provider.ts`, `session-cookie.ts`.
4. Tests that pin these flows (read each before you touch its flow):
   - signIn: `unit/identity/sign-in-enumeration.test.ts`, `unit/identity/resident-sign-in-validation.test.ts`, `unit/identity/remember-me-session-lifetime.test.ts`, `integration/policy/sign-in-provider-address.test.ts`, `sign-in-resident-email.test.ts`, `sign-in-credential-generation.test.ts`, `revoked-membership-sign-in.test.ts`, `provider-deadline-sign-in.test.ts`
   - join: `integration/policy/join-by-link.test.ts`, `join-bound-link.test.ts`, `join-refusals.test.ts`, `join-existing-member.test.ts`, `join-atomicity.test.ts`, `join-email-provider.test.ts`, `join-open-round.test.ts`, `join-rate-limit.test.ts`, `provider-deadline-create-user.test.ts`; `unit/identity/join-name-collision.test.ts`, `claim-resident-profile-validation.test.ts`
   - email/password: `integration/policy/account-settings-email.test.ts`, `account-settings-password.test.ts`, `provider-deadline-email.test.ts`, `provider-deadline-password.test.ts`, `provider-deadline-lock-release.test.ts`, `credential-lock-order.test.ts` (WP10)
   - reset: `integration/policy/password-reset-link.test.ts`, `provider-deadline-reset.test.ts`
   - logging style to copy: `unit/identity/join-code-never-in-query-or-log.test.ts` and `unit/casting/capture-action.test.ts` (spies on every console method and asserts that no sentinel value appears in anything logged)
   - `unit/lint/cleanup-inventory.test.ts` (WP10 hazard H1: it text-parses `registerHousehold` and `undoRegisterHousehold` in `auth.ts`)

## 4. Current state (verified 2026-10-01 on main @ 3401c94)

All line numbers are for `src/modules/identity/auth.ts` as of `main @ 3401c94`, before WP10. Re-verify (step 0).

**Function sizes: the audit's numbers are exact.** `signIn` 553–755 (203 lines), `joinHousehold` 850–1105 (256), `changeResidentEmail` 1353–1526 (174), `changeResidentPassword` 1640–1921 (282), `redeemPasswordReset` 2073–2377 (305). Comments make up 1077 of the file's 2377 lines (45%).

**Mutable state crossing `try`/`catch` (the flags):**

| Flow | Flags | Written in | Read in |
|---|---|---|---|
| `changeResidentEmail` | `providerOutcome: "none" \| "applied" \| "unknown"` | transaction callback (1437, 1456, 1459) | `catch` (1463, 1485) |
| `changeResidentPassword` | `needsCommitFailureRepair: boolean`; `safeDirectionCode: "password_unchanged_sessions_ended" \| "password_uncertain_sessions_ended" \| null` | callback (1795, 1819, 1830–1831) | `catch` (1835, 1874, 1886) and after the `try` (1913) |
| `redeemPasswordReset` phase 2 | `providerUpdated: boolean`; `passwordOutcome: "set" \| "unknown"` | callback (2222, 2249, 2257, 2268) | `catch` (2271); phase 3 `catch` (2350) |
| `redeemPasswordReset` phase 3 | `phase3CheckOutcome: "ok" \| "wrong_password" \| "unknown"`, default `"unknown"` | callback (2326) | `catch` (2357) |

**Over-narrowing cast.** The audit says `~:2323`. The actual line is **2357**: `const checkOutcome = phase3CheckOutcome as "ok" | "wrong_password" | "unknown"`. TypeScript narrows a `let` that is reassigned inside a closure to its initializer type. A property on an object does not get narrowed from an initializer, so a state object removes the need for the cast (verify with `tsc`).

**`!` assertions: the audit is right.** `data.session!.access_token` at 746 (the guard is at 665) and `signInData.session!.access_token` at 1087 (guard at 986). They exist because TypeScript loses the narrowing inside the transaction callback. Fix: take `const accessToken = data.session.access_token` right after the guard, before the closure.

**Commit-failure (`change_incomplete`) branches are never executed.** Both tests say so in their own words:

- `integration/policy/account-settings-email.test.ts` ~201–215: "argued, not executed".
- `account-settings-password.test.ts` ~86–92: same.

The `provider-deadline-*` tests exercise the *unknown-outcome* branches through the fault injector, which only drops responses, so they never reach the repair transaction either. Branches that tests do not execute: email repair after a failed commit (1474–1524), password repair (1844–1907), reset phase 2 commit failure (2270–2278).

**`console.error`: the audit's "18" is inaccurate. `auth.ts` has 12 calls.** The other 6 grep matches are the words "console.error" inside comments (1138, 1335, 1618, 1968, 1998, 2011). The 12 calls:

| Line | Where | Logs |
|---|---|---|
| 86 | `deleteAuthUserBestEffort`, delete outcome unknown | a new Error whose text contains the account id |
| 89 | same, thrown error | the raw error |
| 106 | `deleteAuthUserUnlessCommitted`, the "is it committed?" read failed | raw error |
| 259 | `registerHousehold` catch, undo failed | raw error |
| 1225 | `resolveEmailWriteOutcome`, resend refused | `AuthError` |
| 1518, 1519 | `changeResidentEmail` repair failed | original error and repair error |
| 1901, 1902 | `changeResidentPassword` repair failed | same pair |
| 2234 | reset phase 2, provider refused | `AuthError` |
| 2277 | reset phase 2, commit failed after the write | raw error |
| 2349 | reset phase 3 failure | raw error |

`settings/actions.ts` and `(auth)/join/[code]/actions.ts` (and others under `src/app/`) also have bare `console.error(err)`. **Out of scope here** (they are WP08's area). Mention them in the hand-back.

**Why logging the raw error is a real problem, not style.** Verified in `node_modules`: `drizzle-orm@0.45.2`'s `DrizzleQueryError` builds its message as ``Failed query: ${query}\nparams: ${params}`` and keeps `query`/`params` as properties. A failed insert of an `account` or `resident_profile` row therefore prints the bound values (email, display name, token hash). `postgres`'s `PostgresError` copies the server's `detail` onto the error, and a unique violation's `detail` contains the conflicting value. The precedent in `src/app/(org)/rounds/[id]/applications/new/actions.ts` logs only `{ code, sqlState, constraint }` or `{ code: "unexpected", name }`.

**Comment history, counted on `auth.ts` (line matches):** "Copilot review round" 34, "PR #<n>" 38, "pre-mortem" 9, "review fix" 6. The union of those and "Copilot" is **54 lines**. The audit's "34" counts only the first pattern. `identity/repository.ts` has 11 such lines and `casting/repository.ts` 9 (pattern also matches "code review").

**Orphaned comment: audit is right.** `auth.ts` 298–302 ("FR-1.5: the household account creates a resident profile … via claimResidentProfile below") sits above `ClaimErrorCode`, but describes `createResidentProfile` in `repository.ts`, which already has its own FR-1.3/FR-1.5 comment (~71–73).

**Stale "line ~NNN" reference:** none in `auth.ts`. The one in the identity module is `identity/repository.ts` ~1479 ("`revokeMembershipForProfileTx`'s comment ~line 526"). Other places with line-number prose, not in this package: `src/modules/casting/transitions.ts` 17–40 (lines of a living doc, `docs/domain/zustandsmaschinen.md`; spawn a follow-up, do not fix here), and a test comment in `cleanup-inventory.test.ts` ("~line 824").

## 5. Package-specific hazards

- **H1: the commit-failure repair is untouchable here.**
  - *Options.* (a) add a seam that forces a commit failure in tests, then pin the repair branches first; or (b) forbid touching repair code in this package.
  - *Recommendation: (b).*
  - *Why not (a).*
    - A seam inside `withSessionContextOn` (`src/db/session-context.ts`) puts a test hook into the one function G-C8 and the hazards file single out. Every request would pass through it.
    - Forcing a real commit failure with `pg_terminate_backend` needs to identify the right backend among the shared `flatmate-io-dev` pool. CI and other developers' pre-push runs hold same-role connections there, so a wrong guess kills someone else's transaction.
    - A constraint deferred to commit needs DDL (a migration), which is human-gated and would exist only for a test.
    - A local-only variant skips on the dev database, so it would run in CI alone and cannot be seen failing locally.
  - *What (b) means concretely.*
    - The three repair `catch` bodies stay inline, byte for byte: email repair (1474–1524), password repair (1844–1907), reset phase 2 commit-failure fall-through (2270–2278).
    - You may change only identifiers that the state-object refactor forces (e.g. `providerOutcome` → `state.providerOutcome`) and the `console.error` calls in step B9.
    - `git diff --color-moved=dimmed-zebra` must show every other line in those blocks unchanged. Put the diff evidence in the PR.
    - Do **not** create `repairEmailAfterCommitFailure`/`repairPasswordAfterCommitFailure`; the audit's name for that extraction is deferred.
  - *Follow-up (not scheduled; record it).* A future WP can extract those two functions once a commit-failure seam exists. It needs a human decision on which seam.
- **H2: the sign-in request sequence is a security property.** D11 (see the comment at 613–626): a resolving name and a non-resolving name must send the *identical* provider request sequence (`GET /admin/users/:id` → `readDatabaseClock` → `POST /token`). `resolveSignInEmail` must keep the lookup of a random id for an unknown name, the same position of `readDatabaseClock`, and the same `provider_unavailable` throw. `sign-in-enumeration.test.ts` and `provider-deadline-sign-in.test.ts` pin it; run them first.
- **H3: refusal precedence in `joinHousehold`.** Order today: password rule → email normalize/validate → `resolveJoinCode` → purpose check → `currentSession` → bound/neutral display-name rule → name collision (`isDisplayNameTaken`, neutral only) → createUser → … `validateJoinInput`, `assertJoinable` and `writeJoinRowsTx` must call these in this order, and nothing earlier may become a database or provider call.
- **H4: provider call placement.** No provider call may move relative to its lock or to the commit. The extracted `...Tx` functions take the `tx` the caller holds (no nested `withSessionContext`, which throws `NestedSessionContextError`).
- **H5: `cleanup-inventory.test.ts` (WP10 H1).** It takes the text from `export async function registerHousehold(` to the next top-level `\nexport `, and from `export async function undoRegisterHousehold(` to the next `\nexport `. Do not extract `registerHousehold`'s inserts. Do not place new private helpers between those two functions or between `undoRegisterHousehold` and the next export.
- **H6: `logIdentityIncident` changes what is logged.** Today's logs include the error message and stack. After step B9 they contain a code and error class only. That is the point (§4) but it is a deliberate change of an operational interface. Flag it as a human decision (below).
- **H7: do not unify the three error families.** `JoinError`, `AccountSettingsError`, `SignInError`, `RegistrationError`, `ClaimError` keep their classes, codes and messages. (Actions `switch` on `code`.)
- **H8: the post-commit throw.** `changeResidentPassword` deliberately throws the safe-direction error *after* a successful commit (1913–1920), and `change_incomplete` instead if the commit failed. The two paths must not be merged.

## 6. Plan

### Phase A — characterization / failing tests

Every test here passes on today's code, and must be seen failing against a named one-line break (README rule 3). Record break → red test in the hand-back.

**A1. Re-derive and freeze the branch inventory.** For each of the five flows, list every `throw` and `return` with its code, in a table in the PR description. Mark each as "executed by <test>" or "not executed". This is the baseline you compare against at the end. (Same rule as WP10 A1: do not trust the table in §4 without checking.)

**A2. Refusal precedence tests for `joinHousehold`** (H3), table-driven, in `tests/integration/policy/join-refusal-precedence.test.ts`. Use a real link and a real household, with a unique email and a unique name per row. Each row supplies several simultaneously bad inputs and expects the first code in the order of H3. Examples:

- empty password + malformed email → `missing_fields`.
- weak password + malformed email → `password_too_short`.
- valid password + malformed email + a non-existent code → `invalid_email`.
- valid input + a `password_reset` link used as a join link → `invalid_link`.
- valid input + a neutral link + empty display name → `missing_fields`.
- valid input + a neutral link + a taken name → `name_taken`, and **no Auth user created** (assert via `adminClient().auth.admin.listUsers` filtered by the test email, or via the fault injector's `record` rule showing no `POST /admin/users`).

Check first which rows `join-refusals.test.ts` and `join-existing-member.test.ts` already pin; add only the missing rows. To see it fail: swap the email check and the `resolveJoinCode` call in `joinHousehold`.

**A3. Pure decision-table tests, written together with their extraction** (step B-commits below). These tables are pure functions of their arguments, so they need no database and are the cheapest characterization available:

- `mapResetPhase3Failure(err, passwordOutcome, checkOutcome)` → `JoinError` code: `invalid_link` passes through; `set` → `reset_done_sign_in_failed`; `unknown` + `wrong_password` → `reset_incomplete`; `unknown` + other → `reset_outcome_unknown`.
- `safeDirectionError(code)` → message and code for `password_unchanged_sessions_ended` / `password_uncertain_sessions_ended`.
- `validateNewEmail(raw)` → `missing_email` / `invalid_email` / the normalised address.
- `validatePasswordChange(current, next)` → `missing_fields` / `password_too_short` / ok.

Each one is written as a table test first against the *inline* code by exercising it through the existing integration entry point, **or**, where that is not possible, by extracting it unchanged in the same commit and asserting the table. Either way it must be seen failing against a break of the mapping (e.g. swap two codes).

**A4. Incident-log test (before B9).** `tests/unit/identity/incident-log.test.ts`, style of `unit/casting/capture-action.test.ts`: spy on `console.error/log/warn/info`, collect all arguments, and for each cause below assert the output has the `code`, the error `name`, and none of the sentinel values (`JSON.stringify` of everything logged):

- an `Error` whose `message` contains a sentinel email;
- a `PostgresError`-shaped object with `detail: "Key (email)=(sentinel@…) already exists."`, `code: "23505"`, `constraint_name`;
- a `DrizzleQueryError`-shaped object (`query`, `params` containing sentinels, `cause` = the Postgres-shaped error);
- an `AuthError`-shaped object (`name: "AuthApiError"`, `status: 422`, `code: "email_exists"`, message with a sentinel);
- a non-error (`"a string with sentinel"`).

Expected: allowed output fields are `code`, `accountId` (if passed), and per cause only `name`, plus `status`/`code` for provider errors and `sqlState`/`constraint` for database errors. Nothing else. Write it against the final helper API in B9; it is red until the helper exists. Also add one integration pin (same file or a sibling) that reuses the `cannot tell` scenario from `provider-deadline-reset.test.ts`: assert `console.error` is called once with `code: "reset_phase3_failed"` and the test's email/password do not appear in anything logged. If a scenario setup is too long to copy, import its helper functions; do not edit the existing test.

**A5. Structural guard for the flags.** None needed beyond `tsc`: with a typed state object a wrong write is a compile error. Do not add a test for that.

### Phase B — change (numbered = one green commit each; `npm run verify` before and after)

Work from the leaf outwards. Place all new private helpers in the top region of `auth.ts` (above `registerHousehold`'s comment block) or after a later export, never between `registerHousehold` and the next export (H5).

1. `refactor(identity): hoist the access token out of the transaction callbacks`. `signIn` and `joinHousehold`: `const accessToken = …session.access_token` right after the guard; delete both `!`. No other change.
2. `refactor(identity): resolveSignInEmail`. Lines 564–643 become `async function resolveSignInEmail(input): Promise<string>`. The `kind` narrowing stays inside it. `signIn` keeps `readDatabaseClock` and the password check. H2: run the enumeration and sign-in tests.
3. `refactor(identity): validateJoinInput and assertJoinable`. `validateJoinInput(input)` returns `{ password, email, displayNameInput }` (password rule, email normalize/validate). `assertJoinable(code, displayNameInput, options)` returns `{ resolved, bound, displayName, residentProfileId, derivedEmail?… }` and contains steps resolve → purpose → current session → bound/neutral → name collision (H3). `joinHousehold` shrinks to: validate, assert, `createAuthUserOrCompensate`, the try block.
4. `refactor(identity): writeJoinRowsTx`. The body of the join transaction callback (claim → activate/insert profile → account → membership → event → session) as `writeJoinRowsTx(tx, params): Promise<JoinHouseholdResult>`. It uses WP10's `activatePreparedProfileTx`/`insertResidentMembershipTx`. Statement order unchanged. Check `join-atomicity.test.ts` and the `cleanup-inventory` test.
5. `refactor(identity): email-change state object and applyEmailChangeTx`. `const state: { providerOutcome: "none" | "applied" | "unknown" } = { providerOutcome: "none" }`; the transaction callback body becomes `applyEmailChangeTx(tx, { context, sessionId, email }, state)`; `validateNewEmail(raw)` is extracted (pure, A3 table). The `catch` block is **not** moved or restructured (H1); only `providerOutcome` → `state.providerOutcome` inside it.
6. `refactor(identity): password-change state object, applyPasswordChangeTx, checkCurrentPasswordTx`. `state = { needsCommitFailureRepair: false, safeDirectionCode: null }`; `validatePasswordChange` (pure); the lines 1725–1750 block (address lookup + current-password check) as `checkCurrentPasswordTx(tx, context, currentPassword)` returning the provider address (the provider calls stay inside the transaction, under the locks, exactly where they are); `applyPasswordChangeTx(tx, …, state)`. `safeDirectionError(code)` extracted for the post-commit throw (A3 table). H8: both throw sites remain separate.
7. `refactor(identity): reset phases as functions`. `phase1ClaimAndRevokeTx(tx, …)` returns `{ accountId, profileId }`; `phase2WritePasswordTx(tx, …, state)` with `state = { providerUpdated: false, passwordOutcome: "set" }`; `phase3SignInTx(tx, …, state)` with `phase3CheckOutcome` in the same object; `mapResetPhase3Failure(err, state)` pure (A3 table), which replaces the cast at 2357. The phase 2 `catch` fall-through (2270–2278) stays inline (H1). The three phases stay three separate `withSessionContext` calls.
8. `refactor(identity): signIn reads as a sequence`. After steps 1–2 `signIn` should be `resolveSignInEmail` → clock → password check → bootstrap household → locked transaction. Extract the transaction callback as `openSignInSessionTx(tx, …)` only if it reduces the function below about 60 lines without moving a lock (WP10 lock helpers). Otherwise stop here.
9. `refactor(identity): logIdentityIncident`. New file `src/modules/identity/incident-log.ts` (a new module is justified: it is needed by `auth.ts` now and by `repository.ts`/the WP12 split files next, and unit-testable without importing `auth.ts`'s provider/database imports). API:
   - `type IdentityIncidentCode` = a closed union: `register_undo_failed`, `provider_delete_unconfirmed`, `provider_delete_failed`, `commit_state_check_failed`, `email_resend_refused`, `email_repair_failed`, `password_repair_failed`, `reset_write_refused`, `reset_phase2_commit_failed`, `reset_phase3_failed`;
   - `logIdentityIncident(code, info?: { accountId?: string; cause?: unknown; repairCause?: unknown })` calls `console.error({ code, accountId, cause: describe(cause), repairCause: describe(repairCause) })`, where `describe` returns only `{ name }` plus `status`/`code` for a provider error, `sqlState`/`constraint` for a database error (unwrapping a Drizzle `cause`), and `{ name: typeof value }` otherwise.
   - Replace the 12 calls one by one, each commit green. Where today's code logs two errors (1518/1519, 1901/1902), log one entry with `cause` and `repairCause`.
   - The calls inside the repair blocks (H1) are replaced as a call-for-call swap only; no surrounding line changes. `deleteAuthUserBestEffort`'s `new Error("… account ${accountId} …")` becomes the `provider_delete_unconfirmed` code plus `accountId`.
   - The A4 tests turn green.
   - Do not touch `src/app/**` loggers.
10. `docs(identity): comments state invariants, not history` — **last step, one commit per function** (≈ 15 commits: `registerHousehold`, `undoRegisterHousehold`, `claimResidentProfile`, `hashSessionToken`/`joinAttemptSourceHash`, `signIn`, `JoinErrorCode` union, `joinHousehold`, `AccountSettingsErrorCode` union, `readBackEmailOutcome`/`resolveEmailWriteOutcome`, `changeResidentEmail`, `resolvePasswordWriteOutcome`, `changeResidentPassword`, `redeemPasswordReset`, then `identity/repository.ts`). Rules:
    - Keep every sentence that states a **live invariant**: what is locked and in which order, what each failure point leaves behind, why a call is last before commit, why `clock_timestamp()` and not `now()`, why the domain-separation prefix exists, why a check is repeated under a lock. Rewrite it as present tense, one invariant per sentence.
    - Delete only these: "Copilot review round N", "PR #N", "pre-mortem finding N", "review fix", "(task 7.4)", "as before this change", and narratives of how an earlier version was wrong. If a sentence mixes history and invariant, keep the invariant half.
    - **Never delete a comment that explains why code is shaped as it is** until you can name the test that fails without that shape. If you cannot, keep it.
    - Keep pointers to a decision where it saves a reader a search (`openspec/changes/archive/<name>`, `docs/…` ids), written as a plain reference. Do not add pointers to `audit/`.
    - Orphaned comment 298–302: it describes `createResidentProfile`, which already has its own comment in `repository.ts`. Delete it from `auth.ts` and make sure the FR-1.5/ADR-013 fact ("never occupies the profile") is present on `createResidentProfile`.
    - The "Lock order:" prose was already reduced to one sentence in WP10 step 11; if it reappeared in the commit-failure blocks, leave those blocks (H1) and only trim the comment text above the function.
    - Fix the stale `~line 526` reference in `repository.ts` (~1479): say "the convention in `revokeMembershipForProfileTx`" instead of a line.
    - Do **not** change any code in these commits. Verify by `git diff -w --stat` plus a check that `git diff` hunks contain only comment lines (e.g. `git diff -U0 | grep '^[+-]' | grep -v '^[+-]\s*//'` prints only file headers). Paste that check's output in the PR.
    - Target: no match for `Copilot|PR #\d|pre-mortem|review fix` in `auth.ts` (and in `identity/repository.ts`; leave `casting/repository.ts` for WP12).

### Phase C — follow-through

- `npm run verify`; paste pass counts. Expect ~80–90 s of tests against dev.
- `git diff --color-moved=dimmed-zebra main...HEAD -- src/modules/identity/auth.ts`: attach evidence that the repair blocks (H1) changed only by the allowed identifiers and logger calls.
- Compare the A1 branch inventory with the final code: every `throw`/`return` code still exists with its message. Attach the comparison.
- If any behaviour in `openspec/specs/identity-*/` names a function or log you changed, update that spec in the same commit as the code (README rule 7). Do not edit `openspec/changes/archive/**`. Do not touch `docs/`.
- 🛑 HUMAN: nothing is human-gated (no migration, no dashboard). Decide the "Open human decisions" below before merge.

## 7. Acceptance criteria

- [ ] §4 re-verified after 2b and WP10; deviations listed.
- [ ] A1 branch inventory in the PR; unchanged at the end.
- [ ] No `!` after `session` in `auth.ts`; no `as` cast of a flag; the flags live in typed state objects.
- [ ] `signIn`, `joinHousehold`, `changeResidentEmail`, `changeResidentPassword`, `redeemPasswordReset` each fit on about one screen of steps (target under ~80 lines of body each, outside the untouched repair blocks); each extracted piece has a single reason to change.
- [ ] The three repair blocks (H1) are byte-identical except for state-object identifiers and logger calls; diff evidence attached.
- [ ] Join refusal precedence pinned by A2 and seen red against a swap.
- [ ] Decision tables (A3) pinned and seen red.
- [ ] `incident-log.test.ts` green; `auth.ts` has zero bare `console.error(err)` calls; every incident has a code; nothing logs a message, stack, query, params or `detail`.
- [ ] No match for `Copilot|PR #\d|pre-mortem|review fix` in `auth.ts`; comment commits touch only comment lines (check pasted); no live invariant lost (reviewer spot-check list in the PR: lock order, last-before-commit, `clock_timestamp()`, safe direction, D11 timing).
- [ ] `cleanup-inventory.test.ts`, `authorization-matrix.test.ts` and the `provider-deadline-*` tests unchanged and green. No existing test edited, skipped or loosened.
- [ ] `npm run verify` green. No `Co-Authored-By`. No migration.

## 8. Out of scope & stop conditions

Out of scope:

- The repair blocks (H1); a commit-failure test seam.
- Moving code to other files (WP12), `src/app/**` loggers (WP08), permission semantics, new behaviour of any kind.
- Fixing `casting/transitions.ts`'s line-number prose (record it for a follow-up).

Stop and report when:

- a step would change a code, message, order of checks or provider-call position;
- an extraction needs a variable that is mutated in the repair path other than through the state object;
- `cleanup-inventory.test.ts` fails;
- a comment you want to delete is the only explanation of a lock, an ordering or a failure state and you cannot name its test;
- WP10 or 2b is not merged.

## 9. Hand-back report (template)

```
WP11 hand-back
Branch / PR:                 WP10 merged at: <sha>      2b merged at: <sha>
Re-verification (§4): deviations: <list or "none">
Commits (step number, one line each):
Characterization tests added (file → break → red test names):
  - join-refusal-precedence →
  - mapResetPhase3Failure / safeDirectionError / validateNewEmail / validatePasswordChange →
  - incident-log (unit + reset pin) →
A1 branch inventory: before == after? <yes / list of differences>
H1 evidence: repair blocks changed only by: <list>; git diff --color-moved attached
Comment clean-up: matches before → after (Copilot / PR # / pre-mortem / review fix): auth.ts 54 → <n>; identity/repository.ts 11 → <n>
Comment-only check output: <pasted>
npm run verify: <pass/fail>, vitest <passed>/<total>, duration
Skipped (reason): e.g. step 8 if it did not shorten signIn
Open human decisions:
  1. Log content changes from "whole error" to "code + class" (H6): accept? Include accountId in incident logs (it is a pseudonymous id)?
  2. Follow-up WP to extract repair functions: which commit-failure seam (not scheduled).
  3. src/app/** loggers still log raw errors (WP08).
Audit claims found inaccurate: console.error 18 → 12 calls (6 in comments); cast line ~2323 → 2357; comment-history count 34 → 54 lines; stale line ref is in repository.ts not auth.ts
```
