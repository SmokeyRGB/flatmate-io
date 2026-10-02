# WP04 · Casting validation, actor from context, coded not-found errors

> One-line: paste into a fresh Cursor Agent session; read `audit/cursor/README.md` first.

Rule numbers below ("README rule 3") refer to the Ground rules in `audit/cursor/README.md`.

## 1. Goal

Make the casting F1 mutators and reads enforce their own inputs instead of leaning on RLS and on their callers:

- **#4 (rest).** `renameRoom`, `transitionRoomStatus`, `removeRoom` get a household predicate and an `isUuid` guard. `addResidentToRound` validates the round (exists, open, same household) and the profile (same household, not moved out or removed). `insertDraftRoundTx` validates `roomIds`.
- **#5.** The F1 mutators stop taking a caller-supplied `Actor`. Both ids written to the audit trail come from `context`, and the permission check runs inside the write transaction for every remaining function (WP03 did four of them).
- **#26.** `getRoundParticipants`, `hasProcedureChangedNotice` and the profile branch of `getRoundForSession` get a household predicate and an `isUuid` guard, as `getStartOverview` already has.
- **#29.** Plain `Error("Room not found: <id>")` / `Error("CastingRound not found: <id>")` become coded `RoomNotFoundError` / `RoundNotFoundError` without the id in the message.

This is a **Fix + refactor**: the guards and codes change behaviour (README rule 3 "Fix"), removing the `Actor` parameter is a signature refactor that must leave every authorization outcome unchanged.

## 2. Branch, dependencies, conflicts

- Branch from `main` **after WP03 is merged**: `fix/wp04-casting-validation-actor`. If WP03 is not merged, stop (README rule 9). Do not run in parallel with WP03 or WP02, and WP12 (module split) must wait for this package.
- Reserved for change 2b: no permission names/sets added, renamed or removed, no `membership` CHECK change, no `getResidentList` / `getNavigationAccess` change. You change **how** the actor is derived, never **which** permission a function requires.
- `Actor` in `src/modules/identity/repository.ts:29` and the identity functions that take it (`createResidentProfile`, `transitionResidentProfileStatus`, ...) are **out of scope**. Only casting's `Actor` goes away; the duplicate declaration problem is resolved by casting no longer declaring one.
- Action layer files you must touch only to drop the `actor` argument: `src/app/(org)/rooms/actions.ts`, `src/app/(org)/rounds/new/actions.ts`, `src/app/(org)/settings/actions.ts`, and `scripts/seed-demo-household.ts`. Everything else in those files (error mapping, `as RoomStatus` cast at `rooms/actions.ts:56-66`, input validation) belongs to **WP08**; leave it.

## 3. Read first

1. `CLAUDE.md`, `.claude/rules/implementation-hazards.md` (especially "A sibling entry", "Tests that can fail", "Every writer of the same state, pairwise"), `.claude/rules/guardrail-lints.md`.
2. `audit/technical-debt.md` findings #4, #5, #26, #29.
3. `src/modules/casting/repository.ts` after WP03 (locate by function name; line numbers below are from `main @ 3401c94` and shifted by WP03): `createRoom`, `renameRoom`, `transitionRoomStatus`, `removeRoom`, `insertDraftRoundTx`, `createRound`, `openRoundTx`, `openRound`, `createAndOpenRound`, `addResidentToRound`, `getRoundForSession`, `getRoundParticipants`, `updateHouseholdSettingsWithProcedureLock`, `forceChangeSettingWhileRoundOpen`, `hasProcedureChangedNotice`, plus the already-correct pattern in `captureApplication` / `transitionApplication` (actor from `context`, `isUuid` guard, coded error, household predicate).
4. `src/modules/identity/repository.ts`: `assertHasPermission`, `assertHasPermissionTx` (`(tx, context, permission)`), `PermissionDeniedError`; `src/db/session-context.ts`: `isUuid`.
5. `src/modules/casting/schema.ts` (`room`, `castingRound`, `roundParticipation`), `src/modules/identity/schema.ts` (`residentProfile`, status enum `prepared | active | moved_out | removed`).
6. Tests that exercise these functions: `tests/integration/policy/room-round-authorization.test.ts`, `room-household-scoping.test.ts`, `room-independence.test.ts`, `authorization-matrix.test.ts` (lines ~194-420: the casting mutator cases and the "NOT_APPLICABLE_CASTING" read list), `procedure-lock.test.ts`, `round-visibility-household-account.test.ts`, `round-household-scoping.test.ts`, `tests/unit/casting/quorum-denominator.test.ts`, `round-malformed-id.test.ts`, `round-participant-list.test.ts`, `round-open-preconditions.test.ts`, `room-rename.test.ts`, `create-and-open-round-permission-error.test.ts`.

