## Context

See `proposal.md` (Why) for the problem, and the three delta specs for the behaviour. The current
state that shapes the approach:

- `signIn({ kind: "resident", householdId, displayName, password })`
  (`src/modules/identity/auth.ts`) refuses a non-UUID `householdId` (`invalid_household`). It then
  opens an RLS-scoped bootstrap context *for that household* to find the name. The household id
  has to be known before any session exists, and `household`'s only policy is
  `household_is_own_household`. A lookup by anything other than the id is therefore impossible as
  `app_runtime` without a deliberate hole.
- Since auth-provider-deadline D11, an unknown name takes the same provider request sequence as a
  known one (a throwaway account id, then a `.invalid` address). This change must keep that
  property for an unknown *code*.
- Join codes (`generateJoinCode`, `normalizeJoinCode`, `isWellFormedJoinCode` in
  `src/modules/identity/repository.ts`) use the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` and
  the shape `XXXXX-XXXXX`. Their conditions (`domain/identity.md` §2.1, *„fünf Auflagen"*) exist
  because *„wer ihn hat, kommt an Beratungsinhalte"*. The sign-in code grants nothing on its own,
  so it carries none of them.
- `record_join_attempt(source_hash, window_seconds, limit)` (`drizzle/0014`) is a generic
  per-key counter with built-in 24 h retention. `joinAttemptSourceHash` keys it with
  `HMAC("join-attempt:" + ip)`. `getClientIp` returns `null` unless
  `JOIN_ATTEMPT_TRUSTED_IP_HEADER` is set, and is unset on dev and locally, so every request shares
  one bucket there.
- `Session.remember_me` is written once, by `insertSessionTx`. After this change every path that
  creates a resident session shows the checkbox: the join form, the reset form, and both sign-in
  tabs (new). `signIn` already takes `options.rememberMe`.
- Migrations on main end at `0031`. `0029` is held by open PR #50 and is already on dev.
  `flatmate-io-dev` is shared with other branches' pre-push runs and CI's `verify-hosted`.

## Goals / Non-Goals

**Goals:**
- One generator for the code, enforced in the database, so no writer can forget it.
- One new unauthenticated door, returning one non-secret column for one exact match.
- The D11 property survives: no answer and no request sequence shows whether the code exists.
- Device memory that is opt-in, holds one value, and degrades to "type it" with no error.

**Non-Goals:**
- Rotating the code, a household picker or search, accepting the UUID in the form.
- Rate-limiting the two email sign-in paths (proposal Assumption 4).
- Renaming `join_attempt` now that it holds a second bucket (a rename is a human-applied DDL step
  for no behaviour gain; the data-inventory purpose is widened instead, D5).

## Decisions

### D1 · The code: shape, alphabet, generator in the database

**Shape `XXXX-XXXX-XXXX`** over the join-code alphabet: 12 characters, 32¹² ≈ 1.2 × 10¹⁸ values.
A shape of its own, not the join code's `XXXXX-XXXXX`, lets each entry point reject the other kind
of code by shape alone, before any lookup (identity/sign-in, *"A join code typed into the
household field"*). Each code can then never resolve on the other path, by construction rather
than by a lookup that happens to miss.

**The generator lives in the database** as a column default:
`household_sign_in_code_generate()`, a plain `LANGUAGE sql VOLATILE` function (not
`SECURITY DEFINER`). It draws 12 bytes from `uuid_send(gen_random_uuid())`, takes bytes 0–5 and
9–14 (skipping the version and variant bits), and maps each byte `% 32` onto the alphabet, which
is unbiased since 256 = 8 × 32. `gen_random_uuid()` is core Postgres, so this needs no extension,
and it is the same source the stack already trusts for ids.

- *Why not generate in TypeScript like join codes?* `household` is written by
  `registerHousehold`, by test helpers, by `scripts/seed-demo-household.ts`, and by other branches
  whose `schema.ts` has never heard of this column but which run against the same dev database. A
  `NOT NULL` column without a default would break every one of them. With a default it is
  expand-only (the expand/contract lesson), and there is one generator instead of a TS one plus a
  SQL backfill copy.
- *Collisions*: a unique index enforces "no two households share a code". At 1.2 × 10¹⁸ an insert
  failing on a collision is not a case worth a retry loop. If it ever happens, it fails loudly as a
  unique violation and does not silently pair a code with the wrong household.
- **Shape enforced too**: a `CHECK (sign_in_code ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$')`.
  TypeScript keeps `HOUSEHOLD_SIGN_IN_CODE_SHAPE` and `normalizeHouseholdSignInCode` next to the
  join-code helpers, built from the same `JOIN_CODE_ALPHABET` constant. A unit test checks the TS
  regex and the SQL `CHECK` against the same accept/reject table, and an integration test checks
  that freshly generated codes match the TS shape, so the two definitions cannot drift apart
  silently.
- **Normalisation** mirrors `normalizeJoinCode`: upper-case, strip whitespace and `-`, and
  re-insert hyphens only when exactly 12 characters remain. It never throws.

### D2 · Migration `0032_household_sign_in_code.sql` (agent-applied) and statement order

The number is the next free one on main. If another branch lands `0032` first, renumber at rebase.
All statements are re-runnable (`migration-shape.ts` applies after `0017`):

1. `CREATE OR REPLACE FUNCTION household_sign_in_code_generate() RETURNS text …` with
   `SET search_path = public`. Then `REVOKE ALL … FROM PUBLIC, anon, authenticated` and
   `GRANT EXECUTE … TO app_runtime`. A column default runs with the inserting role's privileges,
   so `app_runtime` needs `EXECUTE`. No other role needs it (`0030`'s posture).
2. `ALTER TABLE household ADD COLUMN IF NOT EXISTS sign_in_code text NOT NULL DEFAULT
   household_sign_in_code_generate()`. Postgres evaluates a volatile default once per existing
   row when it adds the column, so this one statement both backfills and covers future writers.
   No constraint on the column exists yet at this point, so nothing can refuse the backfill.
3. The `CHECK` (in a `DO` block that adds it only if `pg_constraint` lacks the name). Every value
   step 2 wrote comes from the generator, so all of them satisfy it.
4. `CREATE UNIQUE INDEX IF NOT EXISTS household_sign_in_code_key ON household (sign_in_code)`.
   This is last because it is the only statement that could fail on the data (a collision), and if
   it does, nothing before it needs undoing. The backfilled rows are then rerolled with
   `UPDATE … SET sign_in_code = household_sign_in_code_generate()` and the file run again.

The Drizzle `schema.ts` declares the column with `.default(sql\`household_sign_in_code_generate()\`)`,
the `CHECK`, and the unique index. The file is written as a `drizzle-kit generate --custom`
migration, following `0014`'s precedent, because a schema diff cannot express the function. The
snapshot in `drizzle/meta/` is regenerated so the next `generate` produces no spurious diff.

### D3 · Migration `0033_resolve_household_sign_in_code.sql` (human-applied) — the new door

```sql
DROP FUNCTION IF EXISTS resolve_household_sign_in_code(text);
CREATE FUNCTION resolve_household_sign_in_code(p_code text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM household WHERE sign_in_code = p_code AND deleted_at IS NULL
$$;
REVOKE ALL ON FUNCTION resolve_household_sign_in_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_household_sign_in_code(text) TO app_runtime;
```

It is a separate file because the harness refuses `SECURITY DEFINER`. `0032` then goes through on
its own, and the human runs `0033` whole.

**Narrowness, argued against the earlier designs.** join-code-protections D2 accepted
`resolve_join_code` taking *a stranger's string* because of narrowness plus FR-2.28's attempt
limit, and because a correct guess revealed only *"the name the joiner is about to be shown
anyway"*. This function is narrower on every count:
- It returns one column, the household id, which C-1.4 calls *„keine Sicherheitsgrenze, nur
  Zuordnung"*. It does not return the name.
- **The caller never sees the result.** `signIn` uses it only to open the bootstrap context and
  then refuses an unknown code exactly like a wrong password (D4). An exact-match lookup on a
  10¹⁸ space is not an enumeration surface when its answer is not observable.
- The relationship it joins through is enforced: the unique index (D2.4) guarantees at most one
  row, so `RETURNS uuid` (not `SETOF`) is never ambiguous. The `deleted_at IS NULL` predicate
  carries the deletion rule inside the function, because RLS does not apply in it.
- The rate limit (D5) is not load-bearing for the lookup's secrecy, since nothing leaks. It bounds
  password guesses against a known household and name. The migration comment says this, so the
  next reader of the SQL knows what the limit is for.

*Alternative rejected — relaxing `household_is_own_household` to allow a lookup by code*, for the
same reason join-code-protections gave: it widens the policy for every query, and G-C is a hard
floor.

`scripts/lint/definer-coverage.ts` requires the function to be called in a
`tests/integration/raw-sql/` test and listed in `KNOWN_DEFINERS`
(`tests/integration/schema/catalog-shape.test.ts`).

### D4 · Sign-in by code: a new module entry point, the UUID path stays internal

`auth.ts` gains `signInResidentByHouseholdCode({ householdCode, displayName, password },
{ rememberMe, sourceIp })`:

1. blank fields → `missing_fields` (unchanged rule);
2. `normalizeHouseholdSignInCode`, then not well-formed → `invalid_household`, with no lookup
   (a UUID, a join code and a name all land here);
3. **rate limit** (D5) → `rate_limited` (a new `SignInErrorCode`; the action's exhaustive switch
   makes it a compile error until a message exists);
4. `resolveHouseholdSignInCode(code)` (repository, the definer) → `householdId ?? randomUUID()`;
5. `signIn({ kind: "resident", householdId, … }, { rememberMe })`.

Step 4's fallback is what keeps D11. An unknown code becomes an unknown household, whose name scan
finds nothing, so the existing throwaway lookup and `.invalid` password grant run. The provider
sees the same `GET /admin/users/:id → readDatabaseClock → POST /token` sequence. Steps 1–4 run
before any provider call and outside any transaction, so **no new provider-boundary failure point
is added**. The `signIn` failure-state analysis (identity/provider-calls) is unchanged.

`signIn`'s `kind: "resident"` with a `householdId` stays. About 40 existing test call sites use
it, and keeping it means none of them change. The form no longer posts a household id, and the
action calls only the new function. The UUID path is reachable from the module, not from any
route. *Alternative rejected — changing `signIn`'s own input to a code*: it changes 40 call sites
and gains nothing a reviewer could observe.

The `resident_email` and `household` paths take `rememberMe` from the form, which they did not
before. That is a one-argument change at the action (identity/sign-in, *"Sign-in offers 'stay
signed in'"*).

### D5 · Rate limit: reuse `record_join_attempt`, key on source and code

- Key: `HMAC(SESSION_TOKEN_HASH_SECRET, "sign-in-attempt:" + (ip ?? "unknown") + ":" +
  normalisedCode)`. The prefix separates it from `join-attempt:` the same way that one is
  separated from session hashes.
- **Why the code is in the key.** On dev, and anywhere `JOIN_ATTEMPT_TRUSTED_IP_HEADER` is unset,
  `ip` is `null`. A source-only key would then be **one global bucket for every household's name
  sign-in**: anyone could lock out every resident of every household for 15 minutes. With the code
  in the key the bucket is per household (identity/sign-in, *"One household's flood does not lock
  out another"*). With a trusted header it is per source and household. The attack the limit
  exists for, guessing a password for a known household and name, stays bounded either way.
  Cycling codes gives an attacker fresh buckets but nothing to guess against, because an unknown
  code never matches a real account (D4).
- `SIGN_IN_ATTEMPT_WINDOW_SECONDS = 15 * 60`, `SIGN_IN_ATTEMPT_LIMIT = 20`, the join route's values
  with the same reasoning: a 7-person household behind one NAT does not reach them.
- **Where it runs: inside `signInResidentByHouseholdCode`**, not in the action. The join route
  calls `recordJoinAttempt` from its action, but a rule that lives in the module cannot be skipped
  by a future second caller (the sibling-entry hazard). The action passes `getClientIp(await
  headers())`. `getClientIp` moves from `src/app/(auth)/join/[code]/request-ip.ts` to a shared
  `src/app/request-ip.ts`, because the join-only comment *"Route-local: nothing outside this route
  needs to read a client address today"* stops being true.
- The writer of the counter rows is `record_join_attempt` alone, for both buckets. Its concurrency
  behaviour (a burst can overshoot the limit by its concurrency) is unchanged and was accepted in
  join-by-link D3. The test for the limit is labelled an invariant guard for the overshoot case.
- `data-inventory.yml`: `join_attempt.source_hash`'s purpose widens to *"… für die
  Versuchsbegrenzung auf der Beitrittsroute (FR-2.28/EC-2.14) und bei der Anmeldung über
  Haushaltskennung und Name (03-PRD §6.5)"*. Retention is unchanged.

### D6 · Device memory: one localStorage key, written by the resident frame

- **Key** `flatmate.householdSignInCode`. **Value**: the code string, nothing else.
- **Writer**: a client component `HouseholdCodeMemory` rendered in `(resident)/layout.tsx` inside
  its own `<Suspense fallback={null}>`, off the blocking path (loading-feedback D4). It gets
  `{ code, rememberMe }` from a new repository read `getSignInDeviceMemory(current)`, which reads
  `session.remember_me` for `current.sessionId` and `household.sign_in_code` under the session's
  own context (RLS-scoped, no new hole). In `useEffect`: `rememberMe ? setItem : removeItem`, with
  each call in try/catch. Writing from the frame rather than from each action covers every path
  into a resident session (join, reset redemption, both sign-in tabs) at one site. It also
  refreshes the value on every visit, so a resident of household 2 overwrites household 1's code
  (identity/device-memory, shared device).
- **Household sessions never write.** The frame redirects them before rendering, so the household
  tab's checkbox affects only the session length (proposal Assumption 3).
- **Reader**: `sign-in-form.tsx` reads the key once in `useEffect` after mount, so there is no
  hydration mismatch, and sets the field. The field is controlled after that read, so the typed
  value is what posts. try/catch everywhere: storage that throws leaves an empty field.
- **Sign-out does not clear it** (spec). A stale value that no longer resolves gets the ordinary
  refusal and is not auto-cleared, because clearing on refusal would tell the visitor *which*
  field was wrong.
- **The § 25 TDDDG argument** (written in German into `06-Compliance-Anhang.md` as a new §10.6;
  the points, not the prose): § 25 Abs. 1 applies to every storage on the device, not only to
  cookies. Abs. 2 Nr. 2 exempts what is *unbedingt erforderlich* for a service the user has
  *ausdrücklich gewünscht*. That service is "keep this device signed in to my household", asked
  for by ticking the checkbox, and the value is written only while that choice stands and removed
  when it is cleared. It is the input the user would otherwise type, not information read from the
  device. `03-PRD.md` §6.5's *„Nur eine unbedingt erforderliche Sitzungs-Cookie"* stays literally
  true, and the subsection says so explicitly, so that nobody reads the localStorage key as a
  workaround of that line. Under DSGVO the code identifies a household, not a person: ⚙️, as
  `join_code_issuance.code` is.
- **G-B6** (*„Niemals API-Antworten, niemals Bewerber- oder Beratungsdaten"* and *„Genau eine
  Ausnahme"*). Its subject is the device cache's reach beyond the deletion concept. The code is
  not applicant, deliberation or vote data, has no deletion clock of its own, and is the same
  string the person types. **This reading is a GUARDRAILS interpretation and is put to the human**
  (tasks group 0) rather than assumed. If the human wants it written, a single German sentence is
  added to G-B6 naming this value as outside its scope, not a second exception.
- **Shared-device question** (GUARDRAILS, *„Wem gehören diese Daten …"*): the value belongs to the
  household, not to the person who wrote it. The next person on the device inherits only a
  household identifier, never a name, a session or a vote. That is the answer written into §10.6
  and the device-memory spec.

### D7 · Showing the code

- `getHouseholdSignInCode(context)` in `identity/repository.ts`, an RLS-scoped read of the own
  household. Visibility is tested on both sides (G-C7 style): through the repository, a session of
  household A gets A's code; as raw SQL as `app_runtime` under A's context, `household`'s row for
  B is invisible. `getSignInDeviceMemory` and `resolveHouseholdSignInCode` are reads too.
  `signInResidentByHouseholdCode` creates a session, so it is classified the same way `signIn` is
  in `authorization-matrix.test.ts` (an exempt row with its stated reason: it acts before any
  session exists).
- **E1** (`src/app/(resident)/account/page.tsx`): a new card „Deine WG" with the code in
  `font-mono` and the line „Mit dieser WG-Kennung und deinem Namen meldest du dich an." (UI label
  „WG", per `domain/identity.md` §2.1 *„UI-Label in v1 durchgängig „WG""*).
- **O20** (`src/app/(org)/settings/page.tsx`): the same code with „Bewohner:innen brauchen diese
  WG-Kennung, um sich mit ihrem Namen anzumelden."
- **A2 strings**: label „WG-Kennung", placeholder „z. B. ABCD-EFGH-JKLM",
  `autoCapitalize="characters"`, `autoComplete="off"`, `spellCheck={false}`. `invalidHousehold`
  becomes „Diese WG-Kennung sieht ungültig aus.", plus a new `tooManyAttempts` message saying to
  wait. The old placeholder string is removed.

### D8 · Paths to the guarded state, listed

| State | Paths that reach it | Where the rule is enforced |
|---|---|---|
| `household.sign_in_code` exists, is unique and well-formed | any `INSERT` (app, helpers, seed, other branches), backfill | DB default + `NOT NULL` + `CHECK` + unique index |
| code is stable | raw SQL `UPDATE` as `app_runtime` (RLS allows the own household) | **application-level only**: no repository function writes it. Accepted: a change breaks only prefill, not access, and a rotation feature is its own change (proposal Assumption 1) |
| code → household id | `resolve_household_sign_in_code` (the only unauthenticated path), the RLS read for display | definer: exact match, `deleted_at IS NULL`, one column, at most one row by the unique index; display: `household_is_own_household` |
| attempt counted | `record_join_attempt`, its only writer | the function itself (prune, insert, count in one call) |
| `remember_me` | `insertSessionTx`, its only writer, unchanged | — |
| stored code | `HouseholdCodeMemory` (write and remove); `sign-in-form` (read only) | client-side only, by design |

**Writers of the same state, pairwise**: `sign_in_code` has one writer, the default at insert, so
there is no pair. The counter has one writer function, so concurrency is its own concern (D5).
localStorage has one writer component. Two tabs of the same browser writing at once write the same
value or the latest session's value, and both outcomes are correct.

## Risks / Trade-offs

- [The code is easier to obtain than the UUID was, so a known household plus a guessable name now
  invites password guessing] → the UUID's obscurity was accidental, never a decided control
  (C-1.4). D5's limit bounds guesses per household and source, and the password remains the
  credential.
- [Without a trusted IP header, someone holding a household's code can lock that household's name
  sign-in for 15 minutes] → per household, not global (D5). Residents with an email can still sign
  in by address. Production should set `JOIN_ATTEMPT_TRUSTED_IP_HEADER`, and the review-log row
  says so.
- [Another branch on shared dev runs its strict data-inventory-live check and finds
  `household.sign_in_code` unlisted] → hosted dev is warning-only (data-inventory-gate D5). CI's
  disposable stack is built from each branch's own `drizzle/`.
- [Migration number clash at merge] → renumber at rebase; the files reference no number.
- [The G-B6 reading is rejected by the human] → D6's writer and reader are deleted, and the form
  still works by typed code. The specs' device-memory capability then becomes a REMOVED delta.
  That is why the human gate comes first in tasks.

## Migration Plan

1. Agent applies `0032` to `flatmate-io-dev` (Supabase MCP `apply_migration`). It checks that
   every household row has a well-formed, unique code, using a catalog and data query, before
   writing any code that depends on it.
2. Human runs `0033` in the Supabase SQL editor as `postgres`. The agent then checks
   `pg_proc.prosecdef`, `proconfig` and the ACL, and stops if they are not as written.
3. Production stays at `0012` until the end of v0.1 (unchanged decision). Nothing is deployed
   there.
4. Rollback: `DROP FUNCTION resolve_household_sign_in_code(text)` (human), then `ALTER TABLE
   household DROP COLUMN sign_in_code` and `DROP FUNCTION household_sign_in_code_generate()`
   (human: the harness refuses `DROP COLUMN`). Revert the app commit. Stored localStorage values
   become inert strings.
