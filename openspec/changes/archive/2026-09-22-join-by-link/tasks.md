# Tasks

> Read `design.md` before starting. Two things will otherwise be discovered late: the claim runs
> **inside** the join transaction (Decision 2), and the migration's `SECURITY DEFINER` function will
> be **refused by the agent harness** and needs a human to apply it (Migration Plan).

## 1. `close_round` becomes a role default (human decision, 2026-09-22)

> Unrelated to the join path, and folded into this change at the user's direction rather than
> given its own branch. Ordered first: it removes behaviour the rest of this change would
> otherwise have to reason around (design Decisions 7 and 12).

- [x] 1.1 `docs/domain/identity.md` §2.1 — give `close_round` a role-default note in the same shape
  as the existing `manage_rooms` box: *„Vorbelegt bei `household_admin` **und** `moderator`"*.
  German, it is a reasoning document (ADR-012). Carry its own abandonment condition in the note: a
  **third** such default is where S-04's `Berechtigungsvorlagen` exclusion must be reopened rather
  than stretched further. Verify `node tools/check-refs.ts`.
- [x] 1.2 `docs/review-log.md` §Offene-Punkte-Register — record the decision, its date and its
  reasoning. This is the **only** place a decision's status may live (G-N5). **It must not cite
  anything under `openspec/`** — `docs/` never points into it (handover gate, check-refs Rule 7).
  Verify `node tools/check-refs.ts` again.
- [x] 1.3 `docs/backlog/requirements/F1-requirements.md` §8 item 1 — the recommendation this
  supersedes (*"the household account's own resident profile holds it initially"*). Mark it resolved
  and point at the decision; **do not delete it** — records are permanent, a superseded one is
  marked, never removed. English (`docs/backlog/**` is a named ADR-012 exception).
- [x] 1.4 `src/modules/identity/repository.ts` — `MODERATOR_DEFAULT_PERMISSIONS` gains
  `"close_round"`. Update the comment above it, which currently states that `manage_rooms` is *"the
  one permission with a documented role-based default"* — that sentence becomes false with this
  task, and leaving it is how a comment starts lying.
- [x] 1.5 `src/modules/identity/auth.ts` — delete the `isFoundingResident` lookup and branch in
  `claimResidentProfile`; the new membership gets `permissions: []` unconditionally. Verify
  `grep -rn "isFoundingResident" src/ tests/` returns nothing.
- [x] 1.6 Rewrite `tests/integration/policy/founding-resident-permission.test.ts` to the new rule: a
  moderator opens a round with no individual grant, a plain member cannot, and the first resident
  membership gets no special treatment. **Replace, never delete** (G-G1). Checked: this file is not
  in `test/guarded.manifest.json`, so it is an ordinary test — but re-check before editing rather
  than trusting this line.
- [x] 1.7 Find anything else that leaned on the old grant —
  `grep -rn "close_round" src/ tests/` — and confirm every remaining call site still passes. The
  round-lifecycle actions in `src/modules/casting/repository.ts` and `src/app/(org)/rounds/new/`
  are the ones that gate on it.

## 2. The attempt limit (FR-2.28) — schema, migration, repository

- [x] 2.1 Add the `joinAttempt` table to `src/modules/identity/schema.ts` — `id`, `sourceHash`
  (`text`, not null), `attemptedAt` (`timestamptz`, not null, `defaultNow()`), plus an index on
  `(sourceHash, attemptedAt)`. **No `householdId`** (design Decision 3 / EC-2.14) and therefore no
  `pgPolicy`. Verify `npx tsx scripts/lint/rls-coverage.ts` still passes — it flags a table only
  when it declares `household_id` without a policy, and this one declares neither; add a comment
  saying that in the table's own doc block so the omission reads as decided rather than forgotten.