## 4. Current state (verified 2026-10-01 on main @ 3401c94)

- `Actor` is declared at `casting/repository.ts:29-32` and again at `identity/repository.ts:29` (identical shape). Ten casting exports take it: `createRoom`, `renameRoom`, `transitionRoomStatus`, `removeRoom`, `createRound`, `openRound`, `createAndOpenRound`, `addResidentToRound`, `updateHouseholdSettingsWithProcedureLock`, `forceChangeSettingWhileRoundOpen` (plus the private `insertDraftRoundTx`, `openRoundTx`). Each starts with `if (!actor.accountId) throw new Error(...)` and `assertHasPermission(context, actor.accountId, ...)` outside the transaction (WP03 moves four of them inside).
- `actor.profileId` is written into `activity_event.actor_profile_id` by all of them and compared with nothing. `assertHasPermission` compares only `accountId` with `context.accountId`.
- About **220** call sites pass an actor (`grep -rnE "\b(createRoom|renameRoom|transitionRoomStatus|removeRoom|createRound|openRound|createAndOpenRound|addResidentToRound|updateHouseholdSettingsWithProcedureLock|forceChangeSettingWhileRoundOpen)\(" tests src scripts`): three server actions, `scripts/seed-demo-household.ts`, `tests/helpers/pipeline.ts`, and ~25 test files. `tsc` covers `**/*.ts` (`tsconfig.json`), so removing the parameter turns every leftover call into a compile error that `npm run verify` reports.
- `renameRoom` / `transitionRoomStatus` / `removeRoom` filter only by `eq(room.id, roomId)` (`:558-660`). `removeRoom` also interpolates `${roomId}::uuid`, so a non-UUID id raises a raw cast error. `renameRoom` and `transitionRoomStatus` throw `new Error(\`Room not found: ${roomId}\`)` (`:572`, `:600`); `openRoundTx` throws `new Error(\`CastingRound not found: ${roundId}\`)` (`:733`). The audit cites line 599 for the second; it is 600 (inaccurate by one).
- `insertDraftRoundTx` (`:673`) writes `roomIds` as given: no check that the ids are UUIDs, exist, or belong to the household. `openRoundTx` later reads covered rooms with `inArray(room.id, round.roomIds)`; unknown ids silently count as nothing.
- `addResidentToRound` (`:853`) inserts into `round_participation` with `roundId` and `residentProfileId` unchecked. There are no foreign keys, so a missing round, a draft/closed round, or a profile of another household produces a row (it would inflate the quorum denominator). The existing test `quorum-denominator.test.ts` adds an **unclaimed `prepared`** profile successfully (`createResidentProfile` -> `addResidentToRound`), so "live resident" must include `prepared`.
- `getRoundParticipants` (`:950`) returns `[]` for a profile-less session; otherwise its query has no household predicate and no `isUuid`. `hasProcedureChangedNotice` (`:1280`) filters by event type and subject id only. `getRoundForSession` (`:909`) already has `isUuid`; its resident branch (`select ... where eq(castingRound.id, roundId)`) and its admin-view branch (`SELECT * FROM casting_round_admin_view WHERE id = ...`) lack the household predicate (`listRoundsForSession` has `household_id = ...`).
- Server actions: `rooms/actions.ts` calls the four room functions and does not catch; an error reaches Next's error boundary. `rounds/new/actions.ts` catches `RoundOpenPreconditionError` (exhaustive `switch` on `err.code` with `_exhaustive: never`) and `PermissionDeniedError`. `settings/actions.ts` catches every `Error` generically. Nothing in `src/` or `tests/` matches on the strings `Room not found` / `CastingRound not found`.
- `openspec/specs/` has no capability spec for rooms, rounds or settings (`casting/` has `application-capture`, `application-pipeline`, `household-account-visibility` only). `identity/permissions/spec.md` names permissions, not call shapes. No spec text changes (section 6, Phase C).

