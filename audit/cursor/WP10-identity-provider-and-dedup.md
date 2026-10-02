# WP10 · Identity: provider-call classification and de-duplication

> One-line: paste into a fresh Cursor Agent session; read audit/cursor/README.md first.

## 1. Goal

Remove the copy-paste in `src/modules/identity/auth.ts` that carries security invariants, without changing any behaviour:

- **#7:** the `createUser` + compensation block (3 copies), profile activation + membership insert (2 copies), and the lock preamble / session revoke (several copies).
- **#18:** `auth.ts` calls `supabaseAdmin()` directly 8 times and must remember to call `isEmailTakenError` before `classifyProviderError`. Move both behind `auth-provider.ts`.
- **#28:** DRY leftovers (`Tx`, `recordActivityEvent` shape, HMAC secret read, `toISOString().slice(0, 10)`, duplicated permission-array SQL helper).

Every change is a **refactor**. If a step seems to need a behaviour change, stop (README rule 9) and list it under "Open human decisions" in your hand-back.

## 2. Branch, dependencies, conflicts

- Branch: `refactor/wp10-identity-provider-dedup`, from current `main`.
- **Start only after F3 change 2b (`role-permissions`) is merged.** 2b changed `identity/repository.ts` (role gates, permission constants, `getResidentList`, `getNavigationAccess`, the 0024 CHECKs) and may have touched `auth.ts` where it stores permissions.
- **Step 0 (do this before anything else): re-verify "Current state".** 2b has changed `identity/repository.ts`, so every line number in §4 that points into that file may be stale. Re-read the code. Do not trust a line number.
- Never touch permission semantics: no changes to `HOUSEHOLD_PERMISSIONS`, `RESIDENT_PERMISSIONS`, `MODERATOR_PERMISSIONS`, `MODERATOR_ONLY_PERMISSIONS`, role checks, or the CHECKs in `drizzle/0024`/`0027`. Where a helper below copies a `permissions:` value into an insert, copy whatever 2b left there, verbatim.
- Must not run in parallel with WP11 or WP12. WP11 depends on this package. WP12 depends on WP11.
- `casting/repository.ts` is also touched by WP03/WP04 (earlier in the run order). Check that they are merged before step B1 touches the `casting` import; otherwise skip that one file and record it for WP12.

## 3. Read first

1. `audit/cursor/README.md` (all ten rules), `CLAUDE.md`, `.claude/rules/implementation-hazards.md`. Re-read the hazards on **"No transaction spans Postgres and Supabase Auth"**, **"Every writer of the same state, pairwise"** and **"One pooled connection per call chain"**. In short: pass the `tx` you hold to `...Tx` helpers; a `withSessionContext` inside another one throws `NestedSessionContextError`.
2. `audit/technical-debt.md` findings #7, #18, #28.
3. `src/modules/identity/auth.ts` (2377 lines, read all of it), `auth-provider.ts`, `schema.ts` (top 120 lines).
4. `src/db/session-context.ts`.
5. Tests you must keep green and understand (all under `tests/`):
   - `unit/identity/provider-user-compensation.test.ts`, `unit/identity/register-session-setup-not-atomic.test.ts`, `unit/identity/claim-session-setup-not-atomic.test.ts`, `unit/identity/auth-provider-deadline.test.ts` (it uses a local HTTP server as the provider, not an in-process mock; copy that style), `unit/identity/session-token-hash.test.ts`, `unit/identity/join-attempt-hash.test.ts`
   - `integration/policy/provider-deadline-{create-user,email,password,reset,sign-in,lock-release}.test.ts`
   - `integration/policy/join-atomicity.test.ts`, `join-email-provider.test.ts`, `join-bound-link.test.ts`, `revoked-membership-sign-in.test.ts`, `sign-in-credential-generation.test.ts`
   - `integration/policy/account-settings-email.test.ts`, `account-settings-password.test.ts`, `password-reset-link.test.ts`
   - `integration/policy/member-role-appointment.test.ts`, `moderator-permissions.test.ts`, `unit/identity/role-permissions-constants.test.ts` (permission SQL)
   - `unit/lint/cleanup-inventory.test.ts` (see hazard H1 in §5)
   - `tests/helpers/provider-fault.ts` (fault injector: `drop-before`, `forward-then-drop`, `record`)

