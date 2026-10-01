# WP12 · Module structure: split the god files, narrow the unsafe exports, name the module boundary

> One-line: paste into a fresh Cursor Agent session; read audit/cursor/README.md first.

## 1. Goal

All of this is a refactor. Imports of the old paths keep working and no behaviour changes.

- **#12:** split `identity/auth.ts` (2377 lines), `identity/repository.ts` (1503 lines, 42 exported functions) and `casting/repository.ts` (1293 lines, 24 exported functions) into pure moves, re-exported from the old path.
- **#11:** turn the three "unsafe export" comments into tests that fail when someone imports them from the wrong place.
- **#13 (boundary part):** give casting and audit a published identity API instead of reaching into `identity/schema`.
- **#30:** split the payload rules out of `audit/repository.ts`; document that redaction is a no-op.
- **#38:** document the subject-access-export stub (comment only).

## 2. Branch, dependencies, conflicts

- Branch: `refactor/wp12-module-structure`, from `main` **after WP04 and WP11 are merged**, and after F3 change 2b. WP10 must be merged too (WP11 depends on it).
- **Step 0: re-verify "Current state".** 2b changed `identity/repository.ts` (permission constants, role gates, `getResidentList`, `getNavigationAccess`, the 0024 CHECKs), and WP10/WP11 reshaped `auth.ts`. Line numbers in §4 are from `main @ 3401c94`. Re-derive each one.
- Runs **alone**: nothing else may touch `src/modules/**` while it runs.
- Do not change any permission semantics. A move that carries a role check or a permission constant carries it verbatim.
- The work is split into milestones M1–M7 (§6). Each milestone ends green and is mergeable. If the PR becomes too large to review, stop at a milestone boundary and say so in the hand-back; partial honest progress beats a rushed finish (README rule 9).

## 3. Read first

1. `audit/cursor/README.md`, `CLAUDE.md`, `.claude/rules/guardrail-lints.md` (the import-boundary lint) and `implementation-hazards.md` ("An invariant holds only where it is enforced", especially "A sibling entry").
2. `audit/technical-debt.md` findings #11, #12, #13, #30, #38.
3. `docs/domain/kontextgrenzen.md` §4 (the authoritative context rules; quoted in §4 below).
4. `scripts/lint/import-boundary.ts`.
5. `tests/integration/policy/authorization-matrix.test.ts` (read it completely: lines 1–260 explain how exports are discovered), `tests/unit/lint/cleanup-inventory.test.ts` (second half).
6. `tests/unit/audit/payload-allowlist.test.ts`. It is a **guarded** test (G-D, `test/guarded.manifest.json` lines ~47 and ~53); it must stay unchanged and green.
7. `tests/integration/policy/procedure-lock.test.ts`, `tests/unit/identity/subject-access-export-stub.test.ts`.
8. The WP10 and WP11 files in this folder (hazards H1 of both: `cleanup-inventory.test.ts` parses `auth.ts`).

## 4. Current state (verified 2026-10-01 on main @ 3401c94)

**How `authorization-matrix.test.ts` finds exports: by importing, not by parsing files.** `import * as castingRepo from "@/modules/casting/repository"` and `import * as identityRepo from "@/modules/identity/repository"`, then `Object.keys(mod).filter(isPlainFunction)` (lines 5–6, 53–59), compared with the `NOT_APPLICABLE_*`/`KNOWN_OPEN_*`/case-name lists. Consequences:

- A function moved to a new file **and re-exported with `export *`** from the old `repository.ts` is still discovered. The matrix stays valid.
- A function that is **not** reachable from the old `repository.ts` is invisible to the matrix. A new mutator in a new file that nobody re-exports would silently skip the "refuses a plain resident" check. This is the real risk of the split; test A2 guards it.
- Removing an export makes the matrix fail with "Stale classification entries", which is the intended behaviour.
- `auth.ts` is not scanned by the matrix at all (pre-session functions by design).

**The import-boundary lint (`scripts/lint/import-boundary.ts`):**

