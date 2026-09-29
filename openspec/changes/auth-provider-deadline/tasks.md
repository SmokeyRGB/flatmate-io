# Tasks

Each test task names the deliberate break that must make it fail. The applier reports having seen
it fail, then restores the code. The fault-injection tests run against flatmate-io-dev with
`AUTH_PROVIDER_DEADLINE_MS=3000` (design.md D12).

## 1. Probe the assumption the design rests on

- [x] 1.1 Probe A1 against flatmate-io-dev with a one-off `tsx` script in the scratchpad (not
  committed):
  1. Call `auth.admin.createUser({ id: randomUUID(), email: <random .invalid address>, password,
     email_confirm: true })`.
  2. Assert that the returned `user.id` equals the id passed in.
  3. Call `createUser` again with the same id and a different address, and record the refusal's
     `status`/`code`.
  4. Delete the user.

  Report the three observations. **If the id is not honoured, stop and report back: design.md D5
  must be revisited before anything else is built.**

## 2. The provider client

- [x] 2.1 Create `src/modules/identity/auth-provider.ts` and move `supabaseAdmin()` there from
  `src/modules/identity/auth.ts`, with its server-only comment. Add the D1 `withDeadline` fetch
  (lazy `globalThis.fetch`, `AbortSignal.timeout` combined with the caller's signal via
  `AbortSignal.any`). Add the D2 `AUTH_PROVIDER_DEADLINE_MS` parsing: default 5000, integer
  500–60000, anything else throws when the client is created. `auth.ts` imports `supabaseAdmin`
  from it. No behaviour change yet.
- [x] 2.2 In `src/modules/identity/auth-provider.ts`, add the following, with a header comment
  citing the proposal and `.claude/rules/implementation-hazards.md`:
  - `classifyProviderError(error): "ok" | "refused" | "unknown"`, per D3.
  - `classifyPasswordCheck(error): "ok" | "wrong_password" | "unknown"`, D3's rule for every
    password check: only `invalid_credentials` is `wrong_password`, and any other refusal is
    `unknown`. The unit test in 2.4 covers a 429.
  - The D4 resend wrappers for `getUserById`, `signInWithPassword` and `deleteUser` (two attempts,
    resend only on `unknown`, a 404 on the `deleteUser` repeat counts as done).
  - `confirmPasswordSet(email, password)`, per D7.
- [x] 2.3 Add `AUTH_PROVIDER_DEADLINE_MS` to `.env.example`, commented out, with the default and
  the range, next to `SUPABASE_SERVICE_ROLE_KEY`.
- [x] 2.4 Unit test `tests/unit/identity/auth-provider-deadline.test.ts`: a local `node:http`
  server on `127.0.0.1`, the same shape as `lost-response-fetch.test.ts` on the test-timeouts
  branch. The admin client is created against its origin with `AUTH_PROVIDER_DEADLINE_MS=300`.
  Cases:
  - a withheld response makes `updateUserById` return, within 2 s, an error that
    `classifyProviderError` calls `unknown`;
  - a 500 answer → `unknown`;
  - a 422 `email_exists` → `refused`;
  - on `/token`, a 400 `invalid_credentials` → `wrong_password`, and a 429
    `over_request_rate_limit` → `unknown` (`classifyPasswordCheck`);
  - a normal answer is returned unchanged;
  - a withheld `GET` is sent twice and a withheld `PUT` exactly once;
  - an invalid `AUTH_PROVIDER_DEADLINE_MS` (`"0"`, `"abc"`) throws.

  Vitest timeout 5 s. **Break:** remove the signal from `withDeadline`. The withheld-response case
  must time out, and the "sent twice" case must fail.

## 3. Fault injection helper