## 4. Current state (verified 2026-10-01 on main @ 3401c94)

Line numbers are for `src/modules/identity/auth.ts` unless stated. Re-verify (step 0).

**Direct provider calls: the audit's count of 8 is correct.**

| Line | Call | Context | Target |
|---|---|---|---|
| 162 | `createUser` | `registerHousehold` | `createAuthUserOrCompensate` |
| 370 | `createUser` | `claimResidentProfile` | same |
| 953 | `createUser` | `joinHousehold` | same (the only one that checks `isEmailTakenError(…, "create")`) |
| 1207 | `updateUserById({email})` | resend inside `resolveEmailWriteOutcome` | `updateEmailClassified` |
| 1432 | `updateUserById({email})` | last statement of `changeResidentEmail`'s transaction | `updateEmailClassified` |
| 1543 | `updateUserById({password})` | resend inside `resolvePasswordWriteOutcome` | `updatePasswordClassified` |
| 1782 | `updateUserById({password})` | `changeResidentPassword` | `updatePasswordClassified` |
| 2220 | `updateUserById({password})` | `redeemPasswordReset` phase 2 | `updatePasswordClassified` |

**Ordering rule (`isEmailTakenError` before `classifyProviderError`):** the audit says 3 sites; verified sites are 961 (create path), 1217 and 1445 (update path). The update-path signature is a 500 `AuthRetryableFetchError` "Error updating user" with no code. `classifyProviderError` alone calls it `unknown`, hence the rule.

**Audit inaccuracy: "the read back / resend once wrappers differ only in the call they make".** Only partly true:

- `getUserByIdWithResend` and `signInWithPasswordWithResend` (`auth-provider.ts`) are identical modulo the call. They are the `withResend(fn)` candidates.
- `deleteUserWithResend` is **not** the same shape. It returns `"ok" | "unknown"` and treats a 404 as done. Leave it as is.
- `resolveEmailWriteOutcome` / `resolvePasswordWriteOutcome` (`auth.ts`) differ in evidence (a read-back of the address vs. a password probe) and in the email-taken short circuit. They only *contain* a resend; they are not wrapper copies.

**Lock preamble: audit slightly overstates uniformity.** Verified copies, side by side. Re-derive this table yourself in step A1:

| Site (line) | Membership key | After the membership lock | Account lock | Account row missing | Session lock | Session check |
|---|---|---|---|---|---|---|
| `changeResidentEmail` main (1387–1412) | `accountId`, `FOR UPDATE` | `!row \|\| revokedAt \|\| !isResident` → `AccountSettingsError not_a_resident` | `FOR UPDATE` | no throw here; `return`s later as "no account, nothing to do", after the session check | `FOR UPDATE`, `id = sessionId AND account_id` | `!row \|\| revokedAt \|\| expiresAt <= new Date()` → `session_ended` |
| `changeResidentPassword` main (1696–1723) | same | same (password message) | `FOR UPDATE` | **throws `wrong_current_password` before the session lock** | same | same |
| email repair (1476–1477) | `accountId`, `FOR UPDATE` | no check | `FOR UPDATE` | n/a | none | none |
| password repair (1846–1847) | same | no check | `FOR UPDATE` | n/a | none | none |
| `redeemPasswordReset` phase 1 (2109–2147) | **`residentProfileId`**, `FOR UPDATE` | live + resident, else `JoinError invalid_link`; then a plain profile/issuance select | `FOR UPDATE` keyed by `membershipRow.accountId`; `email !== null` → `invalid_link` | `invalid_link` | none (`UPDATE session` revoke only) | n/a |
| phase 2 (2197–2217) | `residentProfileId` | same + plain profile select | `FOR UPDATE`, `email !== null` check | `invalid_link` | none | n/a |
| phase 3 (2300–2314) | `residentProfileId` | same + profile select | **no account lock** | n/a | none | n/a |
| `signIn` (693–716) | `accountId`, `FOR UPDATE` | `!row` → `SignInError no_membership`; `revokedAt` → `invalid_credentials` | **`FOR SHARE`** | n/a | none (inserts a session) | n/a |