- [x] 2.2 Write `drizzle/0014_join_attempt.sql` by hand (`drizzle-kit generate --custom`), following
  `drizzle/0013_join_code_issuance.sql`'s comment style: `CREATE TABLE`, the index,
  `ALTER TABLE … ENABLE ROW LEVEL SECURITY` **with no policy**, then
  `record_join_attempt(p_source_hash text, p_window_seconds int, p_limit int) RETURNS boolean` as
  `SECURITY DEFINER … SET search_path = public` `VOLATILE`, with `REVOKE ALL … FROM PUBLIC` and
  `GRANT EXECUTE … TO app_runtime`. The function prunes rows older than 24 h, inserts the attempt,
  counts that source's attempts inside the window, and returns whether the attempt is allowed —
  refused attempts are recorded too (design Decision 3). Verify by applying it and calling the
  function directly; **expect the harness to refuse the `CREATE FUNCTION` statement and hand that
  one statement to the human**, as happened with `0013` steps 4–5.
- [x] 2.3 Declare the new table in `data-inventory.yml`: `id` and `attempted_at` as ⚙️,
  `source_hash` as **🟠** with purpose, legal basis and the 24-hour retention the function enforces
  (G-F1 — there is no silent default). Verify the file still parses and that every column of the new
  table appears.
- [x] 2.4 Add `recordJoinAttempt(sourceHash: string): Promise<boolean>` to
  `src/modules/identity/repository.ts`, calling `record_join_attempt` with the window and limit
  constants (15 minutes, 20) declared beside it with design Decision 3's reasoning. Verify
  `npx tsx scripts/lint/import-boundary.ts` passes — the raw client stays in this file.
- [x] 2.5 Add `joinAttemptSourceHash(ip: string | null)` beside `hashSessionToken` in
  `src/modules/identity/auth.ts`: HMAC-SHA256 over `join-attempt:${ip}` with
  `SESSION_TOKEN_HASH_SECRET`, and a single shared bucket when no IP is available — never a bypass
  (design Decision 3). Verify with a unit test in `tests/unit/identity/join-attempt-hash.test.ts`
  that a missing IP yields a stable non-empty key and that the digest differs from
  `hashSessionToken` of the same string.

## 3. Code normalisation (EC-2.15 / AC-2.24)

- [x] 3.1 Add `normalizeJoinCode(input: string): string` to `src/modules/identity/repository.ts` —
  upper-case, strip whitespace and `-`, re-insert the separator between the two groups of five.
  Never throws; a wrong-length input is normalised and simply matches nothing (design Decision 4).
- [x] 3.2 Apply it inside `resolveJoinCode` and the new `claimJoinCodeTx`, so both entry paths
  normalise and no call site can forget. Verify with
  `tests/unit/identity/join-code-normalisation.test.ts`: `" uampn qacvz "`, `"uampnqacvz"` and
  `"UAMPN-QACVZ"` all produce the same output, and no two distinct codes over `JOIN_CODE_ALPHABET`
  normalise to the same string.
- [x] 3.3 Extend `tests/integration/policy/join-code-validation.test.ts` with AC-2.24: a live link's
  code, presented lower-case with a space and without the hyphen, resolves to that link.

## 4. The claim, transaction-scoped

- [x] 4.1 Add `claimJoinCodeTx(tx, code)` to `src/modules/identity/repository.ts` beside
  `claimJoinCode`, executing `claim_join_code` on the caller's transaction and returning the same
  `JoinCodeResolution`. Give it the warning comment design Decision 2 describes — it performs no
  authorization **and that is correct**; the control is the route's attempt limit, so the next
  reader does not add a tautological assert. Note in the same comment that it is the second
  exported `*Tx` primitive after `issueJoinCodeTx`.
- [x] 4.2 Leave `claimJoinCode` in place for the three join-code tests (design Decision 2) and note
  in its comment that after this change nothing under `src/` calls it. Verify with
  `grep -rn "claimJoinCode(" src/` returning nothing.

## 5. The household's real name (FR-2.9 / AC-2.1)

- [x] 5.1 Change `registerHousehold(email, password, name)` in `src/modules/identity/auth.ts` —
  required, trimmed, non-empty — replacing the hardcoded `name: "WG"`, and add a
  `missing_name` value to `RegistrationErrorCode`.
