## 0. Human gates (before any apply)

- [x] 0.1 **Human decision** (2026-10-05: **outside G-B6; add one German clarifying sentence to G-B6** — task 7.8): confirm the G-B6 reading in `design.md` D6. The household sign-in
      code in localStorage is outside G-B6's scope and is not a second exception next to G-B7.
      Record the answer (and, if asked for, the exact German sentence for G-B6) in the
      `docs/review-log.md` row from task 7.6. If the answer is no, stop and run `/opsx:update` to
      drop `identity/device-memory` and D6 before anything else is built.
- [x] 0.2 **Human decision** (approved 2026-10-05): approve the German wording of the new
      `docs/06-Compliance-Anhang.md` §10.6 (drafted in task 7.4) before it is committed. Compliance
      text is binding for personal data (precedence 4).

## 1. Code shape helpers (no database)

- [x] 1.1 `src/modules/identity/repository.ts`: add `HOUSEHOLD_SIGN_IN_CODE_GROUP_LENGTH = 4`,
      `HOUSEHOLD_SIGN_IN_CODE_GROUPS = 3`, `normalizeHouseholdSignInCode(input)` (upper-case, strip
      whitespace and `-`, re-insert hyphens only at exactly 12 characters, never throws) and
      `isWellFormedHouseholdSignInCode(normalised)`, all built from the existing
      `JOIN_CODE_ALPHABET` (design D1). Export the SQL-equivalent pattern string as
      `HOUSEHOLD_SIGN_IN_CODE_PATTERN` so task 2.4 can compare against it.
- [x] 1.2 `tests/unit/identity/household-sign-in-code-shape.test.ts`: normalisation table (lower
      case, spaces, missing or extra hyphens, wrong length unchanged); well-formedness accepts
      `ABCD-EFGH-JKLM` and rejects a UUID, a join code `ABCDE-FGHJK`, `I`/`O`/`0`/`1`, and 11 or 13
      characters; a join code is never well-formed here and a sign-in code never passes
      `isWellFormedJoinCode`. **Deliberate break:** change the group length to 5. The applier
      reports seeing it fail.
- [x] 1.3 As each new export lands (tasks 1.1, 3.1, 4.2, 4.3, 6.1), add it to
      `tests/integration/policy/authorization-matrix.test.ts` with a stated reason, wherever the
      matrix inspects that file: `normalizeHouseholdSignInCode` and
      `isWellFormedHouseholdSignInCode` (pure helpers), `resolveHouseholdSignInCode` and
      `recordSignInAttempt` (pre-session bootstrap, like `resolveAccountHousehold` and
      `recordJoinAttempt`), `getHouseholdSignInCode` and `getSignInDeviceMemory` (own-household
      reads, tested in 6.4), `signInResidentByHouseholdCode` and `signInAttemptSourceHash` (as
      `signIn` and `joinAttemptSourceHash`). **Deliberate break:** leave one out and see the matrix
      fail.

## 2. Migration 0032 (agent-applied)

- [x] 2.1 `drizzle/0032_household_sign_in_code.sql` (generated with `drizzle-kit generate
      --custom`, then hand-written): the four steps of design D2 in that order, each re-runnable;
      the generator function with `SET search_path = public`, `REVOKE ALL … FROM PUBLIC, anon,
      authenticated` and `GRANT EXECUTE … TO app_runtime`; a header comment stating that the
      column default is the only generator. No `SECURITY DEFINER` in this file.
- [x] 2.2 `src/modules/identity/schema.ts`: `household.signInCode` as
      `text("sign_in_code").notNull().default(sql\`household_sign_in_code_generate()\`)`, plus the
      `CHECK` and the unique index `household_sign_in_code_key`. Regenerate `drizzle/meta/` so that
      `npx drizzle-kit generate` afterwards reports no changes.
- [x] 2.3 `data-inventory.yml`: `household.sign_in_code: { category: "⚙️", purpose: "identifiziert
      einen Haushalt bei der Anmeldung, keine Person (O-12) — nicht geheim (C-1.4)", legal_basis:
      "n/a — nicht personenbezogen" }`; widen `join_attempt.source_hash`'s purpose as in design
      D5. Run `npx tsx scripts/lint/data-inventory.ts`.
- [x] 2.4 Apply `0032` to `flatmate-io-dev` via the Supabase MCP `apply_migration`. Then query:
      `count(*)` of households, `count(DISTINCT sign_in_code)`, the count failing the pattern
      (must be 0), the count of `NULL` (must be 0), and that `household_sign_in_code_key` and the
      `CHECK` exist in `pg_indexes`/`pg_constraint`. **If any result differs, stop and report. Do
      not continue.**