Consequences for the design:

- Only the first two rows are near-identical, and they differ in where the account-missing check sits. Extract with an exact hook (step B10); do not merge their semantics.
- Phase 1/2/3 key the membership by profile id, not account id. Do not fold them into the account-keyed helper.
- Lock **order** (`resident_profile → membership → account → session`) is stated only in comments (about 1344–1352, 1631–1639, 2061–2072). No test asserts it. That test comes first (step A2).

**Session revoke copies** (four in `auth.ts`; two in `repository.ts` stay out of scope):

| Site | Filter |
|---|---|
| 1752–1755 (`changeResidentPassword` main) | all live sessions except `sessionId` |
| 1849–1859 (password repair) | all live except `sessionId` **and** `createdAt < startedAt` |
| 2144–2147 (reset phase 1) | all live |
| 2334–2337 (reset phase 3) | all live |

All set `revokedAt: new Date()` (JS clock). Keep that.

**Profile activation + membership insert, two copies:**

- `claimResidentProfile` 396–424: conditional `UPDATE … status 'active'` where `prepared`; on zero rows throws `ClaimError not_prepared` with the profile id in the message. Then `insert(account)` with no email, then `insert(membership)` without `joinedViaIssuanceId`.
- `joinHousehold` 1026–1068: same conditional UPDATE, on zero rows throws `JoinError invalid_link` ("Bound profile is no longer claimable"). The neutral branch inserts a new active profile instead. Then `insert(account)` with `email`, then `insert(membership)` with `joinedViaIssuanceId`.

**`todayIsoDate`: four sites, not three.** `new Date().toISOString().slice(0, 10)` at `auth.ts` 398, 1028, 1045 and `identity/repository.ts` ~134 (`movedOutOn`). It is the **UTC** date, not Berlin. Preserve that exactly (hazard H4).

**`recordActivityEvent` shape: 5 identical call sites in `auth.ts`, not 6.** `account.email_changed` (1421, 1503) and `account.password_changed` (1786, 1810, 1875): `subjectType "account"`, `subjectId = actorAccountId = context.accountId`, `actorProfileId = context.profileId`, `payload {}`. The reset event (2164) and the registration/claim/join events differ; leave them.

**Secret read: two copies** (`hashSessionToken` 450, `joinAttemptSourceHash` 463). Both read `SESSION_TOKEN_HASH_SECRET`, throw the same message, use `createHmac("sha256", …).update(…).digest("hex")`. The second prefixes `join-attempt:` (domain separation, keep it).

**`Tx` alias: five declarations, not three.** `session-context.ts:25` (`PgTransaction<any, any, any>`, not exported), `audit/repository.ts:17` (same type), `casting/repository.ts:37`, `identity/auth.ts:40`, `identity/repository.ts:10` (the latter three derive it as `Parameters<Parameters<typeof withSessionContext>[1]>[0]`, which is the same type).

**Permission SQL helper duplicate.** `identity/repository.ts` ~496 `permissionSet` and `identity/schema.ts` ~62 `permissionArrayLiteral` have byte-identical bodies. `permissionSet` has one use site, `setMemberRole` (~1427–1428). **The audit proposes a bound array parameter. Do not do that:** it changes the SQL text and the CHECK expressions in `schema.ts` rely on the literal form. Instead export `permissionArrayLiteral` from `schema.ts` and delete `permissionSet`. The SQL text is then unchanged. 2b may have changed or removed either; re-verify.

## 5. Package-specific hazards

