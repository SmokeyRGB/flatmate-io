# WP08 · App-layer error handling: session guard, error boundaries, error→message mappers

> One-line: paste into a fresh Cursor Agent session; read `audit/cursor/README.md` first.

## 1. Goal

Findings #10, #16, #17, #33, #34 of `audit/technical-debt.md`. After this package:

- An expired or missing session in any `(org)` / `(resident)/account` server action redirects to `/sign-in`, the way capture/edit already do. No action throws `"Not signed in"`.
- A routine failure inside `(org)` renders a calm boundary (`(org)/error.tsx`), not a raw 500; a root-level failure renders `global-error.tsx`.
- The sign-in / register / join / reset / account actions share pure code→message mappers instead of five hand-copied `switch`es, and the wide error unions are split per operation.
- `updateSettingsAction` maps errors by class and names the open round (FR-1.21) without leaking an id.
- No English literal `"New round"` is stored as a title; `transitionRoomAction` validates `toStatus` instead of casting.

Happy paths do not change.

## 2. Branch, dependencies, conflicts

- Branch from current `main`: `fix/wp08-app-error-handling`. One PR.
- No package dependency. **Must not run while change 2b (`role-permissions`) is in flight**; start only if 2b is merged or has not started.
- **Reserved for 2b, do not plan or make changes to:** role checks, `isAdmin` / `canAct` / `leadWithJoinCode` flags, `getResidentList`, `getNavigationAccess`, the permission constants, the `drizzle/0024`/`0027` CHECKs, and `members/page.tsx`'s role branching. In `members/actions.ts` you change **only the session-guard line** of each action. `setMemberRoleAction`'s body (the `toRole` logic) is 2b's: change its first two lines and nothing else, and write no happy-path pin for it.
- **Conflicts with WP04** (it removes the caller-supplied `actor` argument and edits the same call sites in `rooms/actions.ts`, `settings/actions.ts`, `rounds/new/actions.ts`) and **WP03** (edits `updateHouseholdSettingsWithProcedureLock`). Merge WP08 first, or rebase onto whichever lands first. Never resolve a conflict by reverting their change.
- Step 7 below edits error **types** in `src/modules/identity/auth.ts` (allowed here). WP10/WP11 restructure that file later and will rebase onto your aliases; keep the step to type declarations only.

## 3. Read first