- [x] 2.5 `tests/integration/schema/household-sign-in-code.test.ts`: (a) a household inserted by
      `registerHousehold` and one inserted by a raw insert naming no code both get a code that
      passes `isWellFormedHouseholdSignInCode`; (b) a raw `INSERT` with `sign_in_code = 'abc'` fails
      with the `CHECK` constraint's exact name; (c) a raw `INSERT` reusing another household's code
      fails with `household_sign_in_code_key` (single-refuser fixture: a well-formed code, so only
      the unique index can refuse); (d) a positive control: a fresh well-formed unused code inserts.
      **Deliberate breaks:** drop the default in a scratch copy of the statement for (a), and
      assert the wrong constraint name for (b) and (c). Each must fail.

## 3. Migration 0033 — the lookup (human-applied)

- [x] 3.1 `drizzle/0033_resolve_household_sign_in_code.sql`: exactly design D3's function, with
      `DROP FUNCTION IF EXISTS` first, and a header that says *"HUMAN HAND-OFF. Run this whole
      file in the Supabase SQL editor as postgres"*, why the caller never sees the result, and
      that the sign-in rate limit bounds password guesses, not the lookup's secrecy.
      `repository.ts`: `resolveHouseholdSignInCode(code)` calling it with
      `normalizeHouseholdSignInCode(code)`, returning `string | null`, commented as the fourth
      deliberate RLS bootstrap exception (next to `resolveAccountHousehold`, `resolveJoinCode` and
      `recordJoinAttempt`).
- [x] 3.2 **Human task**: run `0033` in the SQL editor on `flatmate-io-dev`. The applier then
      checks `pg_proc` for `resolve_household_sign_in_code`: `prosecdef = true`, `proconfig`
      contains `search_path=public`, and the ACL grants `EXECUTE` to `app_runtime` and to none of
      `PUBLIC`, `anon` or `authenticated`. **If it does not, stop and report; never assume it is
      merely not applied yet.**
- [x] 3.3 Add `resolve_household_sign_in_code` to `KNOWN_DEFINERS` in
      `tests/integration/schema/catalog-shape.test.ts`.
- [x] 3.4 `tests/integration/raw-sql/resolve-household-sign-in-code.test.ts` (as `app_runtime`,
      no session context): returns household A's id for A's code; returns `NULL` for an unknown
      well-formed code; returns `NULL` for a household with `deleted_at` set (seed the deleted
      household first, so the predicate is what refuses); and a direct
      `SELECT … FROM household WHERE sign_in_code = …` as `app_runtime` without context returns 0
      rows (RLS still closes the table). **Deliberate break:** remove `AND deleted_at IS NULL` in a
      scratch copy run through the test's own SQL and see the deleted-household case fail. Run
      `npx tsx scripts/lint/definer-coverage.ts`.

## 4. Sign-in by code (module)

- [x] 4.1 `src/app/request-ip.ts`: move `getClientIp` from
      `src/app/(auth)/join/[code]/request-ip.ts` unchanged except for the "route-local" sentence
      (design D5). Update the join actions' imports and
      `tests/unit/identity/join-attempt-trusted-ip.test.ts`'s import. Leave no copy behind.
- [x] 4.2 `src/modules/identity/auth.ts`: `signInAttemptSourceHash(ip, normalisedCode)` with the
      `sign-in-attempt:` prefix; `repository.ts`: `recordSignInAttempt(hash)` calling
      `record_join_attempt` with `SIGN_IN_ATTEMPT_WINDOW_SECONDS`/`SIGN_IN_ATTEMPT_LIMIT` (design
      D5).
- [x] 4.3 `src/modules/identity/auth.ts`: add `"rate_limited"` to `SignInErrorCode`; add
      `signInResidentByHouseholdCode(input, { rememberMe, sourceIp })` with the five steps of design
      D4 in that order. Keep `signIn`'s `kind: "resident"` path as is.
- [x] 4.4 `tests/unit/identity/sign-in-attempt-hash.test.ts`: the hash differs from
      `joinAttemptSourceHash` for the same IP, differs per code, and is stable for the same
      `(ip, code)` with `ip = null`. **Deliberate break:** drop the code from the key, and the
      per-code assertion fails.