- [x] 5.2 Make `src/app/(auth)/register/register-form.tsx` a **two-step form, one submit** (design
  Decision 6): step 1 is today's email and password unchanged; step 2 asks *„Wie soll dein Haushalt
  heißen?"* with the example `z. B. WG Hauptstraße 12` in the field. The step is revealed
  client-side — no second route, nothing persisted in between, the password submitted once. Going
  back to step 1 keeps what was typed. Verify by registering with the browser's network tab open:
  exactly one request carries the credentials.
- [x] 5.3 Handle the new code in `src/app/(auth)/register/actions.ts`'s exhaustive switch and add
  the heading, label, example and error strings to `src/ui/strings/de.ts`. Verify: no user-facing
  literal outside `de.ts`, and the switch still compiles exhaustively (a missed code is a compile
  error by construction).
- [x] 5.4 Update every caller — `tests/helpers/identity.ts` first, then any test constructing a
  household directly. Verify `npx tsc --noEmit` (or `npm run lint`) reports no remaining
  two-argument call.
- [x] 5.5 Add `tests/unit/identity/household-name-required.test.ts`: registering without a name is
  refused with the new code, a whitespace-only name is refused the same way, and a registered
  household carries the name that was given — never `"WG"` unless that is what was typed.

## 6. `remember_me` (FR-2.12 / EC-2.10 / AC-2.6)

- [x] 6.1 Extract the session-row insert out of `signIn` into a file-private `insertSessionTx` in
  `src/modules/identity/auth.ts`, taking `rememberMe` and deriving `expiresAt` (90 days or 12
  hours). `actingProfileId` is still set exactly once, here (G-D14).
- [x] 6.2 Give `signIn` a second parameter `options: { rememberMe?: boolean } = {}` defaulting to
  `true`, so registration and claim behave exactly as before. Verify the existing sign-in tests pass
  untouched.
- [x] 6.3 Give `setSessionCookie` in `src/modules/identity/session-cookie.ts` a `maxAge` argument so
  the cookie never outlives the row, and pass it from every caller.
- [x] 6.4 Add `tests/unit/identity/remember-me-session-lifetime.test.ts`: cleared gives a session row
  expiring in ~12 h with `rememberMe = false`; left selected gives ~90 days with `rememberMe = true`.
  The assertion is on the **row**, not the cookie — EC-2.10's whole point.

## 7. `joinHousehold` (FR-2.18 / FR-2.6 / FR-2.19 / EC-2.1)

- [x] 7.1 Register `membership.joined` in `PAYLOAD_ALLOWLIST` in
  `src/modules/audit/repository.ts` with an empty key list, commented per design Decision 8 (the
  code and the issuance both stay out of the payload). Verify an event written with any payload key
  throws `PayloadValidationError`.
- [x] 7.2 Write `joinHousehold` in `src/modules/identity/auth.ts` following design Decision 1's
  order exactly: resolve → validate → collision check → create Auth user → `signInWithPassword` →
  **one** transaction doing `claimJoinCodeTx`, `resident_profile` (`status: "active"`, `movedInOn`
  today), `account` (with the optional email or null), `membership` (`isResident: true`,
  `role: "member"`, `permissions: []` — design Decision 7, **no** `close_round`,
  `joinedViaIssuanceId` set), the audit event, and `insertSessionTx`. The resident profile's id is
  generated up front so `deriveResidentEmail` has something to derive from, as `registerHousehold`
  already does for `householdId`.
- [x] 7.3 The Auth user is created **at the derived address always**, never at the optional email —
  resident sign-in resolves display name → derived address, so a real address there would break it.
  Store the supplied email on `account.email` only. Comment this where the createUser call is.
- [x] 7.4 On any failure after the Auth user exists, delete it best-effort in a `try`/`catch` with no
  retry, matching `undoClaimResidentProfile`'s comment and reasoning. No other compensating undo is
  needed: everything else is inside the transaction (design Decision 1).
- [x] 7.5 Add a domain error type for the join path with a `code` discriminant — at minimum
  `invalid_link`, `name_taken`, `rate_limited`, `missing_fields`, `password_too_short`,
  `already_member`, `other_household` — following change 0's Decision 4 (a `code`, never a message,
  is what an action switches on). Verify the action's switch is exhaustive.