## 5. Package-specific hazards

- **A sibling entry** (hazards file): every guard goes in the repository function, for every sibling. When you add `isUuid` + predicate to a mutator, grep for its sibling reads; `getRoundParticipants`, `hasProcedureChangedNotice` and `getRoundForSession` are the known siblings, `listRooms` / `listRoundsForSession` already have the predicate.
- **Assert codes, not end states.** A refusal reached by the wrong path looks identical otherwise. Every new test asserts the error **class and `code`**, and that nothing was written (row count, no audit event).
- **RLS makes the household predicate unobservable** through the public API: removing `eq(room.householdId, ...)` does not change any result, because RLS already hides the other household's rows. Tests for the predicates are therefore **invariant guards** and must be labelled so; they cannot be made red by a deliberate break. The `isUuid` guards and the new codes **can** be (malformed id, unknown id), and those are the regression tests. Say this in the PR; do not fake a break.
- **Never include an id in an error message** (D4 "no value leaves in an error", and #29 itself). Codes only.
- **Do not weaken `authorization-matrix.test.ts`.** It iterates `Object.keys(castingRepo)` and fails when an export has no recorded decision. The classifier tests (`NOT_APPLICABLE_CASTING`, `CASTING_CASE_NAMES`) must keep covering every export; adding an export (a new error class is a class, not a plain function, and is excluded) needs no change, a new function would.
- **Ordering for WP03's lock order still holds.** Where you add a lock (`addResidentToRound` locks the round `FOR SHARE`), it comes after the membership lock (position 1) and after any settings lock, in the five-step order WP03 documented in `repository.ts`.
- **Temporary validation of a caller-supplied actor must not become permanent.** The "validate" step (B2) exists only to prove, before the parameter is removed, that no caller relied on a mismatching actor. It is deleted in the removal commits.
- **Tests that call with a mismatching actor.** The matrix case "createRoom refuses a resident's own session spoofed with the admin's accountId" (`authorization-matrix.test.ts:~286`) passes `spoofedActor` and expects `PermissionDeniedError`. After removal the scenario cannot exist. It must be **changed in the same commit** that removes `actor` from `createRoom`: replace it with a case that proves the audit actor is `residentCtx.accountId` (see A1) or delete it with an explanation in the commit body. Do not leave it passing vacuously.

## 6. Plan

### Phase A — characterization / failing tests

Write all of Phase A first, run it, and record red/green per test. Do not commit a red test; each test is committed together with the step in Phase B that turns it green (README rule 8). Use `registerTestHousehold`, `createTestModerator`, `claimResidentProfile`, `cleanupAll` exactly as the neighbouring tests do. Random ids come from `randomUUID()`.

**A1 — `tests/integration/policy/casting-actor-from-context.test.ts` (finding #5).**
- For each of `createRoom`, `renameRoom`, `transitionRoomStatus`, `removeRoom`, `createRound`, `openRound` / `createAndOpenRound`, `addResidentToRound`, `updateHouseholdSettingsWithProcedureLock`, `forceChangeSettingWhileRoundOpen`: call it with a correct context (household for rooms/settings, moderator for rounds), read the resulting `activity_event` row for the subject (`withSessionContext(hh.context, tx => tx.select().from(activityEvent).where(eq(activityEvent.subjectId, id)))`), assert `actorAccountId === context.accountId` and `actorProfileId === context.profileId`. **Green today** (when the actor is correct); it pins the audit contract before any refactor and keeps asserting it after the parameter is gone.
- Mismatch cases (red today, green after B2): call `renameRoom(hh.context, room.id, "X", { accountId: hh.accountId, profileId: <someOtherProfileUuid> })`. Today it resolves and the audit row carries the foreign profile id. After B2 it rejects with `PermissionDeniedError` and writes no event. Repeat for `createRound` (moderator context + actor with a different `profileId`). Deliberate break after the fix: delete the mismatch check.
- After B3-B5 the mismatch cases cannot be written (no parameter). Delete them in the commit that removes the parameter and keep the correct-context assertions. Say so in the commit body.

**A2 — `tests/integration/policy/room-mutator-validation.test.ts` (finding #4 rooms, #29).**
- `renameRoom`, `transitionRoomStatus`, `removeRoom` called with: (a) `"not-a-uuid"`, (b) a random well-formed unknown uuid, (c) the id of a room of **another household** `hhB`. Assert each rejects with `RoomNotFoundError`, `err.code === "room_not_found"`, `err.message` does not contain the id; the room in `hhB` is unchanged (label/status/`deleted_at`) and household A has no new `room.*` event for that id.
- Today: (a) red (raw Postgres cast error on `removeRoom`; `eq(room.id, "not-a-uuid")` also errors in the driver on the other two), (b) and (c) red (plain `Error`, not the class). Deliberate break: remove the `isUuid` guard (for a) or throw `new Error` instead of the class (for b, c). The household predicate in (c) is a labelled invariant guard (RLS also hides the row; see hazards).
- Permission precedes validation: with a plain resident context and a malformed id, assert `PermissionDeniedError` (not `RoomNotFoundError`). Green today for `renameRoom`; this pins that a resident learns nothing about ids.

**A3 — `tests/integration/policy/round-participant-add-validation.test.ts` (finding #4 `addResidentToRound`).**
- Setup: household, moderator, room, a round opened via `createAndOpenRound`, a second **draft** round (`createRound`), a claimed resident `R1` in the household, a second household `hhB` with its own profile `P_B`.
- Cases (all via `mod.context`): malformed round id, unknown round id, round of `hhB` -> `RoundNotFoundError` (`code === "round_not_found"`); the draft round -> `ParticipantAddError`, `code === "round_not_open"`; unknown profile id, malformed profile id, `P_B` (other household), a profile with status `moved_out` or `removed` (use `setMovedOut` / `removeMember` from `identity/repository`, as `round-participant-list.test.ts` does) -> `ParticipantAddError`, `code === "profile_not_eligible"`. For every refusal assert no `round_participation` row exists for that pair and no `casting_round.participant_added` event.
- Still green (pins existing behaviour, must stay green): adding a **`prepared` (unclaimed)** profile to the open round works (`quorum-denominator.test.ts`), adding an already-present resident returns the existing row without a duplicate, the household account (`hh.context`) is refused for lack of `close_round` (`room-round-authorization.test.ts`).
- Today: every refusal case is **red** (the insert succeeds; for a foreign profile it writes a row with `householdId = A` and a profile of B). Deliberate breaks: skip the round-status check; skip the profile household predicate.

**A4 — `tests/integration/policy/round-room-ids-validation.test.ts` (finding #4 `insertDraftRoundTx`).**
- `createRound` and `createAndOpenRound` with `roomIds` containing: a malformed string, an unknown uuid, a room of another household -> `RoomNotFoundError`; with `createAndOpenRound` assert **no draft round is left behind** (count `casting_round` rows for the household before and after; this pins the orphan-draft guarantee of `round-open-atomicity-orphan-draft.test.ts`).
- Pins that must stay green: `roomIds: []` still creates a draft and `openRound` still fails with `RoundOpenPreconditionError` `no_rooms_selected` (EC-1.1); an existing room that is `occupied` / `not_available` still gives `rooms_unavailable`; a room **removed in the same household** is accepted by `createRound` (decision D1 below) and rejected at open with `rooms_unavailable` (WP03 behaviour).
- Today: the three `RoomNotFoundError` cases are red (the draft is created; `createAndOpenRound` ends in `rooms_unavailable`). Break: skip the existence check.

**A5 — `tests/unit/casting/round-read-guards.test.ts` (finding #26; style of `round-malformed-id.test.ts`, no DB needed for the malformed cases).**
- With a fabricated `SessionContext` (resident, `profileId` set): `getRoundParticipants(ctx, "not-a-uuid")` resolves `[]`; `hasProcedureChangedNotice(ctx, "not-a-uuid")` resolves `false`. No query must run: because the context is fabricated, a query would fail on RLS/auth, so a resolved value proves the guard. Today: **red** (Postgres cast error). Break: remove the guard.
- `tests/integration/policy/casting-read-household-predicates.test.ts`: with two households, a round id of `hhB` read from `hhA`'s resident context gives `[]`, `false`, and `getRoundForSession` gives `null` for both a resident and the household account. Green today (RLS); labelled invariant guards, no deliberate break possible. Also assert `getRoundParticipants(hhA.context /* profileId null */, round.id)` still returns `[]` (G-D15, pinned by `round-visibility-household-account.test.ts`).

**A6 — `tests/unit/casting/casting-not-found-errors.test.ts`.**
- `new RoomNotFoundError()` / `new RoundNotFoundError()`: `name`, `code` (`"room_not_found"`, `"round_not_found"`), message contains no uuid pattern (`/[0-9a-f]{8}-/i`). Integration: `openRound(mod.context, randomUUID(), ...)` and with `"not-a-uuid"` reject with `RoundNotFoundError`. Today: red (plain `Error` / cast error).

Run the existing suites listed in section 3 item 6 before and after; they must pass unchanged except the call-site edits described below.

### Phase B — change

Decisions (the human can overrule; record them in the hand-back):
- **D1.** `insertDraftRoundTx` rejects malformed, unknown and other-household room ids, but **accepts a removed room of the same household** (it is then unavailable at open, `rooms_unavailable`, inline in the form). Reason: a form rendered before a room was removed must produce the existing inline message, not the error page.
- **D2.** "Live resident" for `addResidentToRound` means a `resident_profile` of this household whose status is not in `NAME_RELEASING_STATUSES` (`moved_out`, `removed`), i.e. `prepared` or `active`. Reason: the existing quorum test adds a `prepared` profile on purpose.
- **D3.** New error classes: `RoomNotFoundError` (`code = "room_not_found"`), `RoundNotFoundError` (`code = "round_not_found"`), and `ParticipantAddError` (`code: "round_not_open" | "profile_not_eligible"`). Three, no base class (YAGNI): they carry no data and mirror the existing `ApplicationCaptureError` / `ApplicationTransitionError` shape (`code` field, id-free message). `ProfileRequiredError`'s style is the template.

**B1. `refactor(casting): export coded RoomNotFoundError and RoundNotFoundError`** (#29; A6 green)
- Add the classes next to `RoomInUseByOpenRoundError`. Replace the three plain throws (`renameRoom`, `transitionRoomStatus`, `openRoundTx`). No other behaviour change in this commit. Keep `HouseholdSettings not found` as the plain `Error` it is (a corrupted-household condition, not a lookup miss).

**B2. `fix(casting): validate a caller-supplied actor against the session context`** (temporary; A1 mismatch cases green)
- Add a private helper `assertActorMatchesContext(context, actor, permission)` used at the top of each of the ten functions: `if (actor.accountId !== context.accountId || actor.profileId !== context.profileId) throw new PermissionDeniedError(permission)`. Make the parameter `actor?: Actor`; when it is absent skip the check. Writes use `context.accountId` / `context.profileId` for `actorAccountId`, `actorProfileId`, `createdBy...`, `updatedByAccountId` (settings), never `actor.*`.
- Run `npm run verify`. **Every test that fails here relied on a mismatching actor.** List them in the hand-back. Fix the test (change the actor to match), never the check, except the spoofed-actor matrix case (see hazards).
- This commit proves the migration is safe: afterwards the `actor` argument carries no information.

**B3. `fix(casting): move the remaining permission checks into the write transaction`** (#5 TOCTOU, one function per commit if you prefer, same message pattern)
- Functions not done by WP03: `createRoom`, `renameRoom`, `transitionRoomStatus`, `createRound`, `addResidentToRound`, `forceChangeSettingWhileRoundOpen`, and `listOrganisationTasks` is **not** touched (it intentionally maps `PermissionDeniedError` to `[]` and is a read). Pattern: `return withSessionContext(context, async (tx) => { await assertHasPermissionTx(tx, context, "<permission>"); ... })`. Remove the now-unused `assertHasPermission` import only if nothing else uses it (`listOrganisationTasks` does).
- Permissions are unchanged: `manage_rooms` (rooms), `close_round` (`createRound`, `addResidentToRound`), `manage_settings` (`forceChange...`).

**B4. `fix(casting): household predicate and isUuid guard on the room mutators`** (#4; A2 green)
- At the top of `renameRoom`, `transitionRoomStatus`, `removeRoom`, **after** the permission check inside the tx (so a resident with no permission gets `PermissionDeniedError`, A2's last case): `if (!isUuid(roomId)) throw new RoomNotFoundError();`. Every `room` query gets `and(eq(room.id, roomId), eq(room.householdId, context.householdId), isNull(room.deletedAt))`. `removeRoom` replaces the `${roomId}::uuid = ANY(...)` fragment by a parameter that is already validated (keep the cast, it is safe once `isUuid` passed) and throws `RoomNotFoundError` when the locked room select (added by WP03) returns no row, before the open-round check. Note: `renameRoom` today renames a removed room; the `deletedAt` predicate makes that `RoomNotFoundError`. That is a deliberate tightening, name it in the commit body and check `room-rename.test.ts` / `room-independence.test.ts` still pass.
- Subject ids in `recordActivityEvent` stay `roomId`.

**B5. `fix(casting): validate roomIds when creating a round`** (#4; A4 green)
- In `insertDraftRoundTx`, before the insert: dedupe `roomIds`; if any is not `isUuid` throw `RoomNotFoundError`; `const found = await tx.select({ id: room.id }).from(room).where(and(inArray(room.id, ids), eq(room.householdId, context.householdId)))`; if `found.length !== ids.length` throw `RoomNotFoundError`. Empty array skips the query. Do not filter `deletedAt` (decision D1). Store the deduped array.

**B6. `fix(casting): validate round and profile in addResidentToRound`** (#4; A3 green)
- Inside the tx after the permission check: `isUuid` on both ids (else `RoundNotFoundError` / `ParticipantAddError("profile_not_eligible")`); select the round `FOR SHARE` with `and(eq(id), eq(householdId, context.householdId))` (none -> `RoundNotFoundError`; `status !== "open"` -> `ParticipantAddError("round_not_open")`); select the profile with `and(eq(residentProfile.id, ...), eq(residentProfile.householdId, context.householdId), notInArray(status, [...NAME_RELEASING_STATUSES]))` (none -> `ParticipantAddError("profile_not_eligible")`). Then the existing insert / on-conflict logic. `NAME_RELEASING_STATUSES` is exported from `identity/transitions.ts`; importing a constant across the module line is allowed here (casting already imports `identity/schema`), but do not add new table access beyond `residentProfile` (WP12 owns the identity API).

**B7. `fix(casting): household predicate and isUuid guard on round reads`** (#26; A5 green)
- `getRoundParticipants`: after the existing `profileId === null` return, `if (!isUuid(roundId)) return [];` and add `eq(roundParticipation.householdId, context.householdId)` and `eq(residentProfile.householdId, context.householdId)`.
- `hasProcedureChangedNotice`: `if (!isUuid(roundId)) return false;` and `eq(activityEvent.householdId, context.householdId)`.
- `getRoundForSession`: resident branch `and(eq(castingRound.id, roundId), eq(castingRound.householdId, context.householdId))`; admin-view branch `WHERE id = ${roundId}::uuid AND household_id = ${context.householdId}::uuid`. The existing `isUuid` check at the top stays.

**B8. `refactor(casting): remove the Actor parameter from the room, round and settings functions`** (#5 removal; ~220 call sites)
- Do it **one function per commit**, in this order: `createRoom`, `renameRoom`, `transitionRoomStatus`, `removeRoom`, `createRound`, `openRound`, `createAndOpenRound`, `addResidentToRound`, `updateHouseholdSettingsWithProcedureLock`, `forceChangeSettingWhileRoundOpen`. In each commit: delete the parameter, the `if (!actor.accountId)` line, the B2 helper call and any `actor` use inside; run `npx tsc --noEmit` and fix every reported call site (`src/app/(org)/...`, `scripts/seed-demo-household.ts`, `tests/**`). `npm run verify` must be green at the end of each commit. A mechanical sed over a whole file is fine only if `tsc` and the full suite then pass; do not batch several functions into one commit.
- When the last function is done: delete `export interface Actor` from `casting/repository.ts` and the B2 helper; `grep -rn "Actor" src/modules/casting` must be empty. Identity's `Actor` stays.
- Remove the `actor`/`modActor` locals in tests that become unused (lint will flag them). Keep each test's intent: where a test built an actor to prove the refusal of a resident, the refusal still comes from the resident's `context` (see `room-round-authorization.test.ts` comments).
- In the three server actions drop the `actor` object and argument only. `rooms/actions.ts` keeps `requireRoomsAccess`; do not touch error handling (WP08).
- Delete the A1 mismatch cases and the spoofed-actor matrix case here, in the `createRoom` commit, as described in hazards.

### Phase C — follow-through

- `test/guarded.manifest.json`: untouched. None of G-D1-G-D15 is added or moved by this package. G-D15 stays implemented via `round-visibility-household-account.test.ts` (keep it green; do not edit it other than call-site arguments).
- `authorization-matrix.test.ts`: only argument changes and the spoofed-actor case. `NOT_APPLICABLE_CASTING` and `CASTING_CASE_NAMES` keep covering every exported function; the new classes are not plain functions.
- `openspec/specs/`: no rooms/rounds/settings spec exists; nothing to update, and do not create one. If you believe a spec statement is now false, search `openspec/specs/casting/household-account-visibility/spec.md` (it mentions round visibility for the household account) and the identity permission specs, and stop to report rather than edit (README rule 7).
- Action-layer behaviour changes to record in the PR description, no code: a malformed or unknown id on a room action now throws `RoomNotFoundError` (a coded error) instead of a raw database error or a plain `Error`; since `rooms/actions.ts` does not catch, Next's error boundary still shows, mapping to a message is WP08. `rounds/new/actions.ts` can now see `RoomNotFoundError` from a tampered form post; it propagates as before (an unmapped throw, as `RoundNotFoundError` is impossible on that path). Settings errors still map to the generic message.
- `docs/`, `.claude/rules/`: untouched. Optional one-line proposal in the hand-back for `.claude/rules/implementation-hazards.md` ("F1 mutators derive the actor from `context`; no caller-supplied actor") for the human to apply.

## 7. Acceptance criteria

- [ ] A1-A6 seen red against unmodified code where a red is possible, then green after the named step; invariant guards labelled as such; deliberate breaks recorded for every test that has one.
- [ ] `RoomNotFoundError`, `RoundNotFoundError`, `ParticipantAddError` exist, carry `code`, and never include an id in `message`.
- [ ] `renameRoom`, `transitionRoomStatus`, `removeRoom`: permission first (inside the tx), then `isUuid`, then queries with `householdId` and `deletedAt IS NULL`.
- [ ] `addResidentToRound` refuses a missing, malformed, foreign or non-open round and an unknown, malformed, foreign, moved-out or removed profile; a `prepared` profile and a duplicate add still work exactly as before.
- [ ] `insertDraftRoundTx` refuses malformed, unknown and foreign room ids; `roomIds: []` and removed same-household rooms behave as in D1; `createAndOpenRound` leaves no orphan draft on refusal.
- [ ] `getRoundParticipants`, `hasProcedureChangedNotice`, `getRoundForSession` (both branches) carry the household predicate; the first two have the `isUuid` guard.
- [ ] No casting function takes an `Actor`; `grep -rn "Actor" src/modules/casting` is empty; audit rows carry `context.accountId` / `context.profileId` (A1 correct-context assertions green).
- [ ] Every casting mutator checks its permission via `assertHasPermissionTx` inside its write transaction (grep: no `assertHasPermission(` left in casting except `listOrganisationTasks`).
- [ ] No permission names/sets, membership CHECKs or role-gated reads touched; no migration; `docs/` and `test/guarded.manifest.json` untouched.
- [ ] Existing tests changed only by dropping the actor argument, the spoofed-actor case, and any test that relied on a mismatching actor (listed with reasons in the hand-back). None weakened or skipped.
- [ ] `npm run verify` green after every commit.

## 8. Out of scope & stop conditions

Out of scope: the `as RoomStatus` cast and input validation in the actions, error-to-message mapping, `(org)/error.tsx` (WP08); identity's `Actor` and its callers; moving casting's reads of identity tables behind an identity API, splitting `repository.ts`, making `forceChangeSettingWhileRoundOpen` private (WP12); the lock work of WP03; permission names and role checks (change 2b); a Supabase/DB constraint that would enforce "participant profile belongs to the round's household" (a trigger would be a human-gated migration, propose it in the hand-back instead).

Stop and report (README rule 9) if: WP03 is not merged or `repository.ts` differs materially from section 4; B2 shows a **production** caller relying on a mismatching actor; a step needs `authorization-matrix.test.ts` weakened rather than adjusted; the human decisions D1-D3 turn out to conflict with a test you cannot change; any step seems to need a permission-name change or touches a file reserved for 2b; the 220-call-site migration cannot be kept green per function.

## 9. Hand-back report (template)

```
WP04 hand-back
Branch / PR:
Prerequisite: WP03 merged at <hash>
Commits (hash + message, in order; B8 one per function):
Decisions applied: D1 (removed rooms at draft) / D2 (prepared counts as live) / D3 (three error classes) - overruled? 
Tests added (A1..A6): per test - red-today? failing assertion; deliberate break used; labelled invariant guards (no break possible)
Tests that relied on a mismatching actor (found by B2) and how each was fixed:
Existing tests changed beyond dropping the actor argument, with reasons:
Behaviour changes for the action layer (as listed in Phase C):
Anything the audit claimed that was inaccurate (e.g. line 599 vs 600):
npm run verify: pass/fail counts, duration
Open questions / skipped / proposed DB constraint for participant-household pairing (not applied):
Proposed hazards-file one-liner (not applied):
```
