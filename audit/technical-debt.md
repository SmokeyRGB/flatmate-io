# Flatmate.io: technical-debt audit

Miro board, exercise 16 · audited 2026-10-01 on `main` @ `3401c94` · read-only audit, no code changed

## Scope and method

The audit covered the whole implementation:

- `src/modules/identity`
- `src/modules/casting`
- `src/modules/audit`
- `src/db`
- `src/app` and `src/ui`
- `drizzle/*.sql`
- `scripts/lint`, `tools/`, `tests/` infrastructure and CI

It did not cover `docs/` or `prototype/`.

Sonnet 5.5 subagents did the token-heavy reading, one per area plus one that inventoried every role check. The main session then re-checked the claims that decide the ranking: by reading the code, and for the grant and RLS findings with read-only catalog queries against `flatmate-io-dev`. Nothing was written to any database.

Each finding answers two questions. **Where is the code hard to understand? Where are responsibilities mixed?** The lens is maintainability, safer behaviour, production thinking, engineering judgment and incremental improvement, measured against SOLID, KISS, YAGNI and DRY.

### Legend

| Mark | Meaning |
|---|---|
| **V** | Verified in this session against code or the dev catalog |
| **A** | Agent-reported with file:line evidence, not independently re-checked |
| ✅ Covered | Characterization tests already pin the behaviour to refactor, so the refactor can start now |
| ◐ Partial | Some branches are pinned. Write the listed missing tests **first** |
| ❌ Not covered | Step 0 is a characterization test, seen failing against a deliberate break (`.claude/rules/implementation-hazards.md`, "Tests that can fail") |

### Ground rule: refactor versus fix

This audit follows the rule that **only code covered by characterization tests is refactored**. A refactor must not change observable behaviour, and `npm run verify` must be green before and after.

Some findings are **behaviour changes**, not refactors: #1, #2, #3, #4 and #5. Characterization tests cannot protect those, because the current behaviour is the defect. For them:

1. Pin everything that must *not* change (the allowed paths).
2. Add a test for the intended new behaviour and see it fail.
3. Then fix.

Each such finding is labelled **Fix (behaviour change)**.

---

## Ranking at a glance

| # | Severity | Finding | Area | Kind | Coverage | Verified |
|---|---|---|---|---|---|---|
| 1 | 🔴 **Critical (v0.1 blocker)** | Two authorization models: role checks next to stored permissions | identity, members UI | Fix | ◐ | V |
| 2 | 🔴 **Critical (v0.1 blocker)** | `anon`/`authenticated` can EXECUTE every `SECURITY DEFINER` function and hold full DML on all tables | drizzle, bootstrap | Fix | ❌ | V |
| 3 | 🟠 **High** | Procedure-lock race: settings change vs `openRound` snapshot | casting | Fix | ❌ | V |
| 4 | 🟠 High | Room mutators and `addResidentToRound`: no household predicate, id validation or lock | casting | Fix | ◐ | A |
| 5 | 🟠 High | F1 mutators take a caller-supplied `Actor`; permission checked outside the write transaction | casting | Fix + refactor | ◐ | A |
| 6 | 🟠 High | Credential flows are 170–305-line hand-rolled state machines | identity/auth.ts | Refactor | ◐ | V |
| 7 | 🟠 High | Security invariants enforced by copy-paste (lock preamble, `createUser` compensation) | identity/auth.ts | Refactor | ✅ / ◐ | V |
| 8 | 🟠 High | `guarded-tests` lint does not strip comments on CRLF checkouts, so a disabled G-D test can pass | scripts/lint | Fix | ❌ | V |
| 9 | 🟠 High | Production-ref guard is a duplicated denylist, not an allowlist | tests/setup, seed | Fix | ❌ | A |
| 10 | 🟠 High | `(org)` has no error boundary; routine failures in actions crash with a 500 | src/app | Fix + refactor | ❌ | V |
| 11 | 🟠 High | Unsafe exports guarded only by comments (`issueJoinCodeTx`, `claimResidentProfile`, `forceChangeSettingWhileRoundOpen`) | identity, casting | Refactor | ◐ | V |
| 12 | 🟠 High | God files: `auth.ts` (2,377 lines), `identity/repository.ts` (1,503), `casting/repository.ts` (1,293) | modules | Refactor | ✅ | V |
| 13 | 🟡 Medium | Module boundary leak: casting queries identity tables; the import-boundary lint misses dynamic imports | casting, lint | Refactor | ❌ | V/A |
| 14 | 🟡 Medium | Audit log: actor not bound to the session; post-retention UPDATE is column-unrestricted | audit | Fix | ◐ | A |
| 15 | 🟡 Medium | DB client: no fail-fast, pool bounds, `statement_timeout` or `lock_timeout` | src/db | Fix | ❌ | A |
| 16 | 🟡 Medium | Wide error unions and copy-pasted code→message switches in actions | identity, src/app | Refactor | ◐ | V |
| 17 | 🟡 Medium | `updateSettingsAction` swallows every error into one message, contradicting FR-1.21 | src/app | Fix | ❌ | A |
| 18 | 🟡 Medium | Provider-error classification split across two files, with an ordering rule kept only in comments | identity | Refactor | ✅ | A |
| 19 | 🟡 Medium | Ad-hoc `console.error` logging on incident paths | identity, src/app | Refactor | ❌ | V |
| 20 | 🟡 Medium | `members/page.tsx` mixes data shaping, formatting and rendering; date formatting has no time zone | src/app | Refactor + fix | ❌ | A |
| 21 | 🟡 Medium | `capture-form.tsx` serves two modes and has a test-only prop | src/app | Refactor | ✅ | A |
| 22 | 🟡 Medium | 7 file walkers and 6 comment strippers copy-pasted across the lints | scripts/lint | Refactor | ◐ | A |
| 23 | 🟡 Medium | `tests/helpers/identity.ts` mixes six jobs; fixtures copied across tests | tests | Refactor | ◐ | A |
| 24 | 🟡 Medium | CI hardening: no `permissions:`, actions not pinned by SHA, no `engines` | .github | Fix | ❌ | A |
| 25 | 🟡 Medium | No live-catalog check for policies, FORCE RLS, triggers or grants | tests/schema | Fix | ❌ | V |
| 26 | 🟡 Medium | Some casting reads rely on RLS alone (no household predicate, no `isUuid`) | casting | Fix | ◐ | A |
| 27–39 | 🟢 Low | Comments used as a changelog, DRY leftovers, inconsistent error contracts, YAGNI stubs and others (see the Low section) | various | Refactor | mixed | mixed |