## 8. The route (FR-2.9 / FR-2.10 / FR-2.11 / EC-2.4 / EC-2.5 / EC-2.9 / G-A5)

- [x] 8.1 Create `src/app/(auth)/join/[code]/page.tsx` — `params` is a `Promise` in this Next version
  (see `src/app/(org)/rounds/[id]/page.tsx`). Read the session first (EC-2.4/EC-2.5, design Decision
  9), then rate-limit, then resolve; render either the household name with the form, or the single
  refusal with the ask-a-flatmate direction.
- [x] 8.2 Create `src/app/(auth)/join/[code]/actions.ts` as a `useActionState` reducer
  `(prevState, formData) => Promise<State>`: validate up front, `return { error }` for known codes,
  re-throw everything else, `redirect("/dashboard")` **outside** the `try`. The code arrives as a
  **hidden form field**, never a query parameter (G-A5, design Decision 10).
- [x] 8.3 Build the form: `Name *`, `Passwort *` with the enforced requirement visible in or beside
  the field (FR-2.10a — read the actual Auth minimum from the `flatmate-io-dev` settings, design's
  Open Question), `E-Mail (freiwillig)` with its one-line reason, and the pre-selected "stay signed
  in" checkbox. No passkey, no install prompt, no email *request* (FR-2.13/FR-2.14).
- [x] 8.4 Add every string to `src/ui/strings/de.ts` under a new `join` section — including the one
  invalid-link message with its ask-a-flatmate direction, the too-many-attempts message (distinct
  from it, proposal Assumption 3), the already-a-member note and the other-household refusal. §8.6
  fixes „Einladungslink"; the rest is new copy. Verify no literal is left in the `.tsx` or
  `actions.ts`.
- [x] 8.5 Render the already-a-member note on `src/app/(org)/dashboard/page.tsx` when the redirect
  carries it, so EC-2.4's *"taken to Start with a note"* is actually a note somebody reads. Keyed
  string, no literal.

## 9. O16 names who joined through each link (AC-2.26)

- [x] 9.1 Extend `listJoinCodeIssuances` in `src/modules/identity/repository.ts` to return each
  link's joiners' display names, joining `membership` on `joined_via_issuance_id` and
  `resident_profile` for the name. Keep the administration/moderator assertion exactly as it is.
- [x] 9.2 Render the names on each row in `src/app/(org)/members/page.tsx`, live and dead alike, with
  the label in `de.ts`. Verify a link nobody used names nobody rather than rendering an empty list
  header.

## 10. Tests — two-sided where RLS is involved (G-C7)

- [x] 10.1 `tests/integration/policy/join-by-link.test.ts` — the happy path end to end: two fields,
  empty email, an account + active profile + membership exist, `joinedViaIssuanceId` points at the
  link, the link's `uses` rose by exactly one, and one `membership.joined` event names the profile.
- [x] 10.2 `tests/integration/raw-sql/join-by-link-scoping.test.ts` — the same rows, read with the
  application role and RLS in force from another household's session context: nothing of the joined
  household's profile, account, membership or session is visible. This is the raw-SQL half G-C7
  requires for a path that writes four household-scoped tables.
- [x] 10.3 `tests/integration/policy/join-refusals.test.ts` — expired, used up, deleted and never
  existed produce **character-for-character identical** refusals (AC-2.7–AC-2.9, EC-2.7), and a link
  deleted between page load and submit is refused at submit (EC-2.9) with no account created.
- [x] 10.4 `tests/integration/policy/join-atomicity.test.ts` — two concurrent joins on a single-use
  link: exactly one membership exists, `uses` is 1, and the loser left no account, profile or
  sign-in-able Auth user behind. Then force a failure after the claim and assert `uses` is back to
  its pre-attempt value (design Decision 2).
- [x] 10.5 `tests/integration/policy/join-rate-limit.test.ts` — attempts past the limit from one
  source are refused; assert the refusal happened **without a link lookup** (AC-2.25), that codes
  from different households count against the same limit (EC-2.14), and that the message is not the
  invalid-link one.
