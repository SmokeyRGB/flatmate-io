# Design

## Context

**What exists (observed on `main` at `43d2f49`):**

- **One Supabase client in `src/`.** `supabaseAdmin()` in `src/modules/identity/auth.ts` builds a
  fresh `createClient(url, serviceRoleKey)` per call. It has no `global.fetch`, so supabase-js's
  `resolveFetch` falls back to `(...args) => fetch(...args)`, which looks up `globalThis.fetch` at
  *call* time. That is why `tests/setup.ts`'s test-only wrapper takes effect at all.
- **auth-js never throws on a transport failure.** `_handleRequest` (`@supabase/auth-js`
  `lib/fetch.ts`) wraps any rejection of the fetch, an abort included, as
  `AuthRetryableFetchError(message, 0)`. `handleError` maps 500–504 and 520–530 to
  `AuthRetryableFetchError(message, status)`. The admin methods and `signInWithPassword` then
  **return** it as `{ error }`. Every call site in `auth.ts` checks `if (error)` and treats it as a
  refusal. That is the defect: a deadline makes it reachable in seconds, but a connection reset or
  a gateway 504 reaches it today.
- **The fifteen call sites.** `grep -n "supabaseAdmin()" src/` lists them. Line numbers are as of
  `43d2f49`.

| # | line | function · call | in a transaction? | locks held | an unknown outcome today leaves |
|---|---|---|---|---|---|
| 1 | 83 | `deleteAuthUserBestEffort` · `deleteUser` | no | – | maybe deleted; logged. Acceptable |
| 2 | 145 | `registerHousehold` · `createUser` | no | – | an Auth user may exist; `signup_failed`, **no cleanup**, the address is blocked |
| 3 | 329 | `claimResidentProfile` · `createUser` | no | – | same as 2 (test-only fixture, not route-reachable) |
| 4 | 563 | `signIn` (name) · `getUserById` | no | – | `invalid_credentials`: misleading |
| 5 | 582 | `signIn` · `signInWithPassword` | no | – | a stray provider session, discarded; `invalid_credentials`: misleading |
| 6 | 866 | `joinHousehold` · `createUser` | no | – | an Auth user may exist at the supplied or derived address; `signup_failed`, **no cleanup**. Every retry becomes `email_taken`, for good on a bound link |
| 7 | 882 | `joinHousehold` · `signInWithPassword` | no | – | caught; `deleteAuthUserUnlessCommitted`. Correct |
| 8 | 1236 | `changeResidentEmail` · `updateUserById(email)` | **yes** | membership, account, session `FOR UPDATE` | the address may be changed; thrown with `providerUpdated = false`; **rollback, no repair**, so Postgres and the provider diverge |
| 9 | 1263 | `changeResidentEmail` repair · `getUserById` | **yes** | membership, account | `change_incomplete`. Correct |
| 10 | 1453 | `changeResidentPassword` · `getUserById` | **yes** | membership, account, session | `wrong_current_password`: misleading |
| 11 | 1458 | `changeResidentPassword` · `signInWithPassword` | **yes** | membership, account, session | `wrong_current_password`: misleading |
| 12 | 1503 | `changeResidentPassword` · `updateUserById(password)` | **yes** | membership, account, session | the password may be set; **rollback**, so the other sessions stay live, with no stamp and no audit. Against O-13 |
| 13 | 1846 | `redeemPasswordReset` phase 2 · `updateUserById(password)` | **yes** | membership, account | the password may be set; `reset_incomplete` ("ask for a new link"). Safe, but it can be untrue |
| 14 | 1903 | `redeemPasswordReset` phase 3 · `getUserById` | **yes** | membership | `reset_done_sign_in_failed`. Correct only if #13 was definite |
| 15 | 1908 | `redeemPasswordReset` phase 3 · `signInWithPassword` | **yes** | membership | as 14 |