---

## 🔴 Top 3

### 1. Two authorization models: role checks next to stored permissions · Critical, v0.1 blocker

**Why critical.** The human decision (2026-09-28) is that `membership.permissions` is the **only** rights mechanism, and that "household", "moderator" and "resident" are just names for stored permission sets. Identity was built before that decision and still decides 20+ authorization and visibility questions by reading `membership.role`. This is a design misunderstanding carried from F1 to F4, not a code smell.

Two models now coexist. A permission granted or revoked in storage is honoured by `assertHasPermission` and silently ignored by every role check. The repository's own comment calls permissions "the ONE rights mechanism" (`identity/repository.ts` ~399).

**Where (V; full inventory in the Appendix).**

- The two central gates are `assertIsAdministrationOrModerator` (`identity/repository.ts:738`) and `assertIsAdministration` (`:749`). They feed:
  - profile status change, `removeMember`, `setMovedOut`, `reactivateMember`
  - all four join-link operations
  - `createResidentProfile`, `issuePasswordResetLink`, `setMemberRole`, `triggerSubjectAccessExport`
- Inline role reads:
  - `getNavigationAccess` (`:601–608`)
  - `getResidentList` (`:685–686`)
  - the `listJoinCodeIssuances` reset filter (`:1344`)
  - the `setMemberRole` target check (`:1417`)
- UI: `members/page.tsx:211, 337, 363, 370, 390, 414` branch on `isAdmin` / `m.role`, and `settings/page.tsx:35` gates on `assertIsAdministration`.
- Casting, the RLS policies and the `SECURITY DEFINER` functions are **clean**: none of them read `role`.

**Defects found along the way.**

- **`getResidentList` has no `accountId === context.accountId` check** (V, `:680–686`), unlike every `assert*`. `resident-list-access.test.ts:59,70` even depends on passing a foreign `accountId`. This is the PR #19 hole again.
- `manage_members` exists only in `docs/domain/identity.md`. No stored set, migration or code contains it.
- Change 2b's plan section uses the wrong constant name (`HOUSEHOLD_ADMIN_PERMISSIONS`; the real one is `HOUSEHOLD_PERMISSIONS`). It also misses four sites: `triggerSubjectAccessExport`, the `setMemberRole` target check, the settings-page gate and the members-page UI.
- There are two error classes for "denied": `PermissionDeniedError` and `ResidentListActionDeniedError`. Pages and tests catch one or the other.

**Suggested change (Fix, behaviour change). Promote F3 change 2b `role-permissions` ahead of change 4.**

1. **Characterization first (❌ gaps today).** Add tests for:
   - a moderator refused by `createResidentProfile`, `setMemberRole`, `triggerSubjectAccessExport` and the settings page
   - moderator allowed for `removeMember` and `reactivateMember`
   - the `setMemberRole` no-op
   - `getResidentList` with a mismatched `accountId`, which must be refused (fix the two tests that rely on it)
   - a render test of the members page's capability flags

   The authorization matrix only refuses plain residents today. Extend it with a **moderator column** and an **individually-granted member** column, the case the refactor changes.
2. Introduce named permissions: `manage_members` (household + moderator sets) and household-only `create_resident_profile`, `issue_password_reset_link`, `appoint_moderator`, `trigger_subject_access_export`. Add them to `HOUSEHOLD_PERMISSIONS` / `MODERATOR_PERMISSIONS`, plus a "never grantable to moderator" list alongside `MODERATOR_ONLY_PERMISSIONS`.
3. Write one re-runnable migration that takes the LOCK, checks the precondition, backfills, and widens 0024's CHECKs. The household CHECK is two-sided (`@>` and `<@`, `schema.ts:330`), so widen both sides. Copy 0027's shape.
4. Switch each gate to `assertHasPermission`, one function per commit. Use one error class.
5. Make `getResidentList` and `getNavigationAccess` return **capability flags** (`canCreateProfile`, `canAppointModerator`, …) instead of `isAdmin`. The members page renders from those flags only.
6. Add a lint (an extension of `scripts/lint/`) that fails on `\.role\s*[!=]==` or `eq(membership.role` outside writes and CHECKs, so this cannot regress.
7. Amend `docs/domain/identity.md` §2.1 ("hängen an der Rolle") and the review-log in the same change.

**Coverage: ◐.** The refusal of a plain resident is covered for every gate (`authorization-matrix.test.ts`, `join-code-isolation.test.ts`, `password-reset-link.test.ts`, `navigation-access.test.ts`, `member-role-appointment.test.ts`). Moderator-side refusals and every UI branch are not.

---

### 2. `anon`/`authenticated` can execute every `SECURITY DEFINER` function · Critical, v0.1 blocker

**Evidence (V, `flatmate-io-dev` catalog, read-only queries).**

- `has_function_privilege('anon' | 'authenticated', …, 'EXECUTE')` is **true** for:
  - `claim_join_code(p_code, p_purpose)`
  - `resolve_join_code(p_code)`
  - `record_join_attempt(p_source_hash, p_window_seconds, p_limit)`
  - `resolve_account_household(p_account_id)`
  - `casting_round_keeps_applications` and `rls_auto_enable`