- [x] 4.5 `tests/integration/policy/sign-in-household-code.test.ts` (random per-run households
      and `sourceIp`, because dev is shared; teardown in `afterEach`): (a) correct lower-case,
      unhyphenated code + name + password signs in as that profile; (b) unknown well-formed code
      with a name/password valid in another household → `invalid_credentials`, no session row;
      (c) deleted household's code → `invalid_credentials`; (d) UUID and join code →
      `invalid_household` (`join_attempt` is RLS-closed to `app_runtime`, so no row assertion); (e) `rememberMe: false` → session row `remember_me = false` and the 12 h
      `expires_at`, asserting every column `insertSessionTx` writes. **Deliberate breaks:** (b)
      with the `?? randomUUID()` fallback replaced by an early throw must fail the D11 sequence
      assertion of (f); (e) with `rememberMe` not threaded must fail.
- [x] 4.6 Same file, (f): extend the D11 request-sequence check from
      `tests/unit/identity/sign-in-enumeration.test.ts` (reuse its provider spy, don't fork it):
      an unknown code and a known code with an unknown name produce the identical provider request
      sequence.
- [x] 4.7 Same file, (g) rate limit, labelled **invariant guard** for the concurrent overshoot
      (design D5): fill code A's bucket for one `sourceIp` by calling `recordSignInAttempt(signInAttemptSourceHash(ip, codeA))` 20 times directly (20 real sign-ins would trip Supabase Auth's own per-IP limit on shared dev), then one `signInResidentByHouseholdCode` call → `rate_limited` and
      no provider call made; code B from the same source still proceeds; a join-route attempt from
      the same source is unaffected. **Deliberate break:** run the limit after the lookup and see
      "no provider call" fail.

## 5. Sign-in screen (A2)

- [x] 5.1 `src/app/(auth)/sign-in/actions.ts`: the resident name mode posts `householdCode` and
      calls `signInResidentByHouseholdCode` with `sourceIp: getClientIp(await headers())`; all
      three modes read `rememberMe` (`=== "on"`) and pass it; add the `rate_limited` case to the
      exhaustive switch.
- [x] 5.2 `src/app/(auth)/sign-in/sign-in-form.tsx`: rename the field to `householdCode` with the
      attributes of design D7; prefill it from `localStorage["flatmate.householdSignInCode"]` in a
      mount `useEffect` with try/catch, controlled afterwards; add the checkbox
      „Auf diesem Gerät angemeldet bleiben" (`defaultChecked`) to both tabs, reusing
      `de.account.rememberMeLabel`'s text through the join form's existing key. Keep `SubmitButton`.
      `loading.tsx` already exists and is unchanged.
- [x] 5.3 `src/ui/strings/de.ts`: `householdLabel` „WG-Kennung", `householdPlaceholder`
      „z. B. ABCD-EFGH-JKLM" (the old promise removed), `errors.signIn.invalidHousehold`
      „Diese WG-Kennung sieht ungültig aus.", new `errors.signIn.tooManyAttempts` (to wait, not that
      the credentials were wrong). Check against `openspec/specs/ui/vocabulary/spec.md`.
- [x] 5.4 The repo has no jsdom/Testing Library and this change adds no dependency. Put the storage logic in pure functions in `src/app/household-code-storage.ts`: `readStoredHouseholdCode(storage: Pick<Storage,"getItem"> | null)` and `syncHouseholdCodeMemory(storage, { code, rememberMe })`, each swallowing throws. The form and `HouseholdCodeMemory` only call them (the form inside its mount effect, never during render). `tests/unit/identity/household-code-storage.test.ts` (node env, fake storage objects): read returns the stored code; read with a throwing storage or `null` returns `null`; sync with `rememberMe: true` writes exactly one key; `false` removes it; a throwing storage never throws; a second sync with another code overwrites. **Deliberate breaks:** remove the try/catch in read; skip `removeItem`. Each must fail.

## 6. Device memory writer and showing the code

- [x] 6.1 `src/modules/identity/repository.ts`: `getHouseholdSignInCode(context)` and
      `getSignInDeviceMemory(current)` (design D6/D7), both RLS-scoped under the caller's own
      context.
- [x] 6.2 `src/app/(resident)/household-code-memory.tsx` (client) and `(resident)/layout.tsx`:
      render it in its own `<Suspense fallback={null}>` with a small async server wrapper that
      calls `getSignInDeviceMemory`. `useEffect`: `rememberMe ? setItem : removeItem`, with
      try/catch.
- [x] 6.3 `src/app/(resident)/account/page.tsx`: the „Deine WG" card (design D7);
      `src/app/(org)/settings/page.tsx`: the code line on O20. Strings in `de.ts`. Both pages
      already have `loading.tsx`. Extend their skeletons by one card only if the existing skeleton
      shape no longer matches.