- [x] 10.6 `tests/unit/identity/join-name-collision.test.ts` — AC-2.17 and EC-2.11: a taken name is
  refused inline, `" Jonas "` collides with `"Jonas"`, `"jonas"` does not.
- [x] 10.7 `tests/integration/policy/join-open-round.test.ts` — EC-2.2: joining while a round is open
  produces a `round_participation` row marked `joined_after_open` (the `drizzle/0010` trigger), and
  joining with no open round succeeds (EC-2.3).
- [x] 10.8 `tests/integration/policy/join-existing-member.test.ts` — EC-2.4 and EC-2.5: a session for
  this household creates no second identity and lands on Start with the note; a session for another
  household is refused with its own message, not the invalid-link one.
- [x] 10.9 `tests/unit/identity/join-code-never-in-query-or-log.test.ts` — G-A5/AC-2.18: the invite
  URL the members screen builds carries the code as a path segment and no query parameter, and a
  failed join writes no log line containing the code.
- [x] 10.10 **`join_attempt` cannot go in `cleanup()`'s CTE** — that CTE deletes by `household_id`
  and this table deliberately has none. So the rate-limit test owns its own teardown: delete its
  rows by `source_hash` in `afterEach` (never a `finally` inside the test — a timeout aborts before
  `finally` runs). Leave `tests/helpers/identity.ts` and the inline copy in
  `tests/unit/identity/register-session-setup-not-atomic.test.ts` alone for this table, and say why
  in a comment beside the new table in `schema.ts`, so the next person adding a table does not read
  the omission as the drift that has already happened twice.
- [x] 10.11 Confirm `test/guarded.manifest.json` is **byte-identical** to `main` — no G-D invariant
  closes here (`git diff --exit-code test/guarded.manifest.json`).

## 11. Gate

- [x] 11.1 Run `npm run verify` — eslint, the four guardrail lints, `tools/check-refs.ts`, and the
  full suite against `flatmate-io-dev`. A change is not archived on a red suite.
- [x] 11.2 Confirm every household-scoped dev table is back to zero rows after the suite —
  `join_code_issuance` included, the orphan check that caught change 1's two leftover rows. Check
  `join_attempt` separately: it is tenant-less, so zero there means task 10.10's own teardown ran,
  not that `cleanup()` reached it.
- [ ] 11.3 Walk it by hand once: issue a link on O16, open it in a clean browser profile, join with
  name and password only, confirm the landing, confirm a second use of a single-use link is refused
  with the ask-a-flatmate direction, and confirm the dead link still names who joined through it.

## 12. Bound join links, and the end of `/claim` (design Decision 13)

> Added 2026-09-22, after groups 1-11 were applied. This is the security half of the join path:
> until it lands, a household id plus a prepared display name is enough to become that person.

- [x] 12.1 `src/modules/identity/schema.ts` — `joinCodeIssuance` gains
  `residentProfileId: uuid("resident_profile_id")`, nullable. Comment it as the split between a
  neutral link (creates a profile) and a bound one (claims the named profile), citing design
  Decision 13. Verify the four `scripts/lint/` checks still pass.
- [x] 12.2 `docs/domain/identity.md` §2.1 — add the field to the `JoinCodeIssuance` table, German,
  in the style of the rows already there, noting that `null` is the ordinary link and a set value
  binds the link to one prepared profile. Record the decision and its date in
  `docs/review-log.md` §Offene-Punkte-Register — **citing nothing under `openspec/`** (handover
  gate). Verify `node tools/check-refs.ts`.
- [x] 12.3 `data-inventory.yml` — declare `resident_profile_id` on `join_code_issuance`. It points
  at a named person, so it is **🟠**, not ⚙️ like the rest of that table (G-F1).
- [x] 12.4 `drizzle/0015_join_code_issuance_bound_profile.sql` — add the column, then
  `CREATE OR REPLACE` both `resolve_join_code` and `claim_join_code` so each also returns the bound
  profile's id and display name. **Expect the harness to refuse both function statements** and hand
  them to the human, exactly as `0014` and `0013` did — do not rewrite them to get past it.