- `has_table_privilege('anon', …)` is **true for SELECT, INSERT, UPDATE and DELETE on all 14 public tables**.
- RLS is enabled on every table, but `FORCE ROW LEVEL SECURITY` is set only on `activity_event`.
- The migrations `REVOKE … FROM PUBLIC` and `GRANT … TO app_runtime`. Supabase's default privileges grant `anon` and `authenticated` explicitly, so the PUBLIC revoke does not remove them. No migration and no bootstrap statement names `anon` or `authenticated` (V, grep).
- The app never uses PostgREST or the anon key. `src/` has no reference to `ANON_KEY`, so the whole exposure serves no purpose.

**Risk.** The anon key of a Supabase project is not a secret. Anyone who holds it can reach these functions through `/rest/v1/rpc/…`, provided the Data API exposes `public`, which is Supabase's default. This was not probed over HTTP.

- **`record_join_attempt` takes caller-chosen `p_window_seconds` and `p_limit`.** An anonymous caller can insert unlimited rows into `join_attempt` (a storage/DoS vector) and poison or lock out any source hash they know.
- **`claim_join_code` lets someone holding a link burn its uses** without completing a join.
- **`resolve_account_household` maps account ids to household ids** for anyone.

Tables stay protected **only** by RLS policies that read `app.*` settings, which a REST caller cannot set. That is a single layer where the design assumed two.

**Suggested change (Fix).**

1. **Characterization first (❌).** Add `tests/integration/schema/role-grants.test.ts`. It asserts against the catalog that `anon` and `authenticated` have **no** EXECUTE on any `prosecdef` function in `public`, and **no** table privilege on any `public` table. It fails today against dev and against CI's runner stack, which is the "seen failing" step.
2. Add a re-runnable migration:
   - `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;`
   - `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;`
   - matching `ALTER DEFAULT PRIVILEGES … REVOKE`, so future objects start closed

   A human applies it, per the harness rule on privilege DDL.
3. Optionally remove `public` from the Data API's exposed schemas in the Supabase dashboard (dev, then prod at go-live). The app does not need it.
4. Extend `definer-coverage.ts` so a new `SECURITY DEFINER` function must also be covered by the grants test.
5. Production is paused at 0012 but already has `resolve_account_household` (0005). Include it in the go-live checklist.

**Coverage: ❌.** No test or lint mentions `anon`, `authenticated` or grants. `definer-coverage.ts` checks only `search_path` and that a raw-sql test calls the function.

---

### 3. Procedure-lock race: settings change vs `openRound` snapshot · High

**Evidence (V).**

- `openRoundTx` locks the round row `FOR UPDATE` (`casting/repository.ts:732`) but reads `householdSettings` with no lock (`:774–777`).
- `updateHouseholdSettingsWithProcedureLock` (`:979`) checks for an open round with a plain `SELECT` (`:992–995`), then updates the settings (`:1012`), and never locks the round or the settings row.
- Its permission check (`assertHasPermission`, `:989`) runs in a separate transaction before `withSessionContext` opens.

**Risk.** Suppose a settings commit lands between `openRound`'s settings read and its commit. The opened round then carries a frozen snapshot that differs from the live settings, which I-7 (procedure lock during an open round) forbids. Quorum or weights then change under an open round with no notice.

This is the "every writer of the same state, pairwise" hazard. The procedure lock is checked where settings change but not serialized against where rounds open.

**Suggested change (Fix).**

1. **Characterization first (❌).** Write a deterministic concurrency test in the pattern of `revoked-membership-sign-in.test.ts`:
   1. Hold an uncommitted `openRound` transaction after its settings read.
   2. Run the settings update in parallel.
   3. Assert it is refused (`ProcedureLockedError`) or waits.

   It must fail today.
2. Use one lock order for both writers: **settings row first**. `openRoundTx` takes `FOR SHARE` on `household_settings`, and the settings writer takes `FOR UPDATE` on it before checking for an open round.
3. Move the permission check inside the transaction (`assertHasPermissionTx`), as the application functions already do.

**Coverage: ❌.** `procedure-lock.test.ts` is sequential only: refused while open, allowed once closed.

---

## 🟠 High

### 4. Room mutators and `addResidentToRound`: no household predicate, validation or lock · A · Fix

- **Where.** `casting/repository.ts:558–660` (`renameRoom`, `transitionRoomStatus`, `removeRoom`) and `:853–903` (`addResidentToRound`, `insertDraftRoundTx`).
- **Problem.**
  - These filter only by `room.id`, so isolation rests on RLS alone. The application functions add `eq(householdId)` explicitly.
  - A non-UUID id reaches the `::uuid` cast and throws a raw database error.
  - `removeRoom` reads "is the room in an open round?" without a lock, so a concurrent `openRound` can cover the room between that check and the delete (EC-1.6).
  - `addResidentToRound` never checks that the round exists, that it is open, or that the profile belongs to the household. With no foreign keys, a foreign or orphan `round_participation` row would inflate the quorum denominator.
- **Change.**
  - Add the household predicate and an `isUuid` guard to these functions.
  - Lock the room row `FOR UPDATE` in `removeRoom`, and lock it in the same order in `openRound`.
  - In `addResidentToRound`, validate the round (exists, open, same household) and the profile (same household, live resident).
- **Coverage: ◐.** `room-household-scoping.test.ts` and `room-independence.test.ts` pin the sequential cases. Pin first: a malformed id, a cross-household id passed to each mutator, the `removeRoom`/`openRound` race, and `addResidentToRound` given a missing round, a closed round or a foreign profile.

### 5. F1 mutators take a caller-supplied `Actor`; permission checked outside the transaction · A · Fix + refactor

- **Where.** `casting/repository.ts:29–32`, 533–660, 698–702, 820–903, 979–1061. `Actor` is declared twice (here and `identity/repository.ts:29`).
- **Problem.**
  - `actor.profileId` is written into audit events but never validated against `context`. `assertHasPermission` only compares `accountId`.
  - The permission is read in its own transaction before the write, so a revocation can commit in between (TOCTOU).
  - The newer application functions already derive the actor from `context`, so two styles coexist.