- **The test-only wrapper** (`tests/helpers/lost-response-fetch.ts`, on
  `fix/test-timeouts-hosted-dev` at the time of writing; merged as PR #37 with 8 s, see D12) applies a 15 s deadline and three attempts to
  the *global* fetch. This change neither depends on it nor removes it.

## Goals / Non-Goals

**Goals:**
- a bounded wait on every provider request;
- no call site that reads an unknown outcome as a refusal;
- each mutating path ends with Postgres matching the provider, or with an honest "cannot tell";
- tests that reach "applied, answer lost" deterministically.

**Non-Goals:**
- a Postgres-side timeout (a separate change, see the proposal);
- retries for availability beyond one resend;
- a circuit breaker;
- changing *which* provider calls exist or their order, apart from the reads this design adds.

## Decisions

### D1 — The deadline lives in the client's `global.fetch`, and resolves the global fetch lazily

A new `src/modules/identity/auth-provider.ts` owns `supabaseAdmin()`. It passes
`global: { fetch: withDeadline }`. `withDeadline(input, init)` calls
`globalThis.fetch(input, { ...init, signal })`. The signal is `AbortSignal.timeout(deadlineMs)`,
combined through `AbortSignal.any` with any signal the caller passed. The global is looked up **at
call time**, never captured at module load. That keeps `tests/setup.ts`'s wrapper, and this
change's fault injector (D11), underneath the application's deadline.

The deadline covers the whole exchange, not only the headers: undici honours the signal until the
body is consumed, and auth-js reads the body (`result.json()`) inside the same call.

*Alternatives:*
- `Promise.race` against a timer frees neither the socket nor the pool slot, and the late answer
  still lands.
- An undici `Agent` with `headersTimeout` is a dispatcher option: Node-only, and it does not cover
  the body.
- Next.js patches the global fetch as well. Passing a signal is supported there, and the
  `no-store` behaviour of a POST/PUT is unchanged.

### D2 — 5 s per request, from `AUTH_PROVIDER_DEADLINE_MS`

The default is 5000 ms. `AUTH_PROVIDER_DEADLINE_MS` overrides it: an integer from 500 to 60000.
Any other value throws when the client is created, because a misconfiguration fails loudly rather
than silently running unbounded. The client is created per call, so a test can set the variable
before the call it exercises.

That is about four times the slowest request GoTrue logged in the measured window (1.3 s). Worst
case, with `D` the deadline and every request lost:

| path | provider requests under the lock, worst case | at 5 s |
|---|---|---|
| `changeResidentEmail`, main transaction | write `D` + read-back `2D` + resend `D` + read-back `2D` | 30 s |
| its repair transaction | read `2D` | 10 s |
| `changeResidentPassword` | current-address read `2D` + current check `2D` + write `D` + probe `2D` + resend `D` + probe `2D` | 50 s |
| `redeemPasswordReset` phase 2 | address read `2D` + write `D` + probe `2D` + resend `D` + probe `2D` | 40 s |
| `redeemPasswordReset` phase 3 | read `2D` + sign-in `2D` | 20 s |

That is against 300 s *per request* today. In the common case, one lost request, the added hold is
`D` plus one round trip. `D` is the tuning knob: lowering it shortens every row proportionally.

### D3 — One classification: `refused` or `unknown`

`classifyProviderError(error)` in `auth-provider.ts`:
- `null` → `ok`;
- `AuthRetryableFetchError` (status 0, or a retryable 5xx), or any non-`AuthError` rejection from
  the client → `unknown`;
- every other `AuthError` (the provider answered 4xx) → `refused`.

One exception is kept deliberately. The email-taken signature on the update path (500, *"Error
updating user"*) stays `refused`/`email_taken` through `isEmailTakenError`, which runs first. That
is resident-settings D2's recorded trade-off, unchanged.

**Every password check follows one rule** (pre-mortem finding 2). That covers `signIn`, the
current-password check in `changeResidentPassword`, D11's throwaway check, the D7/D8 probes and
phase 3's sign-in. Only `refused` with code `invalid_credentials` (an `AuthApiError`, status 400)
means "wrong password" or, for a probe, "not applied". Any other refusal (429
`over_request_rate_limit`, an `AuthUnknownError` from a non-JSON 4xx) says nothing about the
password. It is treated as `unknown`: `provider_unavailable` for a check, "cannot tell" for a probe.
Otherwise a rate limit on `/token` would tell a person with the right password that it is wrong,
and D11's throwaway checks spend the same `/token` budget. The rule is symmetric for unknown and
known names.

### D4 — What may be resent

| call | resend on `unknown`? | why |
|---|---|---|
| `getUserById`, `signInWithPassword` | yes, once (two attempts total), and only when the first answer never came (`classifyProviderError` → `unknown`). A definite refusal, a 429 included, is not resent: it would be hit again at once | reads and a password check change nothing. A second grant only creates a provider session that is discarded, as every refusal path already does |
| `updateUserById` | only after a read-back shows it did not apply (D6–D8), at most once, under the same lock | a blind second PUT would be answered against a state we do not know |
| `createUser` | never | not idempotent. D5 compensates instead |
| `deleteUser` | yes, once | a repeat gets a 404, which counts as done |

The resend is inside `auth-provider.ts` for the calls marked "yes", so call sites see a single
result. The update's resend is explicit at the call site, because it depends on the read-back.

### D5 — `createUser` gets our own id, and an unknown outcome deletes it

`registerHousehold`, `claimResidentProfile` and `joinHousehold` generate `accountId = randomUUID()`
before `createUser` and pass it as `id`. On success they assert `data.user.id === accountId`. On a
mismatch, they delete **`data.user.id`**, the user actually created (pre-mortem finding 5; deleting
`accountId` would 404 and orphan the real one), and throw `signup_failed`. On `unknown`, they call
`deleteAuthUserBestEffort(accountId)` and then throw `signup_failed` / `RegistrationError`. Nothing
in Postgres points at that id yet, so deleting is correct whether or not the creation landed. A
404 on the delete means it never landed.

What each outcome leaves:
- `ok`: unchanged from today;
- `refused`: nothing exists, and codes are unchanged (`email_taken` included);
- `unknown` + delete succeeds: nothing exists, and the address is free;
- `unknown` + delete lost: an orphan may exist, and it is logged. For a bound link a retry then
  meets `email_taken` on the derived address. That residual is logged, not repaired, because
  repairing it would need a lookup by address the admin API does not offer (`listUsers` paging, as
  `provider-user-compensation.test.ts` does, is too slow for a request path).

*Alternative:* `listUsers` by address after an unknown outcome. It is slow, paged, and races with
the address being taken for real. Rejected. Assumption A1 (does GoTrue honour `id`?) is the first
task. If it fails, stop and revisit this decision.

### D6 — Email change: read back under the lock, then reconcile

This happens in `changeResidentEmail`'s main transaction, after `updateUserById` returns
`unknown`, still holding membership → account → session:

*Applied* is defined in one way only: the provider's address, normalized, **equals the requested
address**. Everything else is *not applied*. There is no comparison with a "previous address". The
function never reads the provider's address before writing. For a resident who joined without an
email, the previous provider address is the derived `.invalid` one while `account.email` is null,
so "previous" has no single value (pre-mortem finding 1).

```
write -> unknown
  read-back getUserById
    = requested ---------> applied: providerOutcome = "applied", commit as normal
    != requested --------> resend write once
                             ok        -> applied
                             refused   -> email_taken / thrown as today (rollback, nothing applied)
                             unknown   -> read-back again: = requested -> applied
                                                           | != requested -> provider_unavailable (rollback)
                                                           | unknown -> (*)
    unknown -------------> (*)
(*) throw with providerOutcome = "unknown"
```

`providerUpdated` becomes a three-valued `providerOutcome: "none" | "applied" | "unknown"`. The
outer catch runs the repair transaction (membership → account locks, `getUserById`) for both
`applied` (a failed commit, as today) and `unknown`. **For `unknown`, the repair writes only in
one case:**
- the provider holds the requested address → set `account.email` to it, clear
  `email_verified_at`, record `account.email_changed` once (only if the row changes), and return
  success;
- the provider holds anything else → **write nothing** and throw `provider_unavailable`. It must
  never write the provider's address into `account.email` on this branch: for a resident without
  an email that address is the derived `.invalid` one, and writing it would make every later reset
  link refuse (`auth.ts:1771`, `:1842` require `email === null`);
- the repair's read is itself `unknown`, or the repair fails → `change_incomplete`, as today.

The `applied` branch (a failed commit) keeps today's reconcile-to-the-provider rule unchanged:
there the provider is known to hold this request's address, or a later request's, never the
derived one.

The audit event stays once: the main transaction's insert rolled back with it, and the repair
inserts only when it changes the row.

### D7 — Password change: probe with the new password under the lock

A password cannot be read. The only evidence is whether the new one authenticates. The new helper
is `confirmPasswordSet(email, password): "applied" | "not_applied" | "unknown"`: a
`signInWithPassword` probe (two attempts, D4) classified per D3's probe rule. The returned provider
session is discarded.

This happens in `changeResidentPassword`'s main transaction, still holding membership → account →
session. The session revoke and the stamp already ran earlier in that transaction. **The audit
insert moves to after the provider outcome is resolved**, inside the same transaction, so it is
written only when the change is confirmed. (Moving it after the provider call is safe: if it fails
after an applied write, the commit fails and the existing `applied` repair re-records it.)

```
write -> ok                                -> audit, commit: success (as today)
write -> refused                           -> throw as today (rollback: nothing ended, nothing recorded)
write -> unknown -> probe
  applied     -> audit, commit: success
  not_applied -> resend write once -> ok: audit, commit: success
                                     refused | unknown -> probe -> applied: audit, commit: success
                                                                 | not_applied: (S) then password_unchanged_sessions_ended
                                                                 | unknown: (S) then password_uncertain_sessions_ended
  unknown     -> (S) then password_uncertain_sessions_ended
(S) the safe direction: COMMIT the main transaction as it stands (other sessions revoked,
    password_changed_at stamped), WITHOUT the audit event; then throw the code named.
```

The two (S) codes are new, and distinct from `provider_unavailable` ("nothing changed", which would
be false here because the other sessions have ended) and from `change_incomplete` (the existing
"repair failed" code, which promises nothing about sessions). Texts in D10.

**The safe direction is committed by the main transaction itself, under the locks it already
holds** (pre-mortem finding 3). It is not re-applied by a separate repair transaction afterwards,
which would leave the other sessions live in the gap between the two, or for good if the repair
failed. The callback returns a marker, and the function throws the code after
`withSessionContext` has committed. If that commit itself fails, the `unknown` catch branch runs
the old-style repair (same locks, revoke + stamp, no audit) and then throws `change_incomplete`.

**Why even "not applied" goes the safe direction** (pre-mortem finding 4). Every path into (S) has
had at least one write whose answer never came. The deadline cuts slow requests as well as lost
ones, so such a write may still reach GoTrue and apply after the lock is released. It is then too
late to revoke. Ending the other sessions now costs the resident a sign-in elsewhere. Not ending
them risks live sessions under a changed password, against O-13. The stamp makes `signIn` refuse
any sign-in whose check began before it, which is safe either way. Only a clean `refused` on the
first write, with no unknown in between, rolls back without ending anything.

**Clocks** (pre-mortem finding 13). The existing repair's `createdAt < startedAt` compares a DB
timestamp with a JS `new Date()`, against the hazards file's rule. `startedAt` becomes
`readDatabaseClock()`, taken before the main transaction opens. That fixes the existing repair too:
it is a sibling and is swept in the same change.

Steps 10 and 11 (the current-address read and the current-password check): `unknown`, or a refusal
other than `invalid_credentials` (D3) → `AccountSettingsError("provider_unavailable")`, with
nothing written. `invalid_credentials` stays `wrong_current_password`.

If the new password equals the current one, the probe always says `applied`, and that is the right
answer.

### D8 — Reset phase 2: the same probe, and phase 3 as the last word

The probe needs the account's address. It is read **only after the write came back `unknown`**
(pre-mortem finding 10). Reading it before every write would turn a lost read on the happy path
into `reset_incomplete`, spending a link that would have worked today. A lost address read is
itself an unknown outcome, so it goes to phase 3 with `passwordOutcome = "unknown"`, and phase 3's
own sign-in decides.

```
write -> ok                     -> stamp, commit, phase 3 (as today)
write -> refused                -> reset_incomplete (as today)
write -> unknown -> getUserById -> unknown                         -> U
                                -> address -> probe -> applied      -> stamp, commit, phase 3
                                                    -> unknown      -> U
                                                    -> not_applied  -> resend once
                                                         ok                         -> stamp, commit, phase 3
                                                         refused | unknown -> probe -> applied      -> stamp, commit, phase 3
                                                                                    -> not_applied  -> reset_incomplete
                                                                                    -> unknown      -> U
U = commit phase 2 WITHOUT the post-write stamp; phase 3 with passwordOutcome = "unknown"
```

Phase 1's stamp already covers the window, as its own comment argues, so skipping phase 2's stamp
when the write is unconfirmed loses nothing. Phase 1 has already revoked every session, so the
late-landing risk (Risks, A3) cannot leave a session live here. At worst the new password starts
working after the person was told to ask for a new link.

Phase 3's mapping of its own failures depends on `passwordOutcome`:
- `"set"` (as today): any failure except `invalid_link` → `reset_done_sign_in_failed`;
- `"unknown"`, and the sign-in succeeds → success (the password was set);
- `"unknown"`, and the sign-in is refused with `invalid_credentials` → `reset_incomplete`;
- `"unknown"`, and anything else → the new code `JoinError("reset_outcome_unknown")`.

The action redirects to `/sign-in?note=password_reset_unknown`, which says "your new password may
be set; try it; if it fails, ask the administration for a new link".

### D9 — Reads outside a lock

- Steps 4 and 5 (`signIn`): `unknown`, or a password-check refusal other than
  `invalid_credentials` (D3) → `SignInError("provider_unavailable")`.
- The register action's post-registration `signIn` switch gains the same case. It runs
  `undoRegisterHousehold`, as every other failure there already does, and shows the
  **registration's** failure text, not the sign-in's (pre-mortem finding 14). The household was
  undone, so "try signing in again" would send the person to an account that no longer exists.
- Step 7 (join's sign-in): every failure stays `signup_failed`, and the existing
  `deleteAuthUserUnlessCommitted` is correct. It goes through the D4 resend wrapper like every other
  password check (local review, 2026-09-29): as a raw call, one lost grant failed a join the spec's
  "sent a second time" rule would have completed.

### D10 — New codes and texts

| class | code | text (draft, `src/ui/strings/de.ts`, for human confirmation) |
|---|---|---|
| `SignInError` | `provider_unavailable` | „Die Anmeldung ist gerade nicht möglich. Bitte versuche es gleich noch einmal." |
| `AccountSettingsError` | `provider_unavailable` | „Das ist gerade nicht möglich. Es wurde nichts geändert – bitte versuche es gleich noch einmal." |
| `AccountSettingsError` | `password_unchanged_sessions_ended` | „Dein Passwort wurde nicht geändert – bitte versuche es gleich noch einmal. Deine anderen Anmeldungen wurden vorsichtshalber beendet." |
| `AccountSettingsError` | `password_uncertain_sessions_ended` | „Ob dein neues Passwort übernommen wurde, ließ sich nicht feststellen. Deine anderen Anmeldungen wurden vorsichtshalber beendet. Ändere es am besten gleich noch einmal – als aktuelles Passwort gilt das alte oder das neue." |
| `JoinError` | `reset_outcome_unknown` | note on `/sign-in`: „Dein neues Passwort ist möglicherweise schon gesetzt. Versuche, dich damit anzumelden. Klappt das nicht, bitte die Verwaltung um einen neuen Link." |

Every exhaustive switch gains the case; the `never` default makes a missed one a compile error. The
provider's own message reaches only the log (`ui/vocabulary`, "An internal failure is not narrated
to the resident").

### D11 — A name sign-in makes the same provider calls whether or not the name exists

Today an unknown display name is refused before any provider call (`auth.ts:559`), while a known
one makes two (`getUserById`, then `signInWithPassword`). That already leaks existence through
timing: the unknown name comes back one or two provider round trips sooner. `provider_unavailable`
would add a second, message-level leak, since only a known name can meet a lost provider request.

So the name path becomes uniform. When the name does not resolve, `signIn` still makes the same two
calls, against targets that cannot match anything:
- `getUserById` on a fresh random UUID (answered 404: `refused`);
- `signInWithPassword` on a fresh random `@accounts.flatmate.invalid` address, with the typed
  password (answered `invalid_credentials`).

**Parity by construction, not by duplicated code** (pre-mortem finding 9). The name path only
decides which address and which account id to use, then falls through the **same** shared code as
every name sign-in. That code runs the lookup, `readDatabaseClock()`, the password check and the
membership refusal:
- the name does not resolve → look up a random UUID, and use a random `.invalid` address as
  `email`;
- the name resolves but `getUserById` is refused (the Auth user is missing) → use a random
  `.invalid` address as `email`;
- the lookup is `unknown` → `provider_unavailable` at that same point, for a known and an unknown
  name alike. Both short-circuit at the same request.

Then the same `readDatabaseClock()`, the same `signInWithPassword`, classified per D3. For a
throwaway address that ends as `invalid_credentials`, unless the check is lost or rate-limited,
which gives `provider_unavailable`, as for any name. The same request sequence, in the same order,
therefore holds for all three cases by construction:

```
unknown name / known name, wrong password / known name, missing Auth user:
  GET /admin/users/:id  ->  DB clock read  ->  POST /token  ->  (refusal | provider_unavailable)
```

The throwaway calls create nothing and store nothing. GoTrue answers a password grant for an
unknown address without creating a session. Their only cost is two provider requests on sign-ins
with an unknown name. Rate limiting is unaffected, because every sign-in already reaches GoTrue
from the server's address.

*Rejected: a health check (`/auth/v1/health`) before the lookup.* It covers a full outage only. The
measured failure is single requests lost while everything around them is answered, so availability
is a property of each request, not a state to check once. After a passing health check the lookup
can still be lost, and the same leak-or-lie choice comes back. It would also add a request to every
sign-in, not only failed ones.

The email path needs none of this: it already calls `signInWithPassword` for any address.
`sign-in-enumeration.test.ts` keeps guarding the message-level property. Task 5.3 adds the
call-parity and lost-request cases.

### D12 — Tests: a local server for the deadline, fault injection for the call sites

**Unit** (`tests/unit/identity/auth-provider-deadline.test.ts`): a `node:http` server on
`127.0.0.1` withholds chosen responses, the same shape as the test-timeouts branch's
`lost-response-fetch.test.ts`. The admin client is pointed at it.

**Fault injection** (`tests/helpers/provider-fault.ts`): installs one wrapper at `globalThis.fetch`
(restored in `afterEach`) that holds a **list of rules**, so one injector covers several faults
without stacking wrappers (pre-mortem finding 6). Each rule is `method` + path pattern +
`occurrence` (`number | number[] | { from: number } | "every"`, counted per rule over its own
matches) + `mode`:
- `drop-before`: never forward; wait until `init.signal` aborts, then reject with its reason. This
  gives *not applied*.
- `forward-then-drop`: forward **without** the caller's signal, and record `forwardCompleted` once
  GoTrue's full response body has been read. **Always** reject at the caller's abort (pre-mortem
  finding 7). If the abort comes before `forwardCompleted`, record `forwardIncomplete`; the test
  asserts it is absent, so a slow forward fails loudly instead of silently becoming `drop-before`.
  This gives *applied, answer lost*.
- `record`: pass through unchanged.

Every request, matched or not, is recorded in `seen: { method, url, body, rule?, outcome }[]`. The
body is parsed JSON where possible, so a test can read the id `createUser` sent and delete it in
teardown. Install the injector **after** the fixtures (`registerTestHousehold` itself calls
`POST /admin/users` and `/token`), so fixture requests neither count as occurrences nor get
dropped.

~~If `fix/test-timeouts-hosted-dev` merges first, the injector bypasses its resend wrapper.~~
**Superseded 2026-09-29, after PR #37 merged** (8 s × 3 attempts):
- The wrapper stays below the injector. `drop-before` never reaches it. For `forward-then-drop`,
  its resend only rescues a forward that was itself lost, which is what that mode needs anyway (the
  request applied); a second copy of a PUT sets the same values, and a duplicate `createUser`
  fails loudly with `email_exists`.
- The application's deadline sits *above* the wrapper and passes its signal down. At 5 s it would
  abort every lost request before the wrapper's 8 s deadline, silently disabling PR #37's resend
  for all application calls in the suite. So `tests/setup.ts` sets `AUTH_PROVIDER_DEADLINE_MS=30000`
  on every file, which is longer than the wrapper's 24 s. The fault-injection files set 3000 at
  module load, after setup.

Both use the real flatmate-io-dev GoTrue and Postgres. Only the transport loss is simulated (human
decision in explore, 2026-09-28: this is fault injection, not mocking the provider). The tests set
`AUTH_PROVIDER_DEADLINE_MS=3000`, above dev's observed 1.3 s and well inside the 60 s test timeout.

**Lock release** (`tests/integration/policy/provider-deadline-lock-release.test.ts`): a
`changeResidentEmail` whose write is `drop-before` (and so is its resend) holds the locks. A
concurrent `signIn` for the same account must complete within `6D + 10 s`. Without the deadline it
waits 300 s and the test times out. This is deterministic: `signIn`'s `membership FOR UPDATE` is
blocked by the held lock, not by chance scheduling.

## Invariants and every path that reaches them

**Every writer of the same state, pairwise** (the design rule):

| state | writers | what serializes each pair |
|---|---|---|
| provider password | `changeResidentPassword`, `redeemPasswordReset` phase 2 (and `createUser` for a new id nobody else holds) | both hold `account FOR UPDATE` across the write, the read-back **and** the resend. The resend stays inside the same transaction, so the pairwise serialization of PR #23 is unchanged |
| provider address | `changeResidentEmail` (main and repair); `createUser` (new ids only) | `account FOR UPDATE`. The read-back happens under it |
| `account.email` | `changeResidentEmail` main and repair; join's insert (new row) | `account FOR UPDATE`; a new row cannot collide |
| live sessions | `signIn`/`joinHousehold`/phase 3 insert; `changeResidentPassword` revoke and both repairs; phase 1/3 revoke; removal; `revokeSession` | unchanged from PR #23. The safe direction (D7 (S)) commits inside the main transaction, under the locks it already holds, so it adds no transaction and no lock-order pair. Its commit-failure fallback repair takes membership → account in the existing repair's order. Both filter on `createdAt < startedAt`, with `startedAt` now taken from the DB clock |
| `password_changed_at` | `changeResidentPassword` main and both repairs; phase 1, phase 2 | `account FOR UPDATE` |
| Auth users (existence) | `createUser` ×3, `deleteAuthUserBestEffort`, `deleteAuthUserUnlessCommitted` | the ids are generated here and known to no other request, so the delete by our own id cannot race another writer |

**Other paths to the same state:**
- **Raw SQL as `app_runtime`**: none of this state is provider-side, so it is unaffected.
- **`SECURITY DEFINER`**: none is involved.
- **A concurrent request**: covered by the lock table above.
- **A late copy of an aborted request** (A3): not excludable, see Risks.

## Risks / Trade-offs

- **[A request we aborted still applies later]** (pre-mortem finding 4). The measured requests were
  *lost*: they never reached GoTrue. But the deadline also cuts requests that are merely *slow*,
  and GoTrue may apply those after we abort, even after the lock is released. Mitigations by state:
  - **Password:** any path with an unknown write ends the other sessions and stamps (D7 (S)), so a
    late apply cannot leave a live session under a changed password. The reset has already ended
    every session in phase 1.
  - **Email:** a late apply leaves the provider holding the new address while `account.email`
    holds the old one. Sign-in by name reads the provider's address, so it keeps working. The
    stored address stays stale until the next change. This residual is logged, not repaired.
  - **`createUser`:** a late apply after our delete leaves an orphan that blocks the address (D5's
    logged residual).
- **[A function killed mid-sequence]** The worst cases in D2 (password 50 s, reset 40 s + 20 s) are
  below the platform function's `maxDuration` (300 s by default). A lower `maxDuration` in the
  deployment config would have to stay above the worst case. A killed function after an applied PUT
  leaves the transaction uncommitted, which is the commit-failure case the repairs already describe.
- **[Worst-case lock hold is 30–50 s, not seconds]** → Still a sixth or less of today's, and only
  when every request of a sequence is lost. `D` is the knob. The Postgres-side backstop is the
  follow-up change.
- **[The safe direction ends sessions for a password that did not change]** This happens on every
  path with an unknown write, the "not applied" outcome included (D7). → Chosen on purpose: ending
  a session is always recoverable by signing in, and a live session under a changed password is
  not. The text says so (D10).
- **[No audit event when the outcome stays unknown]** → P-4 requires audited pipeline states. This
  is an account event, and recording a change nobody can confirm would put a false fact in an
  append-only log. The log line records the unknown outcome.
- **[An unknown name now costs two provider requests]** → Accepted: this is what closes both the
  existing timing oracle and the one `provider_unavailable` would add (D11). Roughly equal timing is
  the aim, not constant time: the two paths make the same requests, but GoTrue's own latency for a
  404 or an unknown address can still differ slightly from a real lookup.
- **[The GoTrue version ignores `id`]** → task 1 probes this first and stops if it fails.
- **[Password probes add sign-in grants]** Rate limits on `/token` could turn a probe `refused`.
  → D3 counts any non-`invalid_credentials` refusal as `unknown` for a probe, which is the
  conservative reading.

## Migration Plan

There is no data migration. Deploy as a normal release. `AUTH_PROVIDER_DEADLINE_MS` is optional,
with 5 s as the default, and is documented in `.env.example`. Rollback is a revert: nothing
persistent depends on the new code paths, and the codes they add are only rendered.

## Open Questions

None that change the approach. The German texts (D10) are for the human's review, not design
unknowns.