- [x] 3.1 Create `tests/helpers/provider-fault.ts` per design.md D12:
  - `injectProviderFault(rules: Rule[])` installs **one** wrapper at `globalThis.fetch` and returns
    `{ seen, restore }`.
  - `Rule = { method, path: RegExp, occurrence?: number | number[] | { from: number } | "every",
    mode: "drop-before" | "forward-then-drop" | "record" }`. Occurrences are counted per rule over
    that rule's own matches. The first matching rule wins. A request that no rule matches, or
    whose occurrence is not selected, passes through unchanged.
  - `drop-before`: never calls through; rejects with `init.signal.reason` when the signal aborts.
  - `forward-then-drop`: calls through **without** the caller's signal and sets `forwardCompleted`
    once the full response body has been read. It **always** rejects at the caller's abort, and
    records `forwardIncomplete` if the abort came first.
  - `seen` entries are `{ method, url, body, rule, outcome }`, with `body` as parsed JSON where
    possible.
  - `restore()` puts back exactly the fetch that was there before.

  The header comment covers:
  - why this is fault injection, not provider mocking (human decision 2026-09-28);
  - that it must be installed **after** fixtures;
  - how it interacts with `tests/helpers/lost-response-fetch.ts`, if that exists on this branch by
    now (D12 last paragraph). If it does, bypass it while a rule is active.
- [x] 3.2 Unit test `tests/unit/helpers/provider-fault.test.ts`. It uses a local `node:http` server
  that **delays its answer 500 ms**, with the caller's deadline at 200 ms. Cases:
  - `forward-then-drop`: the server saw and answered the request, `forwardCompleted` is true, and
    the caller sees an abort.
  - `drop-before`: the server never saw the request.
  - Occurrence forms `2`, `[1, 3]`, `{ from: 2 }` select exactly those matches.
  - `record` passes through.
  - `restore()` restores.

  **Break:** forward the caller's signal in `forward-then-drop`. The server's 500 ms answer is then
  cut at 200 ms, so `forwardCompleted` stays false and the assertion fails.

## 4. createUser: our own id, and delete on unknown (D5)

- [x] 4.1 In `src/modules/identity/auth.ts`, in `registerHousehold`, `claimResidentProfile` and
  `joinHousehold`:
  - generate `accountId` before `createUser` and pass it as `id`;
  - on success, if `data.user.id !== accountId`, `await deleteAuthUserBestEffort(data.user.id)`
    (the user actually created) and throw `signup_failed`;
  - on `unknown`, `await deleteAuthUserBestEffort(accountId)` and throw the existing
    `signup_failed` / `RegistrationError("signup_failed")`;
  - keep `isEmailTakenError` first for `refused`.

  Update each function's "state each failure point leaves" comment. `deleteAuthUserBestEffort`
  uses the D4 `deleteUser` wrapper (a 404 counts as done).
- [x] 4.2 Integration test `tests/integration/policy/provider-deadline-create-user.test.ts`. Install
  the injector **after** `registerTestHousehold` and the link are set up. Cases:
  - `forward-then-drop` on `POST /auth/v1/admin/users` during `joinHousehold` with a neutral link
    and a supplied email. Expect:
    - `JoinError("signup_failed")`;
    - `seen` holds exactly **one** `POST /auth/v1/admin/users` (never resent);
    - `getUserById(<seen[0].body.id>)` → not found;
    - the link's use count unchanged;
    - a second `joinHousehold` with the same email and link succeeds.
  - The same for a bound link: the retry must not be `email_taken`.
  - The same for `registerHousehold`.

  Teardown deletes by `seen[].body.id`. **Break:** skip the delete in the `unknown` branch. The
  retry must fail with `email_taken` (join) or `signup_failed` (register).

## 5. Sign-in: the password-check rule, uniform name path, new code (D3, D9, D10, D11)