- **Change.** Derive both ids from `context`. Make `actor` optional, then remove it. Switch to `assertHasPermissionTx` inside the write transaction, one function per commit.
- **Coverage: ◐.** The refusal path is covered (`room-round-authorization.test.ts`, the matrix). Pin first: the `actorProfileId` of the audit row, and a mismatched `actor.profileId`.

### 6. Credential flows are hand-rolled state machines · V · Refactor

- **Where.** `identity/auth.ts`:
  - `changeResidentEmail` `:1353` (174 lines)
  - `changeResidentPassword` `:1640` (282 lines)
  - `redeemPasswordReset` `:2073` (305 lines)
  - `joinHousehold` `:850` (256 lines)
  - `signIn` `:553` (203 lines)
- **Problem.**
  - One body does validation, locking, the provider call, outcome classification, the audit write, commit-failure repair and error mapping.
  - State crosses `try`/`catch` through mutable flags (`providerOutcome`, `needsCommitFailureRepair`, `phase3CheckOutcome`, …).
  - The pattern "provider write → read back if unknown → repair" is implemented three times.
  - `data.session!` non-null assertions remain after the guard (`:746`, `:1087`).
- **Change.** Extract named helpers one at a time without changing behaviour: `repairEmailAfterCommitFailure`, `resolveSignInEmail`, `validateJoinInput`, `writeJoinRowsTx`. Replace the `!` with a narrowed local.
- **Coverage: ◐.** `account-settings-email/password`, `password-reset-link` and `provider-deadline-*` pin the main and unknown-outcome branches. The commit-failure (`change_incomplete`) branches are "argued, not executed" by the tests' own admission (`account-settings-email.test.ts` ~201–215). Pin those with a forced commit failure before touching the repair code, or leave the repair branches untouched in the first pass.

### 7. Security invariants enforced by copy-paste · V · Refactor

- **Where.**
  - The lock preamble (membership → account → session `FOR UPDATE`, then the revoked and expiry checks) in `auth.ts:1387–1411`, `1695–1722`, plus variants at 1846, 2113, 2201, 2304.
  - The `createUser` and compensation block in `registerHousehold` (`:160`), `claimResidentProfile` (`:369`) and `joinHousehold` (`:952`).
  - Profile activation and the membership insert, duplicated (`:396–424` vs `1026–1068`).
- **Problem.** A fix lands in one copy. The copies have already drifted: only `joinHousehold` handles "email already taken". The lock order exists only in comments.
- **Change.** Extract `lockLiveResidentSessionTx(tx, ctx)`, `revokeLiveSessionsTx(tx, accountId, exceptId?)`, `createAuthUserOrCompensate(params)`, `activatePreparedProfileTx` and `insertResidentMembershipTx`. Migrate one caller per commit.
- **Coverage.** ✅ for the compensation block (`provider-user-compensation.test.ts`, `provider-deadline-create-user.test.ts`, `join-atomicity.test.ts`). ◐ for the lock preamble: behaviour is pinned (`revoked-membership-sign-in`, `password-reset-link` held-lock races, `provider-deadline-lock-release`), but lock **order** is not asserted. Add an order assertion before extracting, for example a held-lock test per step.

### 8. `guarded-tests` lint does not strip comments on CRLF checkouts · V · Fix

- **Where.** `scripts/lint/guarded-tests.ts:48–51`: `content.split("\n").map(l => l.replace(/\/\/.*$/, ""))`.
- **Problem.**
  - The working tree is `w/crlf` (V, `git ls-files --eol`), and `.gitattributes` does not pin `.ts` to LF.
  - Each line therefore ends in `\r`, so `$` without the `m` flag never matches and nothing is stripped.
  - A fully commented-out G-D test still reads as present on the author's machine. A prose `.skip(` comment gives a false failure. CI (LF) behaves differently.
- **Change.**
  - Split on `/\r?\n/`, or use the shared newline-preserving stripper from #22.
  - Also detect `.skipIf(`, `.todo(` and `xit`.
  - Consider `*.ts text eol=lf` in `.gitattributes`.
- **Coverage: ❌.** The lint's tests use LF fixtures only. Add a CRLF fixture with a commented-out `it(` and see it fail.

### 9. Production-ref guard is a duplicated denylist · A · Fix

- **Where.** `tests/setup.ts:19–33`, `scripts/seed-demo-household.ts:42–53`, `.github/workflows/ci.yml:205–212`.
- **Problem.**
  - The production ref is a string literal in two TypeScript files.
  - The guard checks only `DATABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` via `includes`. It skips silently when a variable is unset, and ignores `SUPABASE_SERVICE_ROLE_KEY`, whose JWT carries the ref.
  - Any new project (staging, a recreated prod) passes.
  - CI's drift step already does the safe thing: it **allowlists** the dev ref.
- **Risk.** Irreversible append-only `activity_event` rows in a database nothing can clean, which is the incident `setup.ts`'s own comment records.
- **Change.** Add one `env-guard.ts` with an allowlist (an env var defaulting to the dev ref). It also decodes the service-key JWT's `ref` and requires the variables to be set. Call it from `setup.ts` and the seed.
- **Coverage: ❌.** Pin a unit test with fake env values first.

### 10. `(org)` has no error boundary; routine failures crash · V · Fix + refactor

- **Where.**
  - `src/app/(org)/` has no `error.tsx`, and there is no `global-error.tsx` (V).
  - `members/actions.ts` repeats `throw new Error("Not signed in")` 10 times (V), and about 15 times across `rooms`, `settings`, `rounds/new` and `account`.
  - Several actions call the repository with no `try`/`catch`: `setMovedOutAction`, `setMemberRoleAction`, `extendJoinCodeAction`, `renameRoomAction`, `removeRoomAction`.