- [x] 6.4 `tests/integration/policy/household-sign-in-code-visibility.test.ts`: through the
      repository, a session of household A reads A's code and never B's; `getSignInDeviceMemory`
      returns the session's own `remember_me`. As raw SQL as `app_runtime` under A's context,
      B's `household` row is invisible (G-C7 two-sided). **Deliberate break:** read the code by a
      caller-supplied household id instead of `context.householdId`, and see the "never B's"
      assertion fail.
- [x] 6.5 (Covered by 5.4's pure-function tests; `HouseholdCodeMemory` stays a thin `useEffect` around `syncHouseholdCodeMemory`. Mark done when 5.4 is.)

## 7. Docs (German where the file is German) and register

- [x] 7.1 `docs/domain/identity.md` §2.1: add the `sign_in_code` row to the `Household` table
      (⚙️, *„eindeutig, nicht geheim, nicht rotierbar in v0.1"*), and below the O-12 box a short
      note that *„der Haushalt"* is entered as this code or prefilled from the device. Cite C-1.4
      and P-1. Change nothing else in the box.
- [x] 7.2 `docs/screens/A-zugang.md` A2: field „Haushalt" is the WG-Kennung; checkbox
      „Auf diesem Gerät angemeldet bleiben", vorbelegt, on both sides; prefill from the device
      while the choice stands. Mark it *„Ergänzt 2026-10-05"* with the reason, in the file's style.
- [x] 7.3 `docs/screens/E-einstellungen.md` E1 and `docs/screens/O-organisation.md` O20: one
      bullet each for showing the code.
- [x] 7.4 `docs/06-Compliance-Anhang.md`: new §10.6 *„Haushaltskennung im Gerätespeicher"* with
      design D6's points in German, including the explicit sentence that `03-PRD.md` §6.5's
      *„Nur eine unbedingt erforderliche Sitzungs-Cookie"* still holds because this is not a cookie
      and not a workaround of it, plus the shared-device answer. Add it to the file's table of
      contents. **Human approval: task 0.2.**
- [x] 7.5 `docs/SPEC-INDEX.md` "Anmeldung und Sitzung": cite `06-Compliance-Anhang.md` §10.6 among
      the sources.
- [x] 7.6 `docs/review-log.md` §Offene-Punkte-Register: one closed row for the dead-end sign-in
      (decision 2026-10-05: WG-Kennung + opt-in Gerätespeicher, with task 0.1's G-B6 answer), and
      one **open** row for rate-limiting the two email sign-in paths and for setting
      `JOIN_ATTEMPT_TRUSTED_IP_HEADER` before production (proposal Assumption 4, design Risks).
      `docs/` must not point into `openspec/` (Rule 7): cite the decision date, not this change.
- [x] 7.8 `docs/GUARDRAILS.md` G-B6: one German sentence (human decision 2026-10-05, task 0.1) saying the WG-Kennung in local storage (`06-Compliance-Anhang.md` §10.6) is not application data in this rule's sense and not a second exception next to G-B7. Draft it, and report the exact sentence for the human to approve alongside 0.2.
- [x] 7.7 `node tools/check-refs.ts` and `node tools/check-refs.ts --scope docs`. Both must pass.

## 8. Verification

- [ ] 8.1 `npm run verify` passes (eslint, tsc, the eight guardrail lints, check-refs, vitest).
- [x] 8.2 (2026-10-05: done on localhost against dev. Register → O20 shows the code → founding link → join with box ticked → localStorage holds exactly the code, no script-readable cookie → E1 shows it → sign out → A2 resident tab prefilled. Box cleared + wrong password: box came back ticked — React 19 form reset rewrites even a controlled checkbox; fixed with the join form's `draft` pattern in `sign-in-form.tsx`, re-walked: box stays cleared, code and name kept, correct password → 12 h session, localStorage empty.) Browser walkthrough via the preview tools (the human signs in inside the pane where a
      password is needed): join by link with the checkbox ticked → `/account` shows the code →
      sign out → the A2 resident tab is prefilled → sign in by name. Then clear the checkbox on
      sign-in → reach the frame → `localStorage` no longer holds the key. Check
      `document.cookie`/the cookie list: the session cookie only. Screenshot both states.
- [ ] 8.3 Update the plan file's Status section, and the `openspec/specs/` deltas are synced at
      archive. `/code-review high` before `gh pr create`.