- **H1: `tests/unit/lint/cleanup-inventory.test.ts` text-parses `auth.ts`.**
  - `extractFunctionBody(…, /export async function registerHousehold\(/)` returns everything from that match to the next top-level `\nexport `. It does the same for `undoRegisterHousehold`.
  - A private helper you place **between** them, or between `undoRegisterHousehold` and the next export, becomes part of the parsed "body". Its `.insert(`/`.delete(` calls then change the expected-tables comparison.
  - Any `fooTx(` helper that `registerHousehold` calls must be declared in `TX_HELPER_INSERTS`.
  - Rules: put new private helpers **above** `registerHousehold`'s comment block (right after `deleteAuthUserUnlessCommitted`). `registerHousehold` may call `createAuthUserOrCompensate` (no `Tx` suffix), but must not call any new `*Tx(` helper in this package. Do not extract `registerHousehold`'s inserts.
- **H2: no provider call inside a nested `withSessionContext`; no new provider call order.** `createAuthUserOrCompensate` runs before any transaction, exactly where `createUser` is today. The `updateEmailClassified` call stays the **last** statement of the email transaction. `updatePasswordClassified` stays where it is relative to the revoke and stamp.
- **H3: `supabaseAdmin()` builds a fresh client per call, on purpose** (comment in `auth-provider.ts`). `withResend` must call `supabaseAdmin()` inside the attempt, so each attempt gets a fresh client.
- **H4: UTC date.** `toISOString().slice(0, 10)` is the UTC date. Between 00:00 and 02:00 Berlin time the written `moved_in_on`/`moved_out_on` is the previous day. That may be a bug, but fixing it is a behaviour change and out of scope. Pin it with a test and report it.
- **H5: error identity.** Callers rethrow the raw `AuthError` in two places (1449, 1803) and map it in others. The classified outcome must carry the **original error object** so a rethrow is unchanged.
- **H6: unexecuted branches.** Some branches cannot be reached without mocking the provider (README rule 6 forbids it): `createUser` returning no `data.user`, and returning a different id than requested. Copy these branches byte for byte into the helper and compare with `git diff --color-moved`. Do not "improve" them.
- **H7: createUser drift stays.** `registerHousehold` and `claimResidentProfile` do **not** map "email already taken" and must keep not doing so. Only `joinHousehold` maps it. The helper takes `detectEmailTaken: boolean`. Unifying this changes behaviour. Report it as a human decision.
- **H8: log noise.** Do not change any `console.error` in this package. Logging belongs to WP11.
- **H9: the repair blocks.** Two repair `catch` blocks contain lock statements (email repair 1476–1477, password repair 1846–1847) that tests never execute. In step B10 you may replace the two `select … for("update")` statements there with the identical helper calls, and nothing else. Flag these two edits in the PR description for human eyes.

## 6. Plan

### Phase A — characterization / failing tests

Write these first. Each must pass against **today's** code and then be seen failing against a deliberate one-line break (README rule 3). Record break and result in the hand-back.

**A1. Side-by-side diff table (no code).** Re-derive the lock-preamble table of §4 from the code as it is after 2b. Put the final table in your PR description. Anything that differs from §4 gets its own bullet. Extract only rows whose semantics are identical, using the exact-hook design in B10.

**A2. Lock-order test: `tests/integration/policy/credential-lock-order.test.ts`.** Deterministic, held-lock style (as `revoked-membership-sign-in.test.ts` and `provider-deadline-lock-release.test.ts`).

Design:

- `holdRowLock(context, table, where)` opens a `withSessionContext` transaction **from the test body** (not nested in a callback), runs `select … for("update")`, resolves a `ready` promise and awaits a `release` promise. Returns `{ ready, release, done }`.
- `canLock(context, table, where)` runs in **its own** `withSessionContext` with `.for("update", { noWait: true })`. It returns `false` on Postgres error `55P03`, `true` otherwise, and rethrows anything else. A separate transaction is required: a failed NOWAIT inside the holder would abort it and drop the lock.
- For each subject function (`changeResidentEmail`, `changeResidentPassword`, `signIn` as a resident):
  1. **Holder on the `account` row.** Start the subject (do not await). Poll `canLock(membership)` every 50 ms until it is `false` (cap 15 s). That proves the subject holds membership while waiting for account. Assert `canLock(own session row)` is `true` (not reached yet). Release. Await the subject and assert its normal outcome.
  2. **Holder on the caller's `session` row** (email and password only; `signIn` takes no session lock). The subject must hold membership **and** account. Poll until both probes are `false`. Release. Await.
  3. **Holder on the `membership` row.** Start the subject. Settle 1500 ms. Assert it has not resolved and `canLock(account)` is `true` (account is never taken before membership). Release. Await. (This assertion is weaker, because it cannot distinguish "not started" from "blocked"; cases 1 and 2 carry the real proof. Say so in a comment.)