1. `audit/cursor/README.md` (all ground rules), `CLAUDE.md`, `.claude/rules/implementation-hazards.md`, `.claude/rules/guardrail-lints.md`.
2. `audit/technical-debt.md` findings #10, #16, #17, #33, #34.
3. Next.js 16.3.5 docs (this version differs from training data):
   - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`. The boundary prop is `{ error, retry }`, not `reset`. `error.js` wraps `page`, `loading` and nested layouts but not the same segment's `layout`. `global-error` must render its own `<html>` and `<body>` and gets no global CSS.
   - `.../01-getting-started/10-error-handling.md`. Expected errors are returned from Server Functions; uncaught ones go to boundaries.
   - `.../04-functions/redirect.md`. In a Server Action `redirect` throws, so call it **outside** any `try` that catches broadly.
4. Models to copy: `src/app/(resident)/error.tsx`, `src/app/(auth)/join/error.tsx`, and their source-text tests `tests/unit/start/dashboard-error-boundary-silent.test.ts`, `tests/unit/identity/join-error-boundary-silent.test.ts`.
5. Action-test precedent: `tests/unit/casting/capture-action.test.ts`, `update-action.test.ts`, `create-and-open-round-permission-error.test.ts`.

## 4. Current state (verified 2026-10-01 on main @ 3401c94)

**Session handling.** `getCurrentSession()` (`src/modules/identity/session-cookie.ts`) returns `CurrentSession | null`. Capture/edit actions do it inline: `rounds/[id]/applications/new/actions.ts:47` and `.../[applicationId]/edit/actions.ts:35` read `if (!current) redirect("/sign-in")`. Pages and `(org)/layout.tsx:19` do the same. There is no shared helper.

**`throw new Error("Not signed in")` inventory: exactly 15, audit confirmed.**

| File | Lines | Count |
|---|---|---|
| `src/app/(org)/members/actions.ts` | 32, 50, 78, 87, 98, 112, 135, 153, 174, 183 | 10 |
| `src/app/(org)/rooms/actions.ts` (inside `requireRoomsAccess`) | 17 | 1 |
| `src/app/(org)/rounds/new/actions.ts` | 20 | 1 |
| `src/app/(org)/settings/actions.ts` | 18 | 1 |
| `src/app/(resident)/account/actions.ts` | 27, 90 | 2 |

**Boundaries.** `src/app/(resident)/error.tsx` and `src/app/(auth)/join/error.tsx` exist. There is no `src/app/(org)/error.tsx` and no `src/app/global-error.tsx`. Copy lives in `de.resident.unexpectedError` and `de.join.unexpectedError` (identical text: heading "Das hat gerade nicht geklappt.", body, retry). `de.org` (`src/ui/strings/de.ts:177`) has no such key. The silent-boundary tests read only the two existing files.

**Actions with no `try`/`catch` (repository errors reach the boundary).** The audit named five; the real list is longer:
- `members/actions.ts`: `createResidentProfileAction` (duplicate name is deliberately left to the boundary, see its comment), `setMovedOutAction`, `reactivateMemberAction`, `setMemberRoleAction`, `issueJoinCodeAction`, `issueJoinCodeForProfileAction`, `extendJoinCodeAction`, `deleteJoinCodeAction`. `issuePasswordResetLinkAction` catches one class and rethrows `new Error(de...notEligibleForReset)`.
- `rooms/actions.ts`: `renameRoomAction`, `transitionRoomAction`, `removeRoomAction`. (`transitionRoomAction` is missing from the audit.)
- Only `removeMemberAction`, `createRoomAction`, `createAndOpenRoundAction`, `updateSettingsAction` and the account actions catch.

**Side observation, do not fix here.** Per `error.md`, errors from server code show a generic message in production, so the German text thrown by `issuePasswordResetLinkAction` never reaches the screen outside `next dev`. Report it in the hand-back.

**`updateSettingsAction`** (`(org)/settings/actions.ts`): the catch is at lines **25-36** (the audit says 28-38). Any `Error` → `console.error(err)` (raw object, which carries the round id) → `de.settings.errors.genericSaveFailure`. `ProcedureLockedError` (`casting/repository.ts:967`) carries only `openRoundId` (public readonly), not a title; its message holds the id and field names. `PermissionDeniedError` comes from `@/modules/identity/repository`. The form is already `fieldset disabled` while a round is open (`settings-form.tsx`), so the lock error is reachable only through a race. `de.settings.lockedWhileRoundOpen(roundTitle)` already exists and is used by the form. `getRoundForSession(context, roundId)` (`casting/repository.ts:909`) returns a row with a `title` (verify on both of its branches; the household account takes the raw-SQL branch with snake_case columns).

**`rounds/new/actions.ts`:** the literal is at line **22** (the audit says :27): `... || "New round"`. It is stored as the round title when the field is blank. `de.rounds.new` has no default-title key.

**`rooms/actions.ts:65`:** `String(formData.get("toStatus") ?? "") as RoomStatus`. The audit says `ROOM_STATUSES`; **no such constant exists**. `RoomStatus` is derived in `casting/room-transitions.ts:3` as `(typeof roomStatusEnum.enumValues)[number]` (the enum is `casting/schema.ts:161`, six values; `audit/repository.ts:102` also does `roomStatusEnum.enumValues`). `room-transitions.ts` currently uses `import type` from `./schema`. An unknown string currently reaches `assertF1RoomTransitionAllowed` and throws `InvalidRoomTransitionError`.

**Duplicated switches (#16).**
- `(auth)/sign-in/actions.ts` ~44-65 and `(auth)/register/actions.ts` ~56-79: same 5 codes → `de.auth.errors.signIn.*`. Register differs in two ways: its state is `{ error, fieldError: null }`, and `provider_unavailable` shows `de.auth.errors.register.signupFailed` and logs, because the household was already undone.
- `(auth)/join/[code]/actions.ts` ~101-170 (`joinHouseholdAction`) and ~255-315 (`redeemPasswordResetAction`). They share `invalid_link`, `missing_fields`, `password_too_short`, `rate_limited`, `signup_failed`; each also carries cases that exist only for exhaustiveness. Side effects live inside the switch: `redirect()` (`already_member`, `reset_done_sign_in_failed`, `reset_outcome_unknown`) and `console.error`.
- `(resident)/account/actions.ts`: `changeEmailAction` and `changePasswordAction` share one `AccountSettingsErrorCode` (13 codes) and each lists the other's codes under a generic text.
- Types in `identity/auth.ts`: `SignInErrorCode` (:479), `JoinErrorCode` (:759), `AccountSettingsErrorCode` (:1113). `rate_limited` is in `JoinErrorCode` but **nothing throws it**; the action returns it before calling `joinHousehold`. (Refinement of the audit.)
- Existing coverage: `join-code-never-in-query-or-log.test.ts` (JoinError messages carry no code; `joinHouseholdAction` pre-network refusals), `tests/unit/start/landing.test.ts` (source-text checks, see hazards). Nothing imports `register/actions.ts` or `account/actions.ts`; no test exercises any action-level code→message mapping.

## 5. Package-specific hazards

1. **`"use server"` files may export only async functions** (types are fine). Mappers and `requireSession` go in separate plain modules, never in `actions.ts`. A mapper file must `import type` from `actions.ts`, not the reverse for values.
2. **Never `redirect()` inside a broad `try`.** `requireSession()` is called before the `try`. In the join switches `redirect` already sits in the `catch` body; keep each side effect where it is.
3. **`tests/unit/start/landing.test.ts` reads source text:** `sign-in/actions.ts` must still contain `landingPathFor`; `register/actions.ts` must not contain `redirect("/dashboard")`; no file may contain `redirect("/dashboard?note=`. The extraction must keep these true.
4. **G-A5:** the join code must not reach a log or a state. Keep `console.error(err)` exactly where it is for join paths (a `JoinError` message never contains the code; do not widen what is logged). New logging added by you in settings logs the class name only, like `createRoomAction`.
5. **G-L / copy:** every new user-visible string goes into `src/ui/strings/de.ts` (German, no model terms, no ids). Keep `tests/unit/lint` green (`pending-feedback` is unaffected: no new `page.tsx`, no new submit button).
6. **Error boundaries stay silent:** destructure only `retry`, no `console`, no `message`, no `digest` (G-A5-shaped; the silent tests check source text with comments stripped).
7. **Unit tests mock the repository modules, never the DB client** (the capture-action precedent). Integration behaviour stays covered by the existing `tests/integration/**`.
8. **Exhaustiveness must survive every extraction:** keep the `default: { const _exhaustive: never = code; return _exhaustive; }` shape in each mapper.
9. Do not add `try`/`catch` to the void members/rooms actions. Their defined outcome is the boundary (decided below); changing signatures to `useActionState` reducers is out of scope.

## 6. Plan

Test conventions (every new test file): `vi.mock("server-only", () => ({}))`, `vi.mock("next/headers", () => ({ cookies: vi.fn() }))`, `next/navigation` mock whose `redirect` **throws** a `RedirectSignal` carrying the target (copy it from `capture-action.test.ts`), `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))`, `getCurrentSession` mocked per test (`vi.mocked(...).mockResolvedValueOnce(null)` for the no-session case), repository modules mocked as `{ ...actual, fn: vi.fn() }` via `vi.importActual` so error classes stay real. Put new files under `tests/unit/app/` (new directory; it matches `tests/**/*.test.ts`). A shared `tests/unit/app/harness.ts` may export `RedirectSignal` and a `SESSION` fixture; the `vi.mock` calls must stay in each test file (hoisting).

### Phase A — characterization / failing tests

All A tests pass against today's code. After writing each file, **prove it can fail**: make one deliberate one-line break (change one mapped `de` key, swap a repository argument), see it red, revert; record this in the PR description.

- **A1 `tests/unit/app/org-actions-characterization.test.ts`** (`test(app): pin org server actions before touching them`)
  - rooms: `createRoomAction` blank label → `de.rooms.create.labelRequired`, repository not called; repository throws → `{ error: de.rooms.create.genericFailure }` and `console.error` receives only the error class name (assert the logged args contain no message text). `renameRoomAction` / `removeRoomAction` / `transitionRoomAction` call the repository with `(context, roomId, ..., actor)` and `revalidatePath("/rooms")`; empty ids → return without calling it. A repository error **rejects with the same instance** (pins "reaches the boundary"). `PermissionDeniedError` from `assertHasPermission` also rejects.
  - members (session-guard line only, per section 2): `removeMemberAction` → `DisplayNameConfirmationMismatchError` → `de.members.errors.nameMismatch`, any other error → `de.members.errors.genericRemoveFailure`, empty `accountId` → `{ error: null }`; `setMovedOutAction`, `reactivateMemberAction`, `extendJoinCodeAction`, `deleteJoinCodeAction`, `issueJoinCodeAction` (defaults 7 days / max 1, `0` kept for `maxUses`), `issueJoinCodeForProfileAction`, `issuePasswordResetLinkAction` (eligibility error → rejects with an Error whose message is `de.members.joinCode.errors.notEligibleForReset`) call the repository with `(context, accountId, ...)` and `revalidatePath("/members")`; repository errors reject unchanged. **Do not** pin `setMemberRoleAction`'s body.
  - rounds/new: the existing permission test stays; add `RoundOpenPreconditionError` code → text for the four codes, and `not_in_draft` logs the error but returns `genericPreconditionFailure`.
  - settings: any `Error` → `de.settings.errors.genericSaveFailure`; success → `{ error: null }` + `revalidatePath("/settings")`.
- **A2 `tests/unit/app/auth-error-tables.test.ts`** (`test(auth): pin the code-to-message tables of the auth and account actions`). Table-driven through the **actions**, with `signIn` / `registerHousehold` / `undoRegisterHousehold` / `joinHousehold` / `redeemPasswordReset` / `changeResidentEmail` / `changeResidentPassword` mocked to throw `new XError("m", code)`:
  - `signInAction` for each of the 6 `SignInErrorCode`s → `{ error: de.auth.errors.signIn.<key> }`.
  - `registerHouseholdAction` for each of the 6 codes → `{ error, fieldError: null }`, `provider_unavailable` → `de.auth.errors.register.signupFailed`, and `undoRegisterHousehold` called once; a plain `Error` → `genericSignInFailure`; the 4 `RegistrationError` codes.
  - `joinHouseholdAction` for every `JoinErrorCode` thrown by `joinHousehold` (`invalid_link` with `refusal: "invalid_link"`, `name_taken`/`password_too_short`/`email_taken`/`invalid_email` with their `fieldError`, `other_household` refusal, `already_member` → `RedirectSignal` to `<landing>?note=already_member`, `signup_failed` → `genericFailure` + one `console.error`, reset-only codes → `genericFailure`).
  - `redeemPasswordResetAction`: each code; `reset_done_sign_in_failed` → redirect `/sign-in?note=password_reset`, `reset_outcome_unknown` → `/sign-in?note=password_reset_unknown`, `reset_incomplete` → `t.errors.resetIncomplete`.
  - `changeEmailAction` / `changePasswordAction`: every `AccountSettingsErrorCode` for both actions, including today's "other flow's code → genericFailure" rows (these rows are removed or rewritten in step 7, see there).
  - Declare each table as `const CASES = {...} satisfies Record<XErrorCode, ...>` so a new code fails compilation.
- **A3 `tests/unit/app/boundary-source.test.ts`**: no test yet; written in step 2 (it needs the new files).

### Phase B — change (each numbered step = one commit, green `npm run verify` before and after)

1. `fix(app): redirect to sign-in instead of throwing when an action has no session`
   - New `src/app/require-session.ts` (plain module, not `"use server"`, beside `landing.ts`): `export async function requireSession(): Promise<CurrentSession> { const current = await getCurrentSession(); if (!current) redirect("/sign-in"); return current; }`.
   - Replace the 15 `if (!current) throw ...` sites. In `rooms/actions.ts` change `requireRoomsAccess` to call it. Adopt it in capture/edit actions too (same behaviour, removes the one divergent inline copy). Pages and layout are out of scope.
   - Test first: `tests/unit/app/require-session.test.ts`, a table over all 15 actions + capture + edit: no session → `RedirectSignal("/sign-in")` and no repository mock called. **Run it before the change and record that it fails** (the actions throw `Not signed in`), then implement. Add one positive case: with a session it returns the session untouched.
   - Add `grep -rn "Not signed in" src` returning nothing to the acceptance criteria.
2. `feat(app): error boundaries for (org) and the root`
   - Add `de.org.unexpectedError` `{ heading, body, retry }` (same wording as `de.resident.unexpectedError`; three copies is the repo's current convention, hoisting to `de.common` is a separate refactor, mention it in the PR).
   - `src/app/(org)/error.tsx`: client component modelled line-for-line on `(resident)/error.tsx` (same signature `({ retry }: { error: Error & { digest?: string }; retry: () => void })`, `role="alert"` callout, retry button); layout (header, sign-out) stays visible because the boundary sits inside the layout.
   - `src/app/global-error.tsx`: client component with its own `<html lang="de"><body>`, heading, body and a retry button using inline minimal styling only (no global CSS reaches it, per `error.md`); strings from `de.document.unexpectedError` (new key); still destructures only `retry`.
   - Test `tests/unit/app/boundary-source.test.ts`: the three assertions of `dashboard-error-boundary-silent.test.ts` (copy the `withoutComments` helper) run over `(org)/error.tsx` and `global-error.tsx`, plus `renderToStaticMarkup` of each with `retry` stubbed contains the `de` heading. Leave the two existing silent tests untouched.
3. `fix(settings): map settings save errors by class and name the open round`
   - Tests first (fail against current code): `ProcedureLockedError(openRoundId, "quorumShare")` with `getRoundForSession` mocked to return `{ title: "Nachbesetzung Herbst" }` → `de.settings.lockedWhileRoundOpen("Nachbesetzung Herbst")`; lookup returns null or throws → new `de.settings.errors.lockedWhileRoundOpenUnnamed`; `PermissionDeniedError` → new `de.settings.errors.permissionDenied` (reuse the wording of `de.rounds.errors.permissionDenied`); any other `Error` → `genericSaveFailure`; non-`Error` throw still rethrows. For every case assert the returned state and every `console.error` argument contain **neither the round id nor a permission slug**.
   - Implement: `catch (err)` with class branches; the lookup uses `getRoundForSession(current.context, err.openRoundId)` inside its own `try`; logging for unknown errors is the class name only. Do not change `updateHouseholdSettingsWithProcedureLock` (WP03's).
   - Update `de.settings.errors` comment (it states the old premise).
   - If `openspec/specs/**` describes the settings error behaviour, update it in the same commit (grep first; none mentions it on 2026-10-01).
4. `fix(rounds): German default title for a blank round name` (#33)
   - Add `de.rounds.new.defaultTitle = "Neue Runde"`. Test first: blank title → `createAndOpenRound` called with `de.rounds.new.defaultTitle`; non-blank trimmed title unchanged. Replace the literal at `rounds/new/actions.ts:22`. Existing test `create-and-open-round-permission-error.test.ts` sets its own `"New round"` input; leave it.
   - The three differing action-state shapes (`{error}`, `{status,code,field}`, `{error,fieldError,refusal}`) are **not** unified: they carry different information. Record that conclusion in the PR; do nothing.
5. `fix(rooms): validate toStatus instead of casting` (#34)
   - In `casting/room-transitions.ts` export `ROOM_STATUSES: readonly RoomStatus[] = roomStatusEnum.enumValues` (value import of `./schema` instead of `import type`) and `isRoomStatus(value: string): value is RoomStatus`. Unit test in `room-transitions.test.ts` style: all six accepted, `""`, `"OPEN"`, `"x"`, `"__proto__"` rejected.
   - Action: `const raw = String(...)`; `if (!roomId || !isRoomStatus(raw)) return;`. Test first: `"bogus"` → repository not called, no throw; a valid but undeclared transition still rejects with `InvalidRoomTransitionError` (pin the boundary path).
   - Mention in the PR that an unknown status is now silently ignored like an empty one (was: error page).
6. `refactor(auth): extract the code-to-message mappers` (#16 step 1, pure move)
   - Files: `src/app/(auth)/error-messages.ts` (`signInErrorText(code: SignInErrorCode): string`, shared by sign-in and register), `src/app/(auth)/join/[code]/error-messages.ts` (join + reset mappers returning `JoinFormState` / `ResetFormState` objects for the pure-return codes), `src/app/(resident)/account/error-messages.ts` (`emailErrorText`, `passwordErrorText`).
   - Mappers stay pure: no `redirect`, no `console`. The actions keep side effects in front of the mapper call (log for `signup_failed`/`reset_incomplete`; redirects for `already_member` and the two reset sign-in outcomes). Register keeps its own `provider_unavailable` branch ahead of the shared mapper. Keep `satisfies`/`never` exhaustiveness.
   - A2 must pass **unchanged** (no edits to the test). Add `tests/unit/app/error-messages.test.ts` with direct "each code → its `de` string" tables for the pure mappers.
7. `refactor(identity): split the error-code unions per operation` (#16 step 2; touches `auth.ts` types only)
   - First build the thrown-code table from the code, not from this document: for `changeResidentEmail`, `changeResidentPassword`, `joinHousehold`, `redeemPasswordReset`, grep every `new AccountSettingsError(` / `new JoinError(` (including helpers such as the ones near `auth.ts:1218-1235`) and list the codes per function in the PR.
   - Declare `EmailChangeErrorCode`, `PasswordChangeErrorCode`, `JoinSignupErrorCode`, `ResetErrorCode`; keep `AccountSettingsErrorCode` and `JoinErrorCode` as **aliases of the unions** so `join-code-never-in-query-or-log.test.ts`, the policy tests and constructors compile unchanged. Remove `rate_limited` from the join/reset unions only after confirming nothing throws it.
   - Mappers take the narrow type; actions narrow with a type guard and `throw err` for a foreign code (unreachable by construction). This turns today's "other flow's code → generic text" rows in A2 into "rethrown": edit those A2 rows in this commit and say so in the body. This is the only intended behaviour change in the step.
   - No change to throw sites, messages or runtime values.

### Phase C — follow-through

- `npm run verify` green; `grep -rn "Not signed in" src` empty; `node tools/check-refs.ts` untouched (no `docs/` edit).
- Optional manual check (`npm run dev`): sign out in a second tab, submit a members/rooms form in the first, expect `/sign-in`; throw a temporary error in a page to see `(org)/error.tsx` (revert afterwards).
- 🛑 HUMAN: confirm the wording of the new boundary copy and `defaultTitle = "Neue Runde"` (visible German strings); decide the open points in section 8.
- Fill the hand-back report into the PR description.

## 7. Acceptance criteria

- [ ] `grep -rn "Not signed in" src` returns nothing; all 15 sites use `requireSession()`; capture/edit use it too.
- [ ] `tests/unit/app/require-session.test.ts` was seen failing before step 1 and covers every action listed in section 4.
- [ ] `src/app/(org)/error.tsx` and `src/app/global-error.tsx` exist, take `{ error, retry }`, bind only `retry`, contain no `console`/`message`/`digest`, and are covered by the source-text test.
- [ ] `updateSettingsAction` maps `ProcedureLockedError` (named round, or the unnamed fallback), `PermissionDeniedError` and other errors by class; no returned state or log argument contains a round id or permission slug (tested).
- [ ] No `"New round"` literal in `src/`; `de.rounds.new.defaultTitle` is used and tested.
- [ ] `transitionRoomAction` has no `as RoomStatus`; `isRoomStatus`/`ROOM_STATUSES` exist and are tested.
- [ ] A2 passed unchanged through step 6; the pure mappers have direct tests; `landing.test.ts` still green.
- [ ] Unions split with aliases kept; no change to `auth.ts` runtime code; thrown-code table in the PR.
- [ ] No file reserved for 2b changed beyond the session-guard lines in `members/actions.ts`.
- [ ] `npm run verify` green after every commit; no test weakened; every new test seen failing under a deliberate break.

## 8. Out of scope & stop conditions

Out of scope: role checks and capability flags; `members/page.tsx`; permission constants; adding reducers or `try`/`catch` to the void actions; the page-level `if (!current) redirect(...)` sites; moving `unexpectedError` copy to a shared key; unifying action-state shapes; fixing the production masking of `issuePasswordResetLinkAction`'s thrown text; logging on incident paths (WP11); any repository change (WP03/WP04).

Stop and report if: 2b is in flight or merged with different action signatures; `getRoundForSession` has no `title` on one branch; a thrown-code table shows a code thrown by the other flow (the guard in step 7 would then change real behaviour); `landing.test.ts` or a G-D guarded test would need editing; you are about to edit a file in the 2b list.

Open human decisions: (1) name the open round via an extra `getRoundForSession` read in the action (planned) versus carrying the title on `ProcedureLockedError` (needs a repository change, WP03's file); (2) unknown `toStatus` silently ignored; (3) rethrow versus generic text for a foreign code in step 7; (4) whether the `issuePasswordResetLinkAction` masking deserves its own work package.

## 9. Hand-back report (template)

```
WP08 hand-back
Branch / PR:
Commits (one line each, step number):
Characterization tests added (file, what they pin, how each was seen failing):
Red-first tests (require-session, settings mapping, default title, toStatus): evidence of the red run:
Audit claims that differed (lines, ROOM_STATUSES, unlisted uncaught actions, rate_limited):
Thrown-code table for step 7 (function -> codes):
npm run verify: <n> files, <n> tests passed / <n> failed; lints: <ok/fail>
Behaviour changes (intended): redirect instead of throw; German default title; unknown toStatus ignored; foreign codes rethrown
Skipped / open questions / things for 2b, WP03, WP04, WP10:
```