- Forbids the raw-client patterns `from "postgres"`, `from "drizzle-orm/postgres-js"`, `from "…db/client"` anywhere in `src/` except `src/db/` and any file whose **basename is exactly `repository.ts`**.
- A new file called `application-repository.ts` does **not** get the exemption.
- It does not need it: **only `identity/repository.ts` imports `@/db/client`** (`db.execute` in 5 places: `resolveAccountHousehold`, `readDatabaseClock`, `resolveJoinCode`, `claimJoinCode`, `recordJoinAttempt`). `casting/repository.ts` and `audit/repository.ts` use only `withSessionContext`/`tx`, which the lint allows. `claimJoinCodeTx` uses `tx.execute`, so it can move.
- Handling for the split: those five raw-client functions **stay in `identity/repository.ts`**, which keeps the raw-client gateway role. Moved files get a database only through `withSessionContext` or a `tx` they are handed.
- Do **not** extend the lint's allowlist (that needs a human decision, G-G3).
- Do **not** create a file named `repository.ts` in a sub-folder to get around it. The pattern WP05 may tighten to is `^src/modules/[^/]+/repository\.ts$`.

**The audit's description of the unsafe exports, checked:**

| Function | Audit claim | Reality |
|---|---|---|
| `issueJoinCodeTx` (`identity/repository.ts` ~1089) | "only caller is `registerHousehold`" | **Three callers:** `registerHousehold` (`auth.ts` 217), `issueJoinCode` (~1175) and `issuePasswordResetLink` (~1229) in the same file. It also appears in `cleanup-inventory.test.ts` (`TX_HELPER_INSERTS`, and a `toContain("issueJoinCodeTx")` sanity check) and in the matrix's `NOT_APPLICABLE_IDENTITY` (line 152). So it cannot become file-private. |
| `claimResidentProfile` (`auth.ts` 350) | "test-only" | True for `src/`: no caller in `src/` or `scripts/`; about 40 test files plus `tests/helpers/identity.ts:245` call it. |
| `forceChangeSettingWhileRoundOpen` (`casting/repository.ts` 1034) | "test-only, unvalidated field spread" | True. Callers are `procedure-lock.test.ts` (lines 73, 118) and the matrix (lines 410–416). `field` is typed `LockedSettingsField`, which is compile-time only; `{ [field]: value }` is not checked at runtime. The resident-refusal case is in `procedure-lock.test.ts:118`. |

The existing precedent to copy: `authorization-matrix.test.ts` lines 196–214 asserts `insertCapturedApplicationTx` has no caller outside its module, by walking `src/` and `scripts/` and grepping with a word-boundary regex.

**Context rules (authoritative: `docs/domain/kontextgrenzen.md` §4).**