- `signIn` takes `account FOR SHARE`. A `FOR UPDATE` holder still blocks it, so case 1 applies unchanged.
- Optionally add `redeemPasswordReset` phase 1 (membership by profile id, then account) if the existing `password-reset-link.test.ts` fixture makes it under about 25 lines. Otherwise record it as skipped.
- Fixtures: `registerTestHousehold`, `createResidentProfile`, `claimResidentProfile`, `signIn` as in the neighbouring tests. Unique emails via `testEmail()`. Teardown in `afterEach`. Give each case `60000` ms.
- Seen-failing proof: temporarily swap the order of the two lock statements in `changeResidentEmail`'s main transaction (account before membership). Case 3 and/or case 1 must go red. Revert.

**A3. `claimResidentProfile` lost-createUser characterization.** `provider-deadline-create-user.test.ts` covers `joinHousehold` and `registerHousehold` but not `claimResidentProfile`. Add one case there: `drop-before` on `POST /auth/v1/admin/users`, expect `ClaimError signup_failed`, no orphan Auth user at the derived address, the prepared profile still `prepared`, and a retry succeeds. Break to see it fail: remove the `deleteAuthUserBestEffort` call in the `unknown` branch of `claimResidentProfile`.

**A4. Gap probe, then fill.** Run a one-line mutation per item below and confirm a named test goes red. Add a test only where none does.

- (a) `createUser` `unknown` → no delete (join) → `provider-deadline-create-user` should fail.
- (b) join `email_taken` check removed → `join-email-provider` should fail.
- (c) `changeResidentEmail` `email_taken` check removed → `account-settings-email` should fail.
- (d) `session_ended` check removed in email and in password (two separate breaks) → look for a test for each (`account-settings-*`).
- (e) `createdBefore` filter removed from the password repair: expected **uncovered** (repair is not executed; README: leave it, note it).

**A5. Pure unit tests** (no database):

- `todayIsoDate` (`tests/unit/identity/today-iso-date.test.ts`): with `vi.useFakeTimers()`, set `2026-09-30T22:30:00Z` (00:30 Berlin on 1 Oct) and expect `"2026-09-30"`; set `2026-10-01T23:59:59Z` and expect `"2026-10-01"`. This pins UTC. Write it against the current inline expression by testing through a tiny local copy first, or write it in B2 together with the extraction and break it with `toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })`.
- `classifyEmailUpdateError` (B6). Cases: `422 email_exists` → `email_taken`; `422` without a code → `email_taken`; `422 email_address_invalid` → `refused`; `500 "Error updating user"` as `AuthRetryableFetchError`, update path → `email_taken`; the same on the create path → `unknown`; a transport abort → `unknown`; `null` → `applied`.
- `hmacHex` stays covered by `session-token-hash.test.ts` and `join-attempt-hash.test.ts`. Confirm `join-attempt-hash.test.ts` asserts the `join-attempt:` prefix gives a different digest. If not, add that assertion.

### Phase B — change (each numbered step = one green commit; run `npm run verify` before and after each)