- **Problem.** An expired session or a concurrent change shows a raw 500 page. Capture and edit already redirect to `/sign-in`, so behaviour is inconsistent.
- **Change.** Add one `requireSession()` helper that redirects, and an `(org)/error.tsx` modelled on `(resident)/error.tsx`. The happy path is unchanged.
- **Coverage: ❌.** There are no tests for the members, rooms, settings or account actions. Pin per action: no cookie leads to a redirect, and a `PermissionDeniedError` leads to the defined state.

### 11. Unsafe exports guarded only by comments · V · Refactor

- **Where.**
  - `issueJoinCodeTx` (`identity/repository.ts:1051`): a 37-line "THIS FUNCTION PERFORMS NO AUTHORIZATION" comment; its only caller is `registerHousehold`.
  - `claimResidentProfile` (`auth.ts:350`): creates an account with no credential check, and is kept only for test fixtures.
  - `forceChangeSettingWhileRoundOpen` (`casting/repository.ts:1034`): test-only, and spreads an unvalidated `field` into `.set({ [field]: value })`.
- **Problem.** A comment is not a control. One import from a server action bypasses G-C.
- **Change.**
  - Move the test-only functions into `tests/helpers`.
  - Make `issueJoinCodeTx` module-private (call it through a named `issueFoundingJoinCodeTx` used by `auth.ts`).
  - Add the same "no caller outside the module" assertion the matrix already has for `insertCapturedApplicationTx` (`authorization-matrix.test.ts:196`).
- **Coverage: ◐.** The behaviour is pinned through `registerHousehold` and the procedure-lock tests. Add the no-external-caller assertion first; today it is ❌ for `issueJoinCodeTx` (it is only listed in NOT_APPLICABLE at matrix:152).

### 12. God files · V · Refactor (the safest large step)

- **Where.** These sizes are V, line counts:
  - `auth.ts` has 2,377 lines, ~49% comments in its second half, and at least 7 responsibilities.
  - `identity/repository.ts` has 1,503 lines and ~38 exported functions: profiles, join-code crypto, permission asserts, resident list, sessions.
  - `casting/repository.ts` has 1,293 lines: applications, rooms, rounds, settings and the Start read model.
- **Change.** Do pure moves, re-exported from the old path so imports and the authorization matrix stay valid. Move one thing at a time and run `npm run verify` after each:
  - `identity/join-code.ts` (the pure helpers), `identity/permissions.ts`, `identity/account-settings.ts`, `identity/errors.ts`
  - `casting/application-repository.ts`, `round-repository.ts`, `room-repository.ts`, `start-overview.ts`

  This makes #6, #7 and #1 much easier to review.
- **Coverage: ✅.** The matrix fails when an export loses its recorded decision, and the per-function tests cover the behaviour. Snapshot the export list first, for example with a test asserting `Object.keys(module)`.

---

## 🟡 Medium

### 13. Module boundary leak, and an import-boundary lint that claims more than it enforces · V/A · Refactor

- **Where and problem.**
  - `casting/repository.ts:12` imports `householdSettings`, `membership` and `residentProfile` straight from `@/modules/identity/schema` and queries them itself (V).
  - `audit/repository.ts:14` imports the identity enums (V), while identity imports audit to write events, which risks a dependency cycle.
  - A membership lock-order contract lives in a casting comment (~205) that identity cannot see.
  - `import-boundary.ts` (A) only matches single-line static `from "…"`. It misses `import()` and `require()`, and allows any file named `repository.ts` anywhere under `src/`.
  - dependency-cruiser (G-I1, MINIMAL-GATE row 8) is a recorded decision that was never wired in.
- **Change.**
  - Add an `identity/api.ts` with `readLiveMembershipTx`-style functions and the enum constants, and move casting's table accesses over one by one.
  - Tighten the lint: dynamic and require patterns, plus a path allowlist `^src/modules/[^/]+/repository\.ts$`.
  - Then wire in dependency-cruiser, or record the deviation in `docs/review-log.md`.
- **Coverage: ❌** for the boundary itself (nothing fails on the import). ✅ for the behaviour behind it. The lint has 7 cases; add dynamic-import and require cases first.

### 14. Audit log: actor not bound; post-retention UPDATE column-unrestricted · A · Fix

- **Where.** `audit/schema.ts:30–41`, 68–92; `scripts/db/bootstrap-roles.sql` grants `app_runtime` UPDATE and DELETE on every table.
- **Problem.**
  - The insert policy checks only `household_id`. `actor_account_id`, `actor_profile_id` and `subject_id` come from the caller.
  - Once a subject passes retention, *any* column can be rewritten, including `event_type` and the actor.
- **Change.** Add a `BEFORE UPDATE` trigger allowing only `payload` to change, and a check that `actor_account_id = current_setting('app.account_id')` when it is set.
- **Coverage: ◐.** `immutability.test.ts` pins UPDATE and DELETE as no-ops before expiry. Pin first: actor spoofing, and an UPDATE of `event_type` on an expired subject.

### 15. DB client: no fail-fast, bounds or timeouts · A · Fix

- **Where.** `src/db/client.ts:7`: `postgres(process.env.DATABASE_URL!, { prepare: false })`.
- **Problem.**
  - There is no `max`, `connect_timeout` or `idle_timeout`.
  - There is no `statement_timeout` or `lock_timeout` anywhere in `src/`, `drizzle/` or `scripts/`.
  - The hazards file already records a pool deadlock that had no timeout to break it.
- **Change.** Fail fast with a clear error when the URL is missing. Set the pool bounds. Set `statement_timeout` and `lock_timeout` transaction-locally in the existing `withSessionContext` `set_config` statement.
- **Coverage: ❌.** Pin the missing-URL error, and a test that a held lock times out with a defined error.

### 16. Wide error unions and copy-pasted code→message switches · V · Refactor

