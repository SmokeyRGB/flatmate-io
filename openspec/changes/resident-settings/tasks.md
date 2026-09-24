# Tasks

Read `proposal.md`, `design.md` and the six delta specs first. Every test task names the
deliberate break that must make it fail. Report having seen each one fail, then restore the code.
Tests hit `flatmate-io-dev`. Pace full runs about 5 min apart (Supabase `/token` 429), and teardown
goes in `afterEach`.

## 1. Docs first (D10)

- [ ] 1.1 `docs/domain/identity.md` §2.1: amend the provider box ("Trägt eine Person später eine
      echte `email` nach …"). The real address **replaces** the derived identifier at the
      provider, `email_verified_at` stays the sole delivery authority, and a resident with an
      address may sign in with it. In the O-12 box, add the email sign-in sentence. In the O-16
      box, the reset is performed through a single-use link bound to the active profile, issued by
      the administration only while no `email` is set, with the same `ActivityEvent` and
      session-ending consequences. German, quotes verbatim, no reference into `openspec/`.
- [ ] 1.2 `docs/backlog/requirements/F2-requirements.md` EC-2.6: correct it to the K-18/O-16
      behaviour, marked *(corrected 2026-09-24)*, citing `review-log.md`.
- [ ] 1.3 `docs/review-log.md` §Offene-Punkte-Register: one entry for the human decisions of
      2026-09-24 (Auth switch plus email sign-in; the address cannot be removed; reset by link,
      household-account issuer only; EC-2.6 corrected). Follow the register's own format and
      rules.
- [ ] 1.4 `docs/SPEC-INDEX.md`: confirm rows exist for O-12 and O-16. Add a row only if the topic
      has none.
- [ ] 1.5 `data-inventory.yml` `account.email.purpose` per D9. Then run
      `node tools/check-refs.ts`, which must pass.

## 2. Schema and migration (D4, Migration Plan)

- [ ] 2.1 `src/modules/identity/schema.ts`: add the `joinCodePurpose` pgEnum (`join`,
      `password_reset`) and the `purpose` column (not null, default `join`) on `joinCodeIssuance`,
      with the `CHECK` from D4. Correct the `account.email` comment (D9).
- [ ] 2.2 `drizzle/0019_join_code_purpose.sql` (+ journal/snapshot via `drizzle-kit generate`,
      then hand-edit). All six steps from the Migration Plan, **re-runnable** (`DO … EXCEPTION
      WHEN duplicate_object`, `IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, `DROP FUNCTION IF
      EXISTS` for `resolve_join_code(text)`, `claim_join_code(text)` **and**
      `claim_join_code(text, join_code_purpose)`). The function bodies follow D4 exactly: every
      join carries a `household_id` predicate, `claim_join_code` filters on `p_purpose`, the
      `SET search_path = public`, and REVOKE/GRANT as in 0015. Carry 0015's explanatory comments
      forward and add the new ones. `npx tsx scripts/lint/migration-shape.ts` and
      `definer-coverage.ts` must pass.
- [ ] 2.3 Apply steps 1–3 (type, column, constraint) to `flatmate-io-dev` through the Supabase
      MCP. Verify with a query that `join_code_issuance.purpose` exists, that every row is `join`,
      and that the constraint exists.
- [ ] 2.4 **HUMAN HAND-OFF.** Stop. Tell the human to run the **whole** `drizzle/0019` file in the
      Supabase SQL editor for `flatmate-io-dev` (as `postgres`). The harness refuses
      `SECURITY DEFINER`. Wait for their confirmation.
- [ ] 2.5 After the hand-off, verify through `pg_proc`/`pg_get_function_result` that
      `claim_join_code` exists **exactly once**, with arguments `(text, join_code_purpose)`, and
      that `resolve_join_code(text)`'s result includes `purpose`. If either is not so, **stop and
      report**. Never infer "not yet applied".

## 3. Repository and link plumbing (D4, D6)

- [ ] 3.1 `src/modules/identity/repository.ts`:
      - `resolveJoinCode` returns `purpose`;
      - `claimJoinCode`/`claimJoinCodeTx` take a `purpose` argument and pass it to the SQL;
      - update both existing callers in `auth.ts` (`joinHousehold` passes `'join'`) and every test
        that calls them;
      - `JoinCodeResolution` gains `purpose`.
- [ ] 3.2 `issueJoinCodeTx` gains an internal `purpose` option. For `password_reset` it forces
      `maxUses = 1` and skips the `prepared` check (the caller has checked). Its warning comment
      gains the line from D6. `issueJoinCode`'s public options type stays without `purpose`.
- [ ] 3.3 New `issuePasswordResetLink(context, actingAccountId, residentProfileId)` per D6, with
      the new `ResidentProfileNotEligibleForResetError`. 7 days, single use.
- [ ] 3.4 `getResidentList` gains `hasEmail: boolean` (never the address).
      `listJoinCodeIssuances` returns `purpose`. New `getOwnAccountEmail(context)` (resident-only,
      own account, returns the address or null).
- [ ] 3.5 `src/modules/audit/repository.ts` `PAYLOAD_ALLOWLIST`: add the three event types from D9
      with `[]`. Update `tests/unit/audit/payload-allowlist.test.ts` if it enumerates types.
- [ ] 3.6 `tests/integration/policy/authorization-matrix.test.ts`: record decisions for
      `issuePasswordResetLink` (refuses a plain resident **and** a moderator) and
      `getOwnAccountEmail` (exempt with the stated reason: own account only). The matrix
      enumerates `identity/repository` and `casting/repository` exports, not `auth.ts`, so
      **every** new repository export needs a decision, including any session-revoke helper added
      for D5/D7 (self-service helpers are exempt with a stated reason). The `auth.ts` functions are
      covered by 6.2–6.4 instead.
- [ ] 3.7 In 6.2, add: a signed-in visitor redeeming a reset link has their previous session
      revoked (D8 pre-mortem fix). Break: skip the revoke (fails).

## 4. Auth functions (D1, D2, D3, D5, D7)

- [ ] 4.1 `src/modules/identity/auth.ts` `signIn` name path per D1: profile → membership
      (`resident_profile_id`) → `account_id` in the bootstrap context, then
      `auth.admin.getUserById`, then `signInWithPassword` with that email. Every failure stays
      `invalid_credentials`. Keep the existing membership `FOR UPDATE` block untouched.
- [ ] 4.2 `joinHousehold` per D3: **first**, right after `resolveJoinCode`, refuse
      `purpose !== 'join'` as `invalid_link` (pre-mortem fix: otherwise a reset link reaches the
      bound branch and fails at `createUser` with the wrong code). Then a supplied email goes to
      `createUser`. The provider's
      duplicate-email error becomes the new `JoinErrorCode` `email_taken`. Nothing else changes.
      Check that the bound branch still works with a supplied email.
- [ ] 4.3 New `changeResidentEmail(current, rawEmail)` per D2, with the new `AccountSettingsError`
      and codes `missing_email`, `invalid_email`, `email_taken`, `not_a_resident`.
- [ ] 4.4 New `changeResidentPassword(current, currentPassword, newPassword)` per D7, with codes
      `missing_fields`, `password_too_short`, `wrong_current_password`, `not_a_resident`.
- [ ] 4.5 New `redeemPasswordReset(code, { password }, { rememberMe })` per D5, including the lock
      order, the actor attribution and the Auth update inside the transaction. Returns the same
      result shape as `joinHousehold` so the action can set the cookie the same way.

## 5. Screens (D8)

- [ ] 5.1 `src/ui/strings/de.ts`: every new string (E1 sections, pitch, the EC-2.6 sentence, the
      error codes, the O16 row action and caution, the reset link label in the history, the A3
      reset shape, the sign-in hint). §8.6 vocabulary where it binds; no model terms (§12).
- [ ] 5.2 `src/app/(resident)/account/page.tsx` + `actions.ts` + client form components: E1 per D8.
      No typed value in action state. Keep `loading.tsx`. Handle the household-session fallback
      explicitly.
- [ ] 5.3 `src/app/(auth)/join/[code]/page.tsx` + `actions.ts` (+ form): the `reset` shape. The
      page switches on `purpose` **before** `bound`. Record the attempt on page load **and** in
      the reset action's submit, as the join action does. Before setting the new cookie, revoke
      the visitor's current session if one exists (`revokeSession`, own session only; D8). On
      success, set the cookie and redirect to `/dashboard` (outside the `try`). `joinHousehold`'s
      action maps `email_taken`.
- [ ] 5.4 `src/app/(org)/members/page.tsx` + `actions.ts`: „Passwort-Link erstellen" per D8 for
      household sessions on eligible rows. After issuing, reveal the link plus the caution. The
      link history labels reset links.
- [ ] 5.5 `src/app/(auth)/sign-in/sign-in-form.tsx`: the email-tab hint.
- [ ] 5.6 `openspec`-irrelevant cleanup: remove `de.account.placeholderBody` if it is now unused.

## 6. Tests

Name each file. Each must be seen failing against the break given.

- [ ] 6.1 `tests/integration/raw-sql/password-reset-link.test.ts` (G-C7, raw side; calls both
      functions by name). Seed through SQL:
      - (a) a reset link for an active profile without an email, which resolves with
        `purpose = 'password_reset'` and the display name;
      - (b) the same after `account.email` is set, which resolves to nothing;
      - (c) after the profile is set to `moved_out`, nothing;
      - (d) after `membership.revoked_at` is set, nothing;
      - (e) a **corrupt binding**, a reset link naming an active profile of **another** household,
        which resolves to nothing and cannot be claimed;
      - (f) a corrupt membership or account row whose `household_id` differs, which resolves to
        nothing;
      - (g) `claim_join_code(code, 'join')` on a reset link matches nothing and leaves `uses`
        unchanged, and `claim_join_code(joinCode, 'password_reset')` likewise;
      - (h) inserting a `password_reset` row with a null `resident_profile_id` violates the
        `CHECK`;
      - (i) the one-argument `claim_join_code(text)` no longer exists.

      Breaks: the functions are human-applied and the harness refuses `SECURITY DEFINER`, so you
      **cannot run** SQL-side breaks. Don't create scratch copies (a non-definer copy runs under
      RLS and proves nothing). Instead, for each predicate (the household predicate on the
      membership and account joins, `a.email IS NULL`, `p_purpose` in the `WHERE`), state which
      case (b/e/f/g) would fail without it and why. Opus judges the argument. The app-side breaks
      in 6.2–6.6 are run as usual.
- [ ] 6.2 `tests/integration/policy/password-reset-link.test.ts` (policy side):
      - issuing as the household account succeeds;
      - issuing as a moderator is refused with `ResidentListActionDeniedError` (assert the class);
      - issuing for a profile with an email is refused, as it is for a prepared profile and a
        moved-out one (assert the class);
      - redeeming sets the password: the new one signs in by name, the old one gets
        `invalid_credentials`;
      - every pre-existing session of the account has `revoked_at` set, and the new session does
        not;
      - `uses = 1`;
      - one `account.password_reset_by_admin` event, with `actor_account_id` = the issuer,
        `subject_id` = the profile and payload `{}`;
      - no new profile, account or membership rows;
      - a second redemption gives `invalid_link` (assert the code);
      - redeeming after the resident adds an email gives `invalid_link`;
      - `joinHousehold` with a reset code gives `invalid_link`, and `uses` is unchanged.

      Breaks: remove the session revocation (fails); remove the `FOR UPDATE` re-check of
      `email IS NULL` in D5 and add the email between resolve and claim (explain in the report if
      it cannot be made deterministic; label that sub-test an invariant guard, CLAUDE.md
      *A concurrent request*).
- [ ] 6.3 `tests/integration/policy/account-settings-email.test.ts`:
      - adding an address updates `account.email`, keeps `email_verified_at` null and makes the
        provider's email equal to it (read with `getUserById`);
      - email sign-in then acts as the profile (`acting_profile_id` = profile, not null; G-D14
        style);
      - name sign-in still works;
      - changing to a new address means the old address gets `invalid_credentials` and the new one
        works;
      - empty gives `missing_email` and malformed gives `invalid_email`, both with `account.email`
        unchanged;
      - the household account's address gives `email_taken`, with nothing changed on either side;
      - a household session gives `not_a_resident`;
      - one `account.email_changed` event per change, with payload `{}`;
      - an unchanged address writes no event.

      Breaks: skip `updateUserById` (the provider check fails); pass a caller-supplied account id
      (the test giving another profile's context must fail).
- [ ] 6.4 `tests/integration/policy/account-settings-password.test.ts`:
      - a wrong current password gives `wrong_current_password` and no session is revoked;
      - success means the new password signs in and the old one doesn't;
      - of three sessions, the current one is untouched and the other two have `revoked_at`;
      - one `account.password_changed` event with payload `{}`;
      - a too-short new password gives `password_too_short`.

      Break: revoke all sessions including the current one (fails).
- [ ] 6.5 `tests/integration/policy/sign-in-provider-address.test.ts` (D1): a resident who joined
      with an email **before** this change (simulate it: `account.email` set, provider on the
      derived address) still signs in by name. Break: `account.email ?? derived` (fails).
- [ ] 6.6 `tests/integration/policy/join-email-provider.test.ts` (D3):
      - a join with an email puts it at the provider, and email sign-in works;
      - a join with an address already in use gives `email_taken`, with no profile, account or
        membership rows, `uses` unchanged and no Auth user left behind.

      Break: keep the derived address in `createUser` (fails).
- [ ] 6.7 Unit tests for the email-shape check and normalisation
      (`tests/unit/identity/email-normalisation.test.ts`). Break: skip the lower-casing.
- [ ] 6.8 Update any existing test that asserts the one-argument claim, `JoinCodeResolution`'s
      shape, or `/account`'s placeholder copy. Replace, never delete (G-G1).
      `test/guarded.manifest.json` is untouched: no G-D entry closes here.
- [ ] 6.9 Cleanup: no new table, so `HOUSEHOLD_SCOPED_TABLES` is unchanged, but confirm
      `cleanup-inventory.test.ts` passes. Every test that creates Auth users removes them in
      `afterEach`.

## 7. Verify and hand back

- [ ] 7.1 `npx eslint . --ignore-pattern ".claude/**"`, then `npx next typegen && npx tsc
      --noEmit`, the six `scripts/lint/*.ts`, `node tools/check-refs.ts` and `npx vitest run`,
      all green. (Open with the human: a bare `npm run verify` trips on `.claude/worktrees/`.)
- [ ] 7.2 Row counts on `flatmate-io-dev` are back to baseline after the suite (the Demo-WG and the
      6 known orphan `application` rows are expected). Report the counts.
- [ ] 7.3 Stop. Report the diff summary, every break seen failing, and anything deviating from
      design. The browser walkthrough, `/code-review high`, archive and PR are Opus's and the
      human's.