1. `refactor(db): export Tx from session-context and reuse it`. `export type Tx` in `src/db/session-context.ts`. Replace the aliases in `identity/auth.ts`, `identity/repository.ts`, `audit/repository.ts` with `import type { Tx } from "@/db/session-context"`. `import type` is erased, so `audit/repository.ts` gains no runtime dependency on `db/client`. Do `casting/repository.ts` only if WP04 is merged (§2). Remove the stale "Mirrors … `Tx` alias" comments.
2. `refactor(identity): one todayIsoDate for moved-in/out dates`. Add `todayIsoDate(): string` (UTC, comment says so and why) to `src/modules/identity/transitions.ts`. That file is pure and already imported by `auth.ts` and `repository.ts`, so no new module. Replace the four sites. Do **not** export it from `repository.ts` (it would need an entry in the authorization matrix). A5 test goes in this commit.
3. `refactor(identity): hmacHex for the two session-secret digests`. A file-private `hmacHex(message: string)` in `auth.ts` that reads and checks the secret and returns the digest. Both callers keep their domain separation. Error message unchanged.
4. `refactor(identity): recordAccountEvent for the five account events`. File-private, placed above `registerHousehold` (H1). Signature `(tx, context: SessionContext, eventType: "account.email_changed" | "account.password_changed")`. Replace the 5 sites. The three password sites include one inside the repair `catch` (1875); that is a mechanical swap.
5. `refactor(identity): one permission array SQL helper` (skip if 2b removed it). Export `permissionArrayLiteral` from `schema.ts`; import it in `repository.ts`; delete `permissionSet`. Confirm with `git diff` that no SQL string changed. `member-role-appointment`, `moderator-permissions` and `role-permissions-constants` must stay green. Do not touch the permission constants.
6. `refactor(identity): withResend for the two read/password-check wrappers`. In `auth-provider.ts`: `withResend<T extends { error: unknown }>(attempt: () => Promise<T>): Promise<T>` (first attempt; second only when `classifyProviderError(first.error) === "unknown"`; `attempt` calls `supabaseAdmin()` itself, H3). Rewrite `getUserByIdWithResend` and `signInWithPasswordWithResend` on top of it, keeping their exported signatures and return types. Leave `deleteUserWithResend` alone and say why in a comment. `auth-provider-deadline.test.ts` must stay green. It pins "withheld GET sent twice, withheld PUT exactly once, 429 on /token not resent".
7. `refactor(identity): updateEmailClassified / updatePasswordClassified`. In `auth-provider.ts`:
   - Move `isEmailTakenError` here, **unexported**, together with its explanatory comment. The ordering rule becomes internal to `updateEmailClassified` (`"update"` path) and to the create helper (`"create"` path). No caller can get it wrong.
   - Export a pure `classifyEmailUpdateError(error)` returning `{ kind: "applied" } | { kind: "email_taken" } | { kind: "refused"; error } | { kind: "unknown"; error }` (tested in A5). `updateEmailClassified(accountId, email)` calls `updateUserById(accountId, { email, email_confirm: true })` and classifies.
   - `updatePasswordClassified(accountId, password)` returns `applied | refused(error) | unknown(error)` for `updateUserById(accountId, { password })`.
   - Migrate the five update sites, **one per commit** (7a–7e), keeping the branch structure. The outcomes carry the original error (H5).
     - 1207 resend: `email_taken` → throw `AccountSettingsError email_taken`; `refused` → `console.error(error)` then `provider_unavailable`; `unknown` → second read-back.
     - 1432 main: `email_taken` → throw; `refused` → `throw error`; `unknown` → `resolveEmailWriteOutcome`.
     - 1543 resend: anything but `applied` → second probe.
     - 1782 main: `refused` → `throw error`.
     - 2220 phase 2: `refused` → `console.error` + `reset_incomplete`.
   - Delete the "MUST run first" comments that become structurally true.