- [x] 5.1 In `src/modules/identity/auth.ts`, add `provider_unavailable` to `SignInErrorCode`.
  Restructure `signIn`'s name path per D11:
  - it only chooses the account id to look up (the resolved one, or `randomUUID()`) and then the
    `email` (the provider's address, or a fresh `resident-<uuid>@accounts.flatmate.invalid` when
    the name did not resolve or the lookup was refused);
  - it then falls through the **shared** code: `readDatabaseClock()`, `signInWithPassword`
    (through the D4 wrapper, classified per D3's password-check rule), and the rest;
  - a lookup that is `unknown` → `provider_unavailable` at that point, whether or not the name
    resolved;
  - a password check that is `unknown`, or refused with anything but `invalid_credentials` →
    `provider_unavailable`;
  - `invalid_credentials` → `invalid_credentials`, as today.

  Replace the comment at the old early refusal ("No such resident in this household") with the D11
  reasoning, including why the health check was rejected.
- [x] 5.2 In `src/app/(auth)/sign-in/actions.ts`, add the `provider_unavailable` case. In
  `src/app/(auth)/register/actions.ts`'s post-registration `SignInError` switch, add it too: the
  existing undo still runs, and the case shows the **registration's** failure text (D9), not the
  sign-in's. In `src/ui/strings/de.ts`, add `auth.errors.signIn.providerUnavailable` with the D10
  draft.
- [x] 5.3 Integration test `tests/integration/policy/provider-deadline-sign-in.test.ts`. Install the
  injector after fixtures. Cases:
  - `drop-before` "every" on `POST /auth/v1/token`. Expect `provider_unavailable` for an email
    sign-in and for a name sign-in, and no `session` row inserted.
  - Name path, known name: `drop-before` "every" on `GET /auth/v1/admin/users/`. Expect
    `provider_unavailable`.
  - Name path, **unknown** name, the same fault. Expect `provider_unavailable`.
  - `drop-before` on occurrence 1 of `POST /auth/v1/token` only. Expect a normal sign-in; 2
    token requests in `seen`.
  - Wrong password, no fault → `invalid_credentials`.
  - **Call parity:** a `record` rule on everything under `/auth/v1/`. Sign in (a) with an unknown
    name, (b) with a known name and a wrong password, (c) with a known name whose Auth user was
    deleted. All three give `invalid_credentials`, and `seen` mapped to `method + path template` is
    identical: `[GET /auth/v1/admin/users/:id, POST /auth/v1/token]`. Extend
    `tests/unit/identity/sign-in-enumeration.test.ts` with the same parity assertion for (a) vs (b).

  **Breaks:**
  - Map `unknown` back to `invalid_credentials`: the token and lookup cases must fail.
  - Restore the early refusal for an unknown name: the unknown-name case and parity (a) must fail.
  - Skip the throwaway check when the lookup is refused: parity (c) must fail.

## 6. Email change (D6)

- [x] 6.1 In `src/modules/identity/auth.ts` `changeResidentEmail`:
  - replace `providerUpdated` with `providerOutcome: "none" | "applied" | "unknown"`;
  - implement the D6 sequence inside the main transaction, under the held locks: read-back, then
    at most one resend, then read-back. *Applied* means exactly "the provider's normalized address
    equals the requested one";
  - in the catch, `applied` keeps today's repair unchanged;
  - `unknown` runs the repair variant from D6: it writes `account.email`, clears
    `email_verified_at` and records the event only when the provider holds the requested address.
    Otherwise it writes **nothing** and throws `provider_unavailable`. A lost read, or a failure of
    the repair itself → `change_incomplete`;
  - the repair's `getUserById` uses the D4 wrapper.

  Add `provider_unavailable` to `AccountSettingsErrorCode`. Rewrite the function's big comment's
  state list to include each new branch, and the derived-address trap.
- [x] 6.2 In `src/app/(resident)/account/actions.ts`, add `provider_unavailable`,
  `password_unchanged_sessions_ended` and `password_uncertain_sessions_ended` to both exhaustive
  switches. The email action maps the two password codes to its generic failure. In
  `src/ui/strings/de.ts`, add the D10 draft texts: `email.errors.providerUnavailable`,
  `password.errors.providerUnavailable`, `password.errors.unchangedSessionsEnded`,
  `password.errors.uncertainSessionsEnded`.
- [x] 6.3 Integration test `tests/integration/policy/provider-deadline-email.test.ts`. Install the
  injector after fixtures. Cases:
  - **Applied, answer lost:** `forward-then-drop` on occurrence 1 of `PUT /auth/v1/admin/users/`.
    Expect:
    - a normal return;
    - `account.email` = the new address;
    - `email_verified_at` null;
    - exactly one `account.email_changed`;
    - the provider holds the new address.
  - **Applied, resolved by the repair:** `forward-then-drop` on PUT occurrence 1, plus `drop-before`
    on `GET /auth/v1/admin/users/` occurrences `[1, 2]`, so the repair's third GET answers. Expect
    the same end state as the previous case, including exactly one event.
  - **Not applied:** `drop-before` "every" on the PUT. Expect:
    - `provider_unavailable`;
    - `account.email` unchanged;
    - the provider unchanged;
    - no event;
    - 2 PUTs in `seen`.
  - **Not applied, resident without an email** (`account.email` null, the provider on the derived
    address): `drop-before` "every" on the PUT **and** on GETs `[1, 2]`, so the repair's read
    answers with the derived address. Expect:
    - `provider_unavailable`;
    - `account.email` **still null**;
    - no event;
    - `issuePasswordResetLink` for that profile still succeeds.
  - **Lost once, then fine:** `drop-before` on PUT occurrence 1 only. Expect a normal return; 2
    PUTs in `seen`.

  **Breaks:**
  - Revert 6.1 to throwing on `unknown`: case 1 must fail on `account.email`.
  - Let the `unknown` repair reconcile to any provider address, as today's repair does: case 4 must
    fail on `account.email` being the derived address.
- [x] 6.4 Integration test `tests/integration/policy/provider-deadline-lock-release.test.ts` (D12):
  - start `changeResidentEmail` with `drop-before` "every" on its PUT;
  - once its PUT is in `seen`, start `signIn` for the same account;
  - assert `signIn` resolves within `6 × 3000 ms + 10 s`, and `changeResidentEmail` rejects with
    `provider_unavailable`.

  Vitest timeout 60 s. **Break:** make `withDeadline` ignore the variable and use 300000. The
  test must time out.

## 7. Password change (D7)

- [x] 7.1 In `src/modules/identity/auth.ts` `changeResidentPassword`:
  - `startedAt` comes from `readDatabaseClock()` before the main transaction (D7 "Clocks"), for
    both repairs;
  - steps 10/11 use the D4 wrappers. `unknown`, or a check refused with anything but
    `invalid_credentials` → `provider_unavailable`;
  - the audit insert moves after the provider outcome is resolved;
  - implement the D7 sequence inside the main transaction. Every (S) outcome **commits** the
    transaction (revoke + stamp, no audit) by returning a marker, and the function throws
    `password_unchanged_sessions_ended` or `password_uncertain_sessions_ended` after the commit;
  - a clean first-write `refused` still rolls back;
  - if the commit of an (S) outcome fails, the catch runs the fallback repair (same locks, revoke
    + stamp, no audit) and then throws `change_incomplete`;
  - the existing `applied` repair is otherwise unchanged.

  Add the two codes to `AccountSettingsErrorCode`. Update the big comment's state list and
  lock-order note.
- [x] 7.2 Integration test `tests/integration/policy/provider-deadline-password.test.ts`. Install the
  injector after fixtures. Each case asserts every column written: `session.revoked_at` for the
  other session and for the caller's, `account.password_changed_at` against the DB clock read
  before the call, and the `account.password_changed` count. Sequence per call: `GET` lookup,
  `POST /token` #1 (current check), `PUT`, then `POST /token` #2+ (probes). Cases:
  - **Applied, answer lost:** `forward-then-drop` on PUT occurrence 1. Expect:
    - a normal return;
    - the other session revoked, the caller's live;
    - the stamp set;
    - one event;
    - the new password signs in.
  - **Not applied:** `drop-before` "every" on the PUT. Expect:
    - `password_unchanged_sessions_ended`;
    - the other session **revoked**;
    - the stamp set;
    - **no** event;
    - the old password signs in;
    - 2 PUTs in `seen`.
  - **Cannot tell:** `drop-before` "every" on the PUT, and on `POST /auth/v1/token` `{ from: 2 }`.
    Expect `password_uncertain_sessions_ended`, the other session revoked, the stamp set, no event.
  - **Plain refusal:** a new password the provider refuses, with no fault. Expect the refusal, and
    nothing revoked, stamped or recorded.
  - **Current check lost:** `drop-before` "every" on `POST /auth/v1/token` occurrence 1 and its
    resend (`[1, 2]`). Expect `provider_unavailable`, nothing written.

  **Breaks:**
  - Make the in-transaction resolution rethrow on `unknown` instead: case 1 must fail on the other
    session still being live.
  - Make (S) roll back instead of committing: cases 2 and 3 must fail on `revoked_at`.
  - Map steps 10/11's `unknown` to `wrong_current_password`: case 5 must fail.
  - Before writing the "plain refusal" case, find out how dev's GoTrue refuses a password for
    `updateUserById`. If it has no refusal to provoke, drop that case and say so.

## 8. Password reset (D8)

- [x] 8.1 In `src/modules/identity/auth.ts` `redeemPasswordReset`:
  - phase 2 reads the address (`getUserById`, D4 wrapper) **only after** the write came back
    `unknown`;
  - implement the D8 flow. Every `U` branch commits phase 2 without the post-write stamp and
    passes `passwordOutcome: "unknown"` to phase 3. `set` is passed otherwise;
  - phase 3 maps its failures per D8.

  Add `reset_outcome_unknown` to `JoinErrorCode`. Rewrite the big comment's PHASE 2/3 state lists.
- [x] 8.2 In `src/app/(auth)/join/[code]/actions.ts`, map `reset_outcome_unknown` →
  `redirect("/sign-in?note=password_reset_unknown")` in the reset action, and to `genericFailure`
  in the join action's exhaustive switch. In `src/app/(auth)/sign-in/page.tsx`, render the new
  note. In `src/ui/strings/de.ts`, add the note text (D10 draft).
- [x] 8.3 Integration test `tests/integration/policy/provider-deadline-reset.test.ts`. Install the
  injector after issuing the link. Sequence: phase 2 `PUT`, then on `unknown` a `GET` and
  `POST /token` probes, then phase 3 `GET` and `POST /token`. Cases:
  - **Applied, answer lost:** `forward-then-drop` on PUT occurrence 1. Expect:
    - a session returned;
    - every earlier session revoked;
    - the new password signs in;
    - the link spent.
  - **Not applied:** `drop-before` "every" on the PUT. Expect:
    - `reset_incomplete`;
    - the old password signs in;
    - the link spent;
    - every session revoked;
    - 2 PUTs in `seen`.
  - **Cannot tell:** `drop-before` "every" on the PUT and on every `POST /auth/v1/token`. Expect
    `reset_outcome_unknown`, the link spent, every session revoked.
  - **Happy path is not burdened:** no fault. Exactly one `PUT` and no `GET` before it in `seen`,
    since the address is read only after an unknown write.

  **Break:** revert phase 2 to throwing `reset_incomplete` on any error. Case 1 must fail.

## 9. Docs, rules and the full gate

- [x] 9.1 In `.claude/rules/implementation-hazards.md`, under "No transaction spans Postgres and
  Supabase Auth", add one rule: an unanswered provider call is an *unknown* outcome, not a refusal.
  auth-js returns it as `AuthRetryableFetchError`. A mutating call resolves it by reading the
  provider back under the lock; it is never resent blind. Cite
  `src/modules/identity/auth-provider.ts`. Keep it to the file's density.
- [x] 9.2 If `fix/test-timeouts-hosted-dev` has merged into `main` by now, correct the "the
  application's own provider calls have no deadline in production" sentence in
  `tests/helpers/lost-response-fetch.ts` to point at `auth-provider.ts`. Otherwise record the
  follow-up in the report.
- [x] 9.3 Run `grep -n "supabaseAdmin()" src/` and check each hit against design.md's table. Every
  call must go through a D4 wrapper, or through `classifyProviderError` at its site. Report the
  list.
- [x] 9.4 Run `npm run verify` (eslint, tsc, the eight guardrail lints, check-refs, full vitest
  against flatmate-io-dev) and report the result verbatim, failures included.
- [x] 9.5 Report the items awaiting human confirmation: the German texts (D10) and the A1 probe's
  observations.