- [x] 12.5 `src/modules/identity/repository.ts` — `JoinCodeResolution` carries the bound profile
  (id + display name, or null). `issueJoinCode`/`issueJoinCodeTx` take an optional
  `residentProfileId`, and **verify the profile belongs to the issuing household and is
  `prepared`** before binding; a bound link is always issued with `maxUses: 1`.
- [x] 12.6 `src/modules/identity/auth.ts` — `joinHousehold` branches once on the binding. Bound:
  activate the named profile (`status: "active"`, `movedInOn` today) instead of inserting one; the
  display name comes from the profile, never from the form. Neutral: today's path unchanged.
  Everything after the branch — account, membership, audit, session — stays identical.
- [x] 12.7 `src/app/(auth)/join/[code]/` — a bound link greets by name and renders only the password
  field (plus the optional email and remember-me). Strings to `src/ui/strings/de.ts`. A neutral link
  is unchanged.
- [x] 12.8 `src/app/(org)/members/` — an action per prepared profile that issues an invitation for
  it and shows the resulting link, beside the existing controls. **Without this the feature is
  unreachable outside tests.** Administration/moderator parity, same as every other link control.
- [x] 12.9 Delete `src/app/(auth)/claim/` entirely and remove the „Noch keinen Zugang? Profil
  einrichten." helper text and its link from `src/app/(auth)/sign-in/sign-in-form.tsx` — a link to a
  deleted route is worse than no link. Remove the now-unused claim strings from `de.ts`.
- [x] 12.10 Fold `claimResidentProfile`'s logic into the bound branch and remove what is left
  unused (`findPreparedResidentProfile`, `undoClaimResidentProfile` if nothing calls them). Verify
  with `grep -rn "claimResidentProfile\|findPreparedResidentProfile" src/`.
- [x] 12.11 **Rewrite, do not delete** (G-G1): `tests/unit/identity/claim-resident-profile-validation.test.ts`,
  `tests/unit/identity/claim-session-setup-not-atomic.test.ts` and
  `tests/integration/policy/resident-claim-flow.test.ts` against the bound-link path. The behaviour
  they protect — a prepared profile becomes active and gains an account and membership, atomically —
  still exists; only the route to it changed.
- [x] 12.12 `tests/integration/policy/join-bound-link.test.ts` — a bound link claims the named
  profile and creates no second one; a neutral link still creates one; a spent bound link refuses
  with **the same message as any other spent link** (FR-2.8, proposal Assumption 0b); a link cannot
  name another household's profile; deleting an unredeemed bound link leaves its profile `prepared`.
- [x] 12.13 `tests/integration/policy/no-claim-without-link.test.ts` — the security claim stated
  outright: knowing a household id and a prepared display name, with no link, claims nothing. This
  is the test that would have failed before this group.
- [ ] 12.14 Re-run `npm run verify` and re-confirm the zero-row check. Then redo the hand walkthrough
  from group 11.3, plus: prepare a profile, issue its invitation, open it in a clean browser
  profile, confirm the greeting names the person, join with a password only.
  **Blocked on the human hand-off from 12.4**: `npm run verify` was run (2026-09-22) — lint/
  check-refs/guardrail scripts all green, 221/228 tests pass, the 7 failures are
  `join-bound-link.test.ts`, `no-claim-without-link.test.ts` (partially — 2 of 3 pass),
  `resident-claim-flow.test.ts` and `claim-session-setup-not-atomic.test.ts`, all failing with
  `Error: Display name is required` at `auth.ts`'s bound/neutral branch — because
  `resolve_join_code`/`claim_join_code` on `flatmate-io-dev` still return only the pre-0015 three
  columns (confirmed via `pg_get_function_result`), so `boundResidentProfile` is always `null`
  until a human applies drizzle/0015's two `CREATE OR REPLACE FUNCTION` statements. The zero-row
  check passed (only the demo household remains). The bound-link hand walkthrough cannot succeed
  until that migration step lands either, for the same reason.