8. `refactor(identity): createAuthUserOrCompensate` (three commits, one caller each: register, claim, join). A file-private helper placed above `registerHousehold` (H1):
   - `createAuthUserOrCompensate({ accountId, email, password, detectEmailTaken })` returns `{ ok: true } | { ok: false; kind: "email_taken" } | { ok: false; kind: "failed"; message: string }`.
   - It contains exactly today's sequence: `createUser({ id: accountId, email, password, email_confirm: true })`; on `error`: (if `detectEmailTaken`) email-taken check **first**, then `unknown` → `deleteAuthUserBestEffort(accountId)`, then `failed` with `error.message ?? "Supabase Auth did not return a user"`; no `data.user` → `failed "Supabase Auth did not return a user"`; `data.user.id !== accountId` → `deleteAuthUserBestEffort(data.user.id)` then `failed "Supabase Auth did not honour the requested id"`.
   - The caller maps `failed` to its own error class: `RegistrationError(…, "signup_failed")`, `ClaimError(…, "signup_failed")`, `JoinError(…, "signup_failed")`. Only join passes `detectEmailTaken: true` and maps `email_taken` to `JoinError email_taken` with the same message.
   - H6: the two unexecuted branches are copied verbatim.
9. `refactor(identity): activatePreparedProfileTx and insertResidentMembershipTx` (two commits, claim then join).
   - `activatePreparedProfileTx(tx, residentProfileId): Promise<boolean>`: the conditional UPDATE (`status = 'prepared'` predicate in the WHERE clause, `movedInOn: todayIsoDate()`), returning whether a row matched. The caller throws its own error (`ClaimError not_prepared` with the id in the message; `JoinError invalid_link` "Bound profile is no longer claimable"). Keep the "the predicate is the invariant" comment once, in the helper.
   - `insertResidentMembershipTx(tx, { householdId, accountId, residentProfileId, joinedViaIssuanceId? })`. Whatever `role`/`permissions` values 2b left in these two inserts stay literally the same; if the two copies differ after 2b, stop and report.
   - Statement order inside each transaction is unchanged (profile → account → membership → event → session). The `account` insert stays in the callers (claim has no email, join has `email`).
   - Name check for H1: these helpers end in `Tx` and are called from `claimResidentProfile`/`joinHousehold`, not from `registerHousehold`, so `TX_HELPER_INSERTS` is unaffected. Confirm by running the cleanup-inventory test.
10. `refactor(identity): lock helpers and revokeLiveSessionsTx` (one caller per commit). File-private helpers, above `registerHousehold`:
    - `lockMembershipByAccountTx(tx, accountId)`, `lockAccountTx(tx, accountId)`, `lockOwnSessionTx(tx, accountId, sessionId)`: each exactly one `select … .for("update")`.
    - `lockLiveResidentSessionTx(tx, { accountId, sessionId, notAResidentMessage, onAccountLocked? })`: membership → check → account → `onAccountLocked(accountRow)` → session → check, returning `{ account }`. The hook runs **between** the account lock and the session lock. `changeResidentEmail` passes none (its account-missing handling stays where it is today). `changeResidentPassword` passes a hook that throws `wrong_current_password` when the row is missing. That keeps behaviour and lock order exactly identical to §4. (If A1 shows the two cannot share the helper without a semantic change, use the three small step helpers inline at both sites instead.)
    - `revokeLiveSessionsTx(tx, accountId, { exceptSessionId?, createdBefore? })`: `revokedAt: new Date()`, `isNull(revokedAt)`, optional `ne(id)` and `lt(createdAt)`.
    - Migrate: email main (10a); password main (10b); `signIn` uses `lockMembershipByAccountTx` + its own `FOR SHARE` account read (10c); the two repair sites, step helpers only (10d, H9); phase 1/2/3 membership-by-profile locks stay as they are, or get a `lockMembershipByProfileTx` if the diff is purely mechanical (10e); the four revoke sites (10f). After every commit A2 must be green.