- **Where.**
  - `AccountSettingsErrorCode` has 12–13 codes shared by the email and password flows.
  - `JoinErrorCode` carries the reset codes.
  - The switches are in `account/actions.ts`, `join/[code]/actions.ts:101–170` and `255–315`, and `sign-in/actions.ts:44–65` duplicated in `register/actions.ts:56–79`.
- **Problem.** Half the cases exist only "so the switch stays exhaustive". A new code means editing 4 or 5 files.
- **Change.** First extract pure mappers (`signInErrorText(code)` and others) into a sibling `error-messages.ts`, as a pure move. Then split the unions per operation (`EmailChangeErrorCode`, `PasswordChangeErrorCode`, `ResetErrorCode`), which removes the never-reached cases.
- **Coverage: ◐.** `join-code-never-in-query-or-log.test.ts` pins the join codes. Nothing imports `account/actions.ts` or `register/actions.ts`. Pin "each code maps to its `de` string" first.

### 17. `updateSettingsAction` swallows every error · A · Fix

- **Where.** `(org)/settings/actions.ts:28–38`.
- **Problem.** The spec says the action is "refused while any round is open, naming the open round" (FR-1.21). The catch instead maps every error to `genericSaveFailure` and logs the raw error object.
- **Change.** Map errors by class, as `createAndOpenRoundAction` does.
- **Coverage: ❌.** Pin which error class yields which message, and that no id reaches the state.

### 18. Provider-error classification split across two files · A · Refactor

- **Where.** `auth-provider.ts:101–186`; `auth.ts` calls `classifyProviderError` 8+ times and `supabaseAdmin()` directly 8 times (V count).
- **Problem.** `isEmailTakenError` must be called before the classifier at 3 sites, and only a comment says so. The "read back / resend once" wrappers differ only in the call they make.
- **Change.** Add `updateEmailClassified()` and `updatePasswordClassified()` to `auth-provider.ts`, returning `applied | refused | email_taken | unknown`. Add one `withResend(fn)` helper.
- **Coverage: ✅.** The `provider-deadline-*` tests pin every outcome.

### 19. Ad-hoc logging on incident paths · V · Refactor

- **Where.** `auth.ts` has 18 bare `console.error` calls (V); `settings/actions.ts` has more.
- **Problem.** The calls carry no label, account id or outcome code. A production `change_incomplete` or `reset_outcome_unknown` cannot be traced.
- **Change.** Add one `logIdentityIncident(code, accountId, err)` that logs the code and class only, never values, matching the capture actions' deliberate style. Start with the 3–4 repair-failure sites.
- **Coverage: ❌.** Pin with a spy on the logger that asserts no personal data is logged.

### 20. `members/page.tsx` mixes concerns; dates have no time zone · A · Refactor + fix

- **Where.** `(org)/members/page.tsx:34–135`, 167–210, 330–440.
- **Problem.**
  - The page does the session redirect, the grouping into Maps, the live/dead split, date formatting and a ~100-line row component.
  - Its `formatGermanDate` has no `timeZone`, while `dashboard-view.ts:49` sets `Europe/Berlin`. That is a third date helper and an off-by-one-day risk on a UTC server.
- **Change.** Move the grouping into a pure `members-view.ts` (like `dashboard-view.ts`). Extract `MemberRow` and `JoinCodeCard`. Use one `src/ui/format.ts` with the Berlin time zone. Do this together with #1, since the same lines become capability flags.
- **Coverage: ❌.** No test imports the page. Pin the grouping order, the live/dead split and a midnight-CEST date first.

### 21. `capture-form.tsx` serves two modes · A · Refactor (recommended warm-up)

- **Where.** `rounds/[id]/applications/new/capture-form.tsx` (507 lines), switching on `FormMode.kind`, with an `initial` prop that exists "only for the render tests".
- **Change.** Split into shared `FormFields` plus thin `CaptureForm` and `EditForm` wrappers. Pass the test-only initial state through a test helper instead.
- **Coverage: ✅.** `capture-page.test.ts`, `third-party-notice.test.ts`, `capture-action.test.ts`, `update-action.test.ts` and `capture-steps.test.ts`. This is the cleanest "refactor under existing characterization tests" candidate in the repo. Check edit-mode branch coverage once before starting.

### 22. Lint helpers copy-pasted · A · Refactor

- **Where.** File walkers in 7 lints; comment strippers in 6, with different semantics (blanking vs deleting, and `//` inside strings).
- **Problem.** This duplication is how #8 happened: the CRLF fix reached `rls-coverage` but not `guarded-tests`.
- **Change.** Add `scripts/lint/_shared.ts` (`walk`, `blankComments`, `lineOf`), following `sql-statements.ts` as the precedent. Migrate one lint per commit.
- **Coverage: ◐.** Each lint has its own test file. Add tests for the shared helpers, including CRLF, first.

### 23. Test helpers mix six responsibilities · A · Refactor

- **Where.** `tests/helpers/identity.ts` (285 lines); `authorization-matrix.test.ts:19–37` re-implements household registration; the literal test password appears in 66 files; ~78 copy-pasted `afterEach` blocks.
- **Problem.** `createTestModerator` monkey-patches `hh.cleanup`. If the original cleanup throws, the moderator's Auth user leaks.
- **Change.** Split into `cleanup.ts`, `households.ts` and `fixtures.ts`. Export `TEST_PASSWORD` and a `useTestHousehold()` helper that owns the `afterEach`.
- **Coverage: ◐.** `cleanup-inventory.test.ts` and `sweep-abandoned-household.test.ts` cover cleanup. The moderator patch has no direct test.

### 24. CI hardening · A · Fix

- **Where and problem.**
  - `.github/workflows/ci.yml` has no `permissions:` block.
  - Actions are pinned to mutable tags (`@v4`), not SHAs.
  - The same (public, local-stack) anon JWT is pasted twice.
  - `package.json` has no `engines`, although `node tools/check-refs.ts` needs Node 24's native TS stripping.
  - check-refs runs twice.