- `identity` imports nothing; `casting` may import `identity`; `audit` imports nothing ("audit empfängt nur").
- Rule 1: "Keine Cross-Context-Joins. Ein SQL-Statement fasst nie Tabellen zweier Kontexte an. Lesen über die Grenze geht über einen Query-Port, der ein DTO liefert." The price is a second round trip, which the document accepts.
- So the audit's #13 is grounded: `casting/repository.ts:12` imports `householdSettings`, `membership`, `residentProfile`. Sites: `openRound`'s eligibility query (~752–777, a join inside identity's own tables but written in casting), `getRoundParticipants` (~954–962, a **cross-context join** `roundParticipation` ⨝ `residentProfile`), and `updateHouseholdSettingsWithProcedureLock` (~1012, a write into identity's `household_settings`).
- A documented position already exists for the last one: the comment above `updateHouseholdSettingsWithProcedureLock` says the procedure lock is a casting-round invariant reaching into identity-owned data.
- **Conflicts with `docs/` that this WP must not resolve** (report them): the table also forbids `identity` → `audit` imports and `audit` → `casting`/`identity` imports. The code does both (`recordActivityEvent` is called from every mutator; `audit/repository.ts:14` imports identity enums and the casting enums). The audit says "risks a dependency cycle". There is **no runtime cycle** today (identity's `schema.ts` imports nothing from audit), only a layering violation.

**Audit module (#30).** `audit/repository.ts` is 227 lines: `PAYLOAD_ALLOWLIST` and `PAYLOAD_VALUE_RULES` (value rules use the casting and identity enums), `payloadKeysWithoutValueRule`, `PayloadValidationError`, `assertPayloadAllowed`, `recordActivityEvent`, `REDACTABLE_KEYS` and `redactExpiredActivityEvents`. `REDACTABLE_KEYS` has one entry, `"application.state_changed": []`, so the function is a deliberate no-op today (the comment says so, in prose). Importers: casting and identity repositories, `auth.ts`, and the tests `payload-allowlist.test.ts`, `application-capture.test.ts`, `activityevent-scoping.test.ts`, `immutability.test.ts`, one raw-sql test.

**Stub (#38).** `triggerSubjectAccessExport` (`identity/repository.ts` ~1459) returns `{ exportId: \`export-${applicationId}-${Date.now()}\` }` after `assertIsAdministration`. `subject-access-export-stub.test.ts` asserts `Object.keys(result)` is `["exportId"]`; the matrix asserts a resident is refused (line ~520). **2b changes this function's gate** (appendix row "R:1464": it becomes a `trigger_subject_access_export` permission), so do not touch the function body.

**Tests that mock the repositories.** At least 8 unit tests call `vi.mock("@/modules/identity/repository", …)` or `vi.mock("@/modules/casting/repository", …)` (several with `importActual` plus a spread). They mock by import path. Callers in `src/app/**` must therefore keep importing from the old paths. Rewire only imports *inside* moved files.

Sizes: `identity/repository.ts` has 62 `export` statements, of which **42 are functions** (the audit says ~38). `casting/repository.ts` has 24.

## 5. Package-specific hazards

- **H1: `cleanup-inventory.test.ts` reads `auth.ts`** (`AUTH_FILE`) and extracts `registerHousehold` and `undoRegisterHousehold` by text. Keep both physically in `auth.ts`; `auth.ts` remains their home and keeps `claimResidentProfile`. Do not extract their inserts. If you rename `issueJoinCodeTx`, the test's `TX_HELPER_INSERTS` key and its `toContain` check must change in the same commit. That is a test edit: 🛑 HUMAN (see M7). Default is no rename.
- **H2: no import cycles through the barrel.** After the split `repository.ts` is a barrel (`export * from "./x"`) plus whatever must stay. Moved files must **never** import `./repository`. They import sibling leaf files or other modules. Enforced by test A3.
- **H3: one definition per class.** `instanceof PermissionDeniedError` and friends are used by actions. Move a class, never copy it. `export *` re-exports the same class object.
- **H4: a name clash in `export *`** (two files exporting the same name) is a TypeScript error; do not "fix" it by renaming an exported name. Stop and report.
- **H5: type-only exports vanish from `Object.keys`.** The export-surface test (A1) covers runtime values. Type and interface exports are guarded by `tsc` over the whole repository, which `npm run verify` runs.
- **H6: moves are pure.** No renames, reordering of statements, edits to comments' meaning or "while I am here" fixes in a moving commit. A reviewer must be able to run `git diff --color-moved=dimmed-zebra` and see only moved blocks plus import lines.
- **H7: lock order is a contract.** `casting/repository.ts` ~205 documents "LOCK ORDER: membership, then casting_round", and it depends on `assertHasPermissionTx` (identity) taking `membership … FOR SHARE` first. Moving either side must not change that order; test A4 pins it.
- **H8: the matrix-blindness guard must also cover `auth.ts` splits.** `auth.ts` is not in the matrix, so its split relies on the export snapshot (A1) and `tsc`.

## 6. Plan

### Phase A — characterization / failing tests (milestone M1: safety nets, no production code)

Each test passes today and must be seen failing against a named break (README rule 3). Record break → red.

**A1. Export-surface snapshot.** `tests/unit/modules/export-surface.test.ts`. For each of `@/modules/identity/repository`, `@/modules/identity/auth`, `@/modules/casting/repository`, `@/modules/audit/repository`: `import * as mod`, assert `Object.keys(mod).sort()` equals an explicit array checked into the test (not a snapshot file). Break: delete one `export` keyword or rename an export. This test intentionally has no escape hatch: any change of a module's runtime exports must edit this file in the same commit, with the reason in the commit message.

**A2. Barrel completeness (the matrix-blindness guard).** Same folder. Read `src/modules/identity/*.ts` and `src/modules/casting/*.ts` as text. For every file that imports a runtime value from `@/db/session-context` (a non-`import type` import) and is not `repository.ts`, assert that `repository.ts` contains `from "./<basename>"` (an `export *` line). Explicit allowlist, each with a reason: `auth.ts` (pre-session by design; has its own export snapshot), `session-cookie.ts`, `api.ts` (published read API, not a mutator surface; added in M6). Break: add a new `foo-repository.ts` that imports `withSessionContext` and is not re-exported.

**A3. No module-internal back-import.** Same folder. Every `src/modules/<m>/*.ts` other than `repository.ts` and `auth.ts` must not import `./repository` or `@/modules/<m>/repository` (H2). `auth.ts` may import `./repository` (it imports the barrel; that is not a cycle as long as no leaf imports `auth.ts`). Break: add such an import to a leaf.

**A4. Casting lock-order contract test.** `tests/integration/policy/capture-lock-order.test.ts`, same held-lock technique as `credential-lock-order.test.ts` (WP10 A2; copy its `holdRowLock` / `canLock` (NOWAIT, separate transaction) helpers into `tests/helpers/`, or reuse them if WP10 put them there).

1. Holder takes `membership … FOR UPDATE` on the caller's row. Start `captureApplication` (do not await). It blocks at the permission check. Settle 1500 ms. Assert it has not resolved and `canLock(casting_round row)` is `true` (round not yet locked). Release; await success.
2. Holder takes `casting_round … FOR UPDATE`. Start `captureApplication`. Poll until `canLock(membership row)` is `false`, which proves the function holds membership while waiting for the round. Release; await.

Break: move `assertHasPermissionTx` below the round select in `captureApplication`; case 2 must go red.

**A5. No-external-caller assertions for the unsafe exports (#11).** `tests/unit/lint/unsafe-exports.test.ts`, modelled on `authorization-matrix.test.ts:196–214` (walk `src/` and `scripts/`, word-boundary regex, exclude own file). Assertions:

- `claimResidentProfile`: no occurrence in `src/` outside its definition file `auth.ts`, none in `scripts/`. (Tests may use it.)
- `forceChangeSettingWhileRoundOpen`: no occurrence in `src/` outside `casting/repository.ts` (or the file it moves to), none in `scripts/`.
- `issueJoinCodeTx`: occurrences in `src/` only in `identity/auth.ts` (exactly one, inside `registerHousehold`), and in `identity/repository.ts` or the leaf file it moves to. Nothing under `src/app/`, `src/ui/`, `src/db/`, `src/modules/casting/`, `src/modules/audit/`.

Break for each: add a reference in a file under `src/app/` and see red.

### Phase B — change (numbered = commits; green after each; moves are pure, H6)

**M2: audit (#30, #38 comment).**

1. `refactor(audit): move payload rules to payload-rules.ts`. `PAYLOAD_ALLOWLIST`, `PAYLOAD_VALUE_RULES`, `payloadKeysWithoutValueRule`, `PayloadValidationError`, `assertPayloadAllowed` move to `src/modules/audit/payload-rules.ts`. `repository.ts` keeps `recordActivityEvent`, `REDACTABLE_KEYS`, `redactExpiredActivityEvents`, and `export * from "./payload-rules"`, so `PayloadValidationError` and `assertPayloadAllowed` stay importable from the old path. Do not edit `payload-allowlist.test.ts`. The export snapshot (A1) must show the same `audit/repository` key set.
2. `docs(audit): state that redaction is inactive`. Comment only: above `REDACTABLE_KEYS` and `redactExpiredActivityEvents` say in the first line that **no event type has a registered redactable key, so the job currently changes nothing**, and what adding a key requires. No code change. The guarded test asserts that behaviour.
3. `docs(identity): mark triggerSubjectAccessExport as a stub`. A comment above the function (not touching its body or its gate; 2b owns those): "STUB: returns a placeholder handle; no export is generated." Behaviour change (throwing) is **not** done: it would break `subject-access-export-stub.test.ts` and the matrix case.

**M3: casting (#12, #11).** Split in dependency order. Before moving anything, list each function's private helpers with `grep` and move leaf clusters first. A helper used by two clusters goes to exactly one shared leaf file (name it for what it holds, e.g. `casting/errors.ts`), never copied.

4. `refactor(casting): application-repository.ts` — `getApplication` … `transitionApplication` (≈ lines 72–530) with their error classes and constants.
5. `refactor(casting): room-repository.ts` — `createRoom` … `listRooms` (≈ 533–695), `RoomInUseByOpenRoundError`.
6. `refactor(casting): round-repository.ts` — `createRound` … `getRoundParticipants`, `ProcedureLockedError`, `updateHouseholdSettingsWithProcedureLock`, `forceChangeSettingWhileRoundOpen`, `listRoundsForSession` (≈ 698–1095). Settings stay with the round code deliberately: the open-round lock and the settings lock share an ordering that WP03 documented; one file keeps it reviewable.
7. `refactor(casting): start-overview.ts` — `OrganisationTask`, `listOrganisationTasks`, `StartOverview`, `getStartOverview`, `hasProcedureChangedNotice` (≈ 1099–1293).
8. `refactor(casting): repository.ts is a barrel` — what remains are `export * from` lines (and anything that must stay). The import-boundary lint passes because none of the moved files import the raw client (§4).
9. `refactor(casting): validate the field in forceChangeSettingWhileRoundOpen`. The audit recommends moving it to `tests/helpers`. **Recommendation: do not move it**: the move deletes a case from the authorization matrix (a security test), which needs a human decision (G-G3). Instead check `field` at runtime against `LOCKED_SETTINGS_FIELDS` before the `.set({ [field]: value })` and throw on anything else. It is test-only code, and its two tests pass valid fields. The A5 assertion prevents production use. Offer the "move to tests/helpers + delete the matrix case; refusal stays covered by `procedure-lock.test.ts:118`" as the alternative in the hand-back. 🛑 HUMAN if they prefer it.

**M4: identity/repository.ts (#12).** Leaf files, dependency order. The five raw-client functions (§4) stay in `repository.ts`.

10. `refactor(identity): join-code.ts` — the pure helpers `generateJoinCode`, `buildJoinUrl`, `normalizeJoinCode`, `isWellFormedJoinCode` and their constants. (`join-code-state.ts` already exists; do not merge into it.) `repository.ts` imports them, because `resolveJoinCode`/`claimJoinCodeTx` call `normalizeJoinCode`.
11. `refactor(identity): errors.ts` — the error classes defined in `repository.ts`, the five classes and code unions in `auth.ts` (`RegistrationError`, `ClaimError`, `SignInError`, `JoinError`, `AccountSettingsError`) and `PermissionDeniedError`. Classes only; each file that used one imports it. One definition each (H3). `auth.ts` re-exports them so `import { JoinError } from "@/modules/identity/auth"` still works; confirm with A1.
12. `refactor(identity): permissions.ts` — `membershipHoldsPermission`, `assertHasPermission`, `assertHoldsAnyPermissionTx`, `assertHoldsAllPermissionsTx`, `assertHasPermissionTx`, `readLiveMembershipTx`, `getMembershipForAccount` — **as 2b left them**. Re-derive the set from the code; do not carry anything that 2b removed or add anything it did not have.
13. `refactor(identity): join-code issuing, extending, listing` — `issueJoinCodeTx`, `issueJoinCode`, `issuePasswordResetLink`, `extendJoinCode`, `deleteJoinCode`, `listJoinCodeIssuances` into `join-code-issuance.ts` **only if** they do not need a function that must stay in `repository.ts` (H2). If one does, leave that function where it is and say so in the PR. Keep the name `issueJoinCodeTx` (H1) and keep the "performs no authorization" warning comment, shortened to the current facts (three callers, listed).
14. `refactor(identity): account-settings.ts` — from `auth.ts`: `normalizeEmail`, `isWellFormedEmail`, `JOIN_PASSWORD_MIN_LENGTH`/`checkPasswordRule` if shared, `changeResidentEmail`, `changeResidentPassword` and their private helpers. Re-export from `auth.ts`. (This is M5's first move; keep it here only if `auth.ts` is split in the same PR.)
15. `refactor(identity): repository.ts is gateway + barrel` — remaining: `resolveAccountHousehold`, `readDatabaseClock`, `resolveJoinCode`, `claimJoinCode`, `claimJoinCodeTx` (may move), `recordJoinAttempt`, the members/list/removal functions, plus `export *` lines and the final `export { account, household, … }`. Keep `Actor`. The matrix must pass without edits.

**M5: auth.ts (#12).** `registerHousehold`, `undoRegisterHousehold`, `claimResidentProfile` and their private helpers stay in `auth.ts` (H1). Move the rest, one commit each, `auth.ts` re-exporting: `sign-in.ts` (`signIn` and its types), `join.ts` (`joinHousehold` and its types), `password-reset.ts` (`redeemPasswordReset`), `session-token.ts` (`hashSessionToken`, `joinAttemptSourceHash`, `hmacHex`), `account-settings.ts` if not done in step 14. Private helpers shared by several of these (`insertSessionTx`, `deleteAuthUserBestEffort`, `createAuthUserOrCompensate`, lock helpers, `recordAccountEvent` — from WP10) go to **one** shared leaf (`auth-internal.ts`), not copied. Stop if that file would need a function that stays in `auth.ts` (cycle). Do not edit `cleanup-inventory.test.ts`.

**M6: boundary (#13).**

16. `feat(identity): api.ts` (no behaviour change). A published, read-only surface that does not import `@/db/client` (it takes a `tx`). Contents:
    - `MEMBERSHIP_ROLES` and `RESIDENT_PROFILE_STATUSES`, derived from `membershipRoleEnum.enumValues` / `residentProfileStatusEnum.enumValues`;
    - `listEligibleResidentsTx(tx, householdId)`, the exact query of `openRound` ~752–766, returning `{ profileId, canVote }[]`;
    - `readHouseholdSettingsTx(tx, householdId)`, the select at ~775–777, returning a DTO with only the fields `openRound` reads;
    - `listActiveDisplayNamesTx(tx, householdId, residentProfileIds)`, returning `{ residentProfileId, displayName }[]` for profiles whose status is `active`.
    - Do **not** re-export `api.ts` from `repository.ts` (the matrix would demand a classification for each).
    - Allowlist `api.ts` in A2 with the reason "read-only published API".
17. `refactor(casting): read identity through api.ts` — one site per commit:
    - `openRound`'s eligibility and settings reads;
    - `getRoundParticipants`: replace the cross-context join by two statements (casting selects the participant profile ids, `listActiveDisplayNamesTx` supplies names), as rule 1 of `kontextgrenzen.md` §4 prescribes. The old query had no `ORDER BY`, so order was unspecified; make the new code deterministic by keeping `roundParticipation` insertion order if that column exists, and assert in the tests you add that the returned **set** is equal. Run `round-visibility-*`, `start-overview`, `room-round-authorization` and `join-open-round` first.
    - `updateHouseholdSettingsWithProcedureLock` keeps writing `household_settings` (the documented position). Record this as the one remaining casting import of identity's schema and add that exception to the test in step 19, with the comment's reason. 🛑 HUMAN decision: keep (recommended), or add an identity-owned `writeHouseholdSettingsTx` (this would add one more no-authorization `Tx` primitive, against #11's direction).
18. `refactor(audit): payload-rules reads enum values from identity/api` — `membershipRoleEnum`/`residentProfileStatusEnum` imports replaced by `MEMBERSHIP_ROLES`/`RESIDENT_PROFILE_STATUSES`. Confirm `payload-allowlist.test.ts` and `application-capture.test.ts` stay green and unchanged. The casting enum imports stay (audit → casting is a layering issue for the docs, §4; report, do not fix).
19. `test(modules): casting and audit import identity only through repository, api, auth` — a text test in `tests/unit/lint/`: no file under `src/modules/casting/` or `src/modules/audit/` imports `@/modules/identity/schema`, except the one listed exception from step 17. Break: add such an import.
20. `docs(casting): the membership-then-round lock order points at identity` — replace the prose at `captureApplication` (~195–205) so it names `assertHasPermissionTx` (identity/permissions) as the call that takes `membership … FOR SHARE`, and cites `capture-lock-order.test.ts`. In `permissions.ts`, at that function, add one sentence that casting depends on this being the first lock. Comment only.

**M7: wrap-up.** Optional, only with human approval: rename `issueJoinCodeTx` to `issueFoundingJoinCodeTx` (this edits `cleanup-inventory.test.ts` and the matrix classification; do not do it unprompted).

### Phase C — follow-through

- `npm run verify` after the last commit of every milestone; record counts. Expect ~80–90 s of tests.
- Evidence that each move is pure: `git diff --color-moved=dimmed-zebra main...HEAD --stat` plus a sample of the moved blocks. State in the PR that no statement inside a moved block changed.
- If a spec in `openspec/specs/**` names a file path you moved, update it in the same commit. Do not edit `openspec/changes/archive/**`. Do not touch `docs/` (the conflicts in §4 are reported, not fixed).
- `node tools/check-refs.ts` is only needed if you edit `docs/` (you should not).
- 🛑 HUMAN: the three decisions in §9.

## 7. Acceptance criteria

- [ ] §4 re-verified after 2b and WP10/11; deviations listed.
- [ ] Tests A1–A5 added, each seen red against its break; M1 merged green before any move.
- [ ] `authorization-matrix.test.ts` and `cleanup-inventory.test.ts` pass **unchanged**; `payload-allowlist.test.ts` unchanged.
- [ ] `Object.keys` of the four module entry points are identical before and after (A1 unchanged) unless a listed step says otherwise.
- [ ] Every moved file passes the import-boundary lint without any exemption; no file named `repository.ts` outside `src/modules/<m>/`; no import of `./repository` from a leaf (A3).
- [ ] `repository.ts` (identity, casting) is a barrel plus the raw-client gateway; sizes dropped (record before/after line counts).
- [ ] `issueJoinCodeTx`, `claimResidentProfile`, `forceChangeSettingWhileRoundOpen` each have a failing-if-misused test (A5); `forceChangeSettingWhileRoundOpen` validates its field.
- [ ] Casting and audit import identity through `api.ts` (one documented exception); `getRoundParticipants` has no cross-context join.
- [ ] Redaction and subject-access stub are labelled, with no code change in either.
- [ ] No existing test edited, skipped or loosened; no permission semantics touched; `npm run verify` green; no `Co-Authored-By`.

## 8. Out of scope & stop conditions

Out of scope:

- Role/permission changes (2b); WP05's lint tightening and dependency-cruiser wiring (#13's lint half); the `kontextgrenzen.md` conflicts (identity → audit, audit → casting/identity); redesigning audit event registration per module.
- Changing `triggerSubjectAccessExport`'s behaviour; renaming any exported name; moving anything out of the module directory; moving `registerHousehold`/`undoRegisterHousehold`.
- Anything in `src/app/**` (callers keep the old import paths).

Stop and report when:

- a move needs a name that clashes (H4) or a leaf needing a function from the barrel (cycle, H2);
- a function that must stay in `repository.ts` is needed by a moved one in a way that forces the raw client into a moved file;
- the matrix, cleanup-inventory or any guarded test has to change;
- a step would change SQL, ordering or a lock order (H7);
- 2b, WP04, WP10 or WP11 is not merged.

## 9. Hand-back report (template)

```
WP12 hand-back
Branch / PR:                 Prerequisites merged at: 2b <sha> WP04 <sha> WP10 <sha> WP11 <sha>
Milestones completed: M1 [ ] M2 [ ] M3 [ ] M4 [ ] M5 [ ] M6 [ ] M7 [ ]
Re-verification (§4): deviations: <list or "none">
Commits (step number, one line each):
Safety-net tests (file → break → red test name):
  - export-surface (A1) / barrel completeness (A2) / no back-import (A3) /
    capture-lock-order (A4) / unsafe-exports (A5) →
Line counts before → after: auth.ts 2377 → <n>; identity/repository.ts 1503 → <n>; casting/repository.ts 1293 → <n>
Files that stayed in repository.ts because of the raw client or a cycle: <list + reason>
Matrix / cleanup-inventory / payload-allowlist unchanged: <yes/no>
Moved-block purity evidence: <git diff --color-moved summary>
npm run verify: <pass/fail>, vitest <passed>/<total>, duration
Skipped (reason):
Open human decisions:
  1. forceChangeSettingWhileRoundOpen: validate in place (done) vs move to tests/helpers and delete the matrix case.
  2. household_settings write from casting: keep (documented exception) vs identity write primitive.
  3. Rename issueJoinCodeTx (edits cleanup-inventory + matrix)?
  4. docs/domain/kontextgrenzen.md §4 vs code: identity -> audit and audit -> casting/identity imports exist. Update the table, or change the code?
Audit claims found inaccurate: issueJoinCodeTx has 3 callers not 1; identity/repository.ts has 42 exported functions not ~38; no runtime cycle between audit and identity; claimResidentProfile is not scanned by the matrix at all
```