11. `docs(identity): record the lock order in one place`. Replace the three duplicated "Lock order: …" paragraphs with one sentence at the helpers ("membership → account → session; `signIn` takes account `FOR SHARE`; tests: `credential-lock-order.test.ts`"). Keep the invariant, drop the history. WP11 does the wider comment clean-up.
12. `test(identity): auth.ts calls the provider only through auth-provider.ts`. A small source-text test (style of `authorization-matrix.test.ts`'s `srcAppReferencesName`) asserting `auth.ts` contains no `supabaseAdmin(` call. Run it against a deliberate re-insertion to see it fail.

### Phase C — follow-through

- Run `npm run verify` (expect ~80–90 s of tests against dev, README rule 6). Include the pass counts in the PR.
- `git diff --color-moved=dimmed-zebra main...HEAD -- src/modules/identity/auth.ts` and paste evidence in the PR that the unexecuted branches (H6, H9) are verbatim moves.
- `grep -c "supabaseAdmin()" src/modules/identity/auth.ts` → expect `0`. `grep -n "console.error" …` → count unchanged (12 calls).
- Update `openspec/specs/**` only if a spec sentence names one of the moved functions. Do not edit `openspec/changes/archive/**` and do not touch `docs/`.
- 🛑 HUMAN: nothing in this package is human-gated (no migration, no dashboard). Review the "Open human decisions" in your report.

## 7. Acceptance criteria

- [ ] §4 re-verified after 2b; deviations listed in the PR.
- [ ] A1 table in the PR description.
- [ ] `credential-lock-order.test.ts` added, green, and seen red against a swapped lock order (evidence in the PR).
- [ ] A3 test added for `claimResidentProfile` and seen red against its break.
- [ ] `today-iso-date` unit test pins UTC; the four sites use the helper.
- [ ] `auth.ts` contains no direct `supabaseAdmin()` call; the new source-text test enforces it.
- [ ] `isEmailTakenError` is private to `auth-provider.ts`; no call site needs an ordering comment.
- [ ] `createAuthUserOrCompensate` replaces the 3 `createUser` blocks; `registerHousehold`/`claimResidentProfile` still do not map `email_taken`.
- [ ] Profile activation and membership insert exist once each; both callers keep their error classes and messages.
- [ ] The 4 session-revoke sites in `auth.ts` use `revokeLiveSessionsTx`; lock statements are single-sourced; lock order unchanged.
- [ ] `Tx` exported from `session-context.ts` and used in all places the package covers.
- [ ] `cleanup-inventory.test.ts` unchanged and green.
- [ ] No existing test edited, skipped or loosened. No `console.error` changed. No migration. `docs/` untouched.
- [ ] `npm run verify` green; no `Co-Authored-By` lines.

## 8. Out of scope & stop conditions

Out of scope (do not do, do not "while I am here"):

- Decomposing `signIn`/`joinHousehold`/credential flows (WP11), logging (WP11), comment clean-up (WP11), moving code between files (WP12).
- Any change to permission semantics, role checks, `getResidentList`/`getNavigationAccess`, the `drizzle/0024`/`0027` CHECKs.
- The `repository.ts` session revokes (~802, ~1487) and `revokeMembershipForProfileTx`: different lock order (`resident_profile → membership → session`).
- Berlin-time dates (hazard H4), `email_taken` for register/claim (H7).

Stop and report when: the code differs materially from §4; a lock row in A1 turns out to differ in a way the helper cannot express exactly; any test in §3 must change; `cleanup-inventory.test.ts` fails because of a helper's position; a step needs a behaviour change; 2b is not merged.

## 9. Hand-back report (template)

```
WP10 hand-back
Branch / PR:
2b merged at: <sha>      main at start: <sha>
Re-verification (§4): deviations found: <list or "none">
Commits (one line each, with step number):
Characterization tests added (file → how seen failing: break + red test names):
  - credential-lock-order.test.ts →
  - claimResidentProfile lost-createUser →
  - today-iso-date.test.ts →
  - classifyEmailUpdateError unit tests →
  - auth.ts-calls-provider-only-via-auth-provider →
Gap probe A4: (a) … (e): red test or "uncovered"
A1 diff table: <pasted or linked>
Unexecuted branches copied verbatim (H6, H9): <git diff --color-moved evidence>
npm run verify: <pass/fail>, vitest <passed>/<total>, duration
Skipped (with reason): e.g. casting Tx alias if WP04 unmerged; redeem phase 1 order case; step 5 if 2b removed permissionSet
Open human decisions:
  1. register/claim email_taken mapping (H7)?
  2. UTC vs Berlin for moved_in_on / moved_out_on (H4)?
  3. Anything else
Audit claims found inaccurate: <list>
```