- **Change.** Add `permissions: contents: read`, pin actions by SHA, set the JWT once in workflow `env:`, add `engines.node`, and drop the duplicate step.
- **Coverage: ❌.** Configuration, so verify with a CI run on a branch.

### 25. No live-catalog check beyond columns · V · Fix

- **Where.** `tests/integration/schema/data-inventory-live.test.ts` compares **columns** only.
- **Problem.** Nothing checks live policy names per table, `relforcerowsecurity`, trigger presence or **grants** against the code. #2 went undetected because of this gap.
- **Change.** Add a catalog test listing the expected policies and FORCE-RLS flags per table, merged with the grants test from #2. Strict in CI's runner stack and warn-only on shared dev, as D5 already does for columns.
- **Coverage: ❌.** This finding is the missing test itself.

### 26. Casting reads relying on RLS alone · A · Fix

- **Where.** `getRoundParticipants` (`casting/repository.ts:909–965`), `hasProcedureChangedNotice` (`:1280–1293`), and the profile branch of `getRoundForSession`.
- **Change.** Add the household predicate and an `isUuid` guard, as `getStartOverview` already does.
- **Coverage: ◐.** `round-malformed-id.test.ts` and `round-participant-list.test.ts` cover `getRoundForSession`. Pin the other two with malformed and foreign ids first.

---

## 🟢 Low

| # | Finding | Where | Change | Coverage |
|---|---|---|---|---|
| 27 | Comments used as a changelog: 34 "Copilot review round" / "PR #23" / "pre-mortem" references; an orphaned comment (`auth.ts:298–302`); stale `line ~526` references | identity | Reduce to one invariant sentence per function; history belongs in git and `openspec/changes/archive/` | n/a (no behaviour) |
| 28 | DRY leftovers: `type Tx` redeclared in 3 files; 6 copy-pasted `recordActivityEvent` shapes; duplicated HMAC secret read; `toISOString().slice(0,10)` ×3; `permissionSet` (`identity/repository.ts:496`, `sql.raw` + manual escaping, constants-only today) duplicating `permissionArrayLiteral` (`schema.ts:62`) | identity | Export `Tx` from `session-context.ts`; `recordAccountEvent`; `hmacHex`; bound array parameter instead of `sql.raw` | ✅ (`member-role-appointment`, `moderator-permissions`) |
| 29 | Casting F1 functions throw plain `Error("Room not found: <id>")` with ids in the message; no code to branch on | `casting/repository.ts:572, 599, 733` | Coded `RoomNotFoundError` / `RoundNotFoundError` | ❌ |
| 30 | Audit module mixes the event registry, validation, insert and a **no-op** redaction job (`REDACTABLE_KEYS` has one empty entry); inverted dependency on the casting and identity schemas | `audit/repository.ts` | Split `payload-rules.ts`; mark the redaction as not yet active | ✅ (`payload-allowlist.test.ts`) |
| 31 | `SECURITY DEFINER` `search_path` inconsistent (`public` in 0005–0019 vs `pg_catalog, public` in 0023+); join codes stored in plaintext | drizzle | Standardise in the next re-runnable migration; consider hashing the code | ◐ |
| 32 | The GUC session context can be set by any SQL running as `app_runtime`; `current_setting(...)::uuid` on `''` fails as a crash, not a refusal | `session-context.ts`, policies | Document the threat model in the hazards file; `nullif(…,'')` in the policies | ◐ |
| 33 | English literal `"New round"` in a German UI; three different action-state shapes | `rounds/new/actions.ts:27` | Move to `de.rounds`; settle the shape after #16 | ❌ |
| 34 | `transitionRoomAction` casts unvalidated `toStatus` with `as RoomStatus` | `rooms/actions.ts:56–66` | Validate against `ROOM_STATUSES` | ❌ |
| 35 | Invite link built from the request `Host` header (the link is a bearer credential) | `members/page.tsx` ~161 | `APP_ORIGIN` env var; fall back to Host in development only | ◐ |
| 36 | `rls-coverage.ts` re-parses `schema.ts` with regex, although `data-inventory.ts` already introspects via `getTableConfig` | scripts/lint | Re-implement over `getTableConfig` | ✅ (8 cases) |
| 37 | Recorded tooling not wired in (dependency-cruiser, license-checker); `tools/done-check.ts` called by nothing; the seed is not idempotent and uses a fixed password | tools, scripts | Wire them in or record the deviation; random seed password | ❌ |
| 38 | YAGNI stub `triggerSubjectAccessExport` returns a fake handle inside a security module | `identity/repository.ts:1459` | Mark it unimplemented, or throw | ✅ (`subject-access-export-stub.test.ts`) |
| 39 | `record_join_attempt` keys on a caller-supplied hash and takes caller-supplied limits | `drizzle/0014` | Covered by #2's REVOKE; add a production startup assertion that `JOIN_ATTEMPT_TRUSTED_IP_HEADER` is set | ✅ (`record-join-attempt.test.ts`) |

---

## Recommended order

1. **#2 grants.** A one-migration fix plus one catalog test. Smallest effort, largest exposure.
2. **#1 role → permission (change 2b, promoted).** Characterization tests (moderator and granted-member columns in the matrix, members-page render) → permissions + migration → gates → capability flags → regression lint. Fold #20 into it.
3. **#3, #4, #5 casting F1 hardening**, as one change: settings lock order, room locks and predicates, actor from `context`.
4. **#8, #9 guardrail correctness**: the CRLF lint and the env allowlist. Small, and they protect everything else.
5. **#10 error boundary and `requireSession()`.**
6. **Pure refactors, only under ✅:** #21 (warm-up), #12 (file splits), #18, #7 (compensation part), #30, #36. Every other refactor waits until its ◐/❌ gaps are pinned.

## What came out clean

Agents read these deliberately and found no debt:

- The application capture, update and transition lock choreography (`FOR SHARE`/`FOR UPDATE`, G-D15 early returns), well covered by the `application-*` tests.
- Session cookies: httpOnly, sameSite lax, secure in production, UUID-validated, checked against the server-side row.
- Server actions take the actor from `current.context.accountId`, never from a hidden field.
- No open redirects; `getClientIp`'s trusted-header design.
- `.env.local` is gitignored, and the gitleaks pre-commit hook fails closed.
- Every guardrail lint has its own test file.

---

## Errata (2026-10-01, found while writing the work packages)

The plan-writing agents re-read the code. The packages in `audit/cursor/` use these corrected facts; the findings above are left as first written.

**Escalation of #2.** The repository `SmokeyRGB/flatmate-io` is **public** (V, `gh repo view`), and `ci.yml:172–173, 200` commits `flatmate-io-dev`'s URL and anon key (V). Item #24 called it a local-stack key; it is the hosted dev key. The exposure in #2 is therefore live on dev today. The immediate mitigation is in `audit/cursor/README.md`.

| # | Correction |
|---|---|
| 7 | Only the email and password lock preambles are near-identical. The reset phases lock membership by profile id, and `signIn` takes `account FOR SHARE`. Extract with care. |
| 10 | The uncaught actions also include `reactivateMemberAction`, `issueJoinCodeAction`, `issueJoinCodeForProfileAction`, `deleteJoinCodeAction`, `createResidentProfileAction` and `transitionRoomAction`. New: thrown server-action errors are masked in production, so `issuePasswordResetLinkAction`'s message never reaches the screen. |
| 11 | `issueJoinCodeTx` has 3 callers (`registerHousehold` plus two inside `identity/repository.ts`), so it cannot simply become module-private. |
| 13 | The audit/identity coupling is a layering violation of `docs/domain/kontextgrenzen.md` §4, not a runtime cycle. Casting's `getRoundParticipants` is a cross-context join that rule 1 forbids. |
| 14 | A strict "actor = session account" rule would break `claimResidentProfile` and `redeemPasswordReset`, which record a different actor by design. |
| 15 | postgres.js already defaults to `max: 10`. A fail-fast on `DATABASE_URL` must exempt `next build`, which CI runs without a database. |
| 19 | `auth.ts` has 12 real `console.error` calls, not 18 (6 hits were comments). drizzle 0.45's `DrizzleQueryError` embeds bound `params` in its message, so `console.error(err)` can log values. |
| 22 | There are 5 recursive walkers plus 2 flat listings, and 6 comment strippers, none of them string-aware. |
| 24 | The second `check-refs` run is a deliberate named gate. |
| 28 | There are 5 `Tx` aliases, 5 account-event sites and 4 `toISOString().slice(0,10)` sites (the 4th is in `identity/repository.ts`), all UTC dates. Replacing `permissionSet` with a bound array would change the SQL; reuse `permissionArrayLiteral` instead. |
| 29 | The second "Room not found" throw is at line 600. |
| 31 | Only `0026` is a `SECURITY DEFINER` function among 0023–0026 (0023 and 0025 are plain triggers). |
| 33 | The "New round" literal is at `rounds/new/actions.ts:22`. |
| 37 | `done-check.ts` is documented in four places; only its automation is missing. |
| 2 | `rls_auto_enable` is Supabase's own helper, not the project's. Exclude it, don't revoke blindly. |

## Appendix: role-check inventory (input for change 2b)

R = `src/modules/identity/repository.ts`, M = `src/app/(org)/members/page.tsx`. The proposed names are suggestions for 2b's propose step.

| Site | Decides | Becomes | Refusal tested for… |
|---|---|---|---|
| R:738 `assertIsAdministrationOrModerator` | central gate | `assertHasPermission(…, "manage_members")` | resident ✅ |
| R:749 `assertIsAdministration` | central admin gate | one named permission per caller (below) | resident ✅ |
| R:187 `transitionResidentProfileStatus` | profile status | `manage_members` | resident ✅, spoofed ✅ |
| R:843 / 881 / 910 remove / move-out / reactivate | membership lifecycle | `manage_members` | resident ✅; moderator allowed ◐ (move-out only) |
| R:1173 / 1256 / 1284 / 1334 join links | issue / extend / delete / list | `manage_members` | resident ✅, moderator allowed ✅ |
| R:1344, 1385 reset-row filter | who sees reset codes | `issue_password_reset_link` | ✅ |
| R:86 `createResidentProfile` | prepared profile | `create_resident_profile` (household only) | resident ✅, **moderator ❌** |
| R:1207 `issuePasswordResetLink` | reset link | `issue_password_reset_link` (household only) | resident ✅, moderator ✅ |
| R:1412 `setMemberRole` | appoint / demote | `appoint_moderator` (household only) | resident ✅, **moderator ❌** |
| R:1417 `setMemberRole` target | admin can't be the target | target-side permission check | ✅ refused only |
| R:1420 `fromRole === toRole` | no-op | compare stored sets, or leave as a state read | ❌ |
| R:1464 `triggerSubjectAccessExport` | export stub | `trigger_subject_access_export` (not `delete_data`) | resident ✅, **moderator ❌** |
| R:685 `getResidentList` | list access | `manage_members` **+ the missing session-account check** | ✅, but a test depends on the hole |
| R:722 `leadWithJoinCode` / returned `isAdmin` | UI lead | capability flag | allowed only |
| R:601–608 `getNavigationAccess` | menu items | drop the role terms; `manage_members` | ✅ |
| `settings/page.tsx:35` | settings read gate | `manage_settings` (**behaviour change** for granted non-admins) | resident ✅, moderator ❌ |
| M:211, 337, 363, 370, 390, 414 | form, badge, buttons | capability flags from the repository | **❌ none** |

Legitimate role uses that stay: the role **writes** (`auth.ts:234, 421, 1065`; R:795, 925, 1431), the role↔permission-set CHECKs (`schema.ts:306–339`, `drizzle/0024`, `0027`), and input validation of `toRole` (`members/actions.ts:101`).
