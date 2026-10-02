# WP03 · Casting concurrency: one lock order for settings, rounds and rooms

> One-line: paste into a fresh Cursor Agent session; read `audit/cursor/README.md` first.

Rule numbers below ("README rule 3") refer to the Ground rules in `audit/cursor/README.md`.

## 1. Goal

Close two races in `src/modules/casting/repository.ts`, and make the rest of the lock story true in code and in comments:

- **Finding #3.** A settings change can commit between `openRoundTx`'s unlocked read of `household_settings` and its commit. The opened round then carries a `settings_snapshot` that differs from the live settings, which invariant I-7 (procedure lock during an open round) forbids. The same hole exists the other way: the settings writer checks "is a round open?" with a plain `SELECT`, so a round that opens right after the check is not seen.
- **Finding #4, lock part only.** `removeRoom` checks "is an open round covering this room?" without a lock, so a concurrent `openRound` / `createAndOpenRound` can cover the room between the check and the delete (EC-1.6). The household predicate / `isUuid` part of #4 is **WP04**.

Done means: one documented lock order used by every casting writer, a deterministic red-then-green test for each race, and the permission check of the touched functions moved into the write transaction.

**Behaviour change, not a refactor.** README rule 3 "Fix": pin what must not change, see the new tests fail against current code, then fix.

## 2. Branch, dependencies, conflicts

- Branch from current `main`: `fix/wp03-casting-concurrency`.
- Depends on: nothing. **WP04 depends on this package** and must not run in parallel with it (same file, same functions). WP02 also must not run in parallel (README table).
- Reserved for change 2b (README, "Not in here"): do **not** add, rename or remove permission names or sets, do not touch `membership` CHECKs, do not change `getResidentList` / `getNavigationAccess`. This package only changes **where** `assertHasPermissionTx` is called, never **which** permission a function requires (`manage_settings`, `manage_rooms`, `close_round` stay exactly as they are).
- No migration is needed. If you think you need one, stop (README rule 9).

## 3. Read first

1. `CLAUDE.md`, `.claude/rules/implementation-hazards.md` (sections "An invariant holds only where it is enforced", "Every writer of the same state, pairwise", "One pooled connection per call chain", "Tests that can fail"), `.claude/rules/guardrail-lints.md`.
2. `audit/technical-debt.md` findings #3 and #4.
3. `src/modules/casting/repository.ts`: the lock-order comments at `captureApplication` (~197-235), `updateApplication` (~330-380), `transitionApplication` (~485-500), then `removeRoom` (~633), `openRoundTx` (~726-818), `createAndOpenRound` (~833), `updateHouseholdSettingsWithProcedureLock` (~979), `forceChangeSettingWhileRoundOpen` (~1034).
4. `src/modules/casting/schema.ts`: the comment on `castingRound.status` (every status writer takes `FOR UPDATE`).
5. `src/modules/identity/repository.ts`: `assertHasPermissionTx` (~485, signature `(tx, context, permission)`), `readLiveMembershipTx` (~474, `FOR SHARE`), `assertHasPermission` (~422, compares `accountId` with `context.accountId`).
6. Tests: `tests/integration/policy/procedure-lock.test.ts`, `room-round-authorization.test.ts`, `room-independence.test.ts`, `round-open-atomicity*.test.ts`, `tests/unit/casting/round-open-preconditions.test.ts`, and the pattern `tests/integration/policy/revoked-membership-sign-in.test.ts` (lines 160-235: a stand-in transaction holds a lock uncommitted while the real call runs).

## 4. Current state (verified 2026-10-01 on main @ 3401c94)

- `openRoundTx` (`repository.ts:726`) locks the round `FOR UPDATE` (`:732`), reads the covered rooms **unlocked** (`:744`), reads the eligible profiles (membership join, unlocked), and reads `householdSettings` **unlocked** (`:774-777`). The snapshot copy is written at `:793-800`.
- `updateHouseholdSettingsWithProcedureLock` (`:979`) calls `assertHasPermission(context, actor.accountId, "manage_settings")` at `:989`, which runs in its **own** transaction before `withSessionContext` opens at `:991`. Inside, the open-round check is a plain `SELECT` (`:993-996`; `:991` is `withSessionContext`), then the `UPDATE` at `:1012`. Nothing is locked except by the `UPDATE` itself.
- `removeRoom` (`:633`): `assertHasPermission` outside the tx (`:635`), then a plain `SELECT` for an open round whose `room_ids` contains the room (`:637-646`), then `UPDATE room SET deleted_at` (`:648`).
- Permission-check shape per function today: `openRound` (`:820`), `createAndOpenRound` (`:833`), `removeRoom`, `updateHouseholdSettingsWithProcedureLock` all use `assertHasPermission` outside the write transaction. The application functions (`captureApplication`, `updateApplication`, `transitionApplication`) use `assertHasPermissionTx` inside it.
- Documented lock order (comments at ~205, ~340, ~485): **membership FOR SHARE -> casting_round -> application FOR UPDATE**. No function locks `casting_round` and then `membership` (`openRoundTx` reads membership without a lock).
- Only `householdSettings` writers in `src/`: `updateHouseholdSettingsWithProcedureLock`, `forceChangeSettingWhileRoundOpen` (test-only bypass of the lock), and `registerHousehold` (insert, `identity/auth.ts:207`). `household_settings` has one row per household (`household_id` primary key) and a `FOR ALL` RLS policy, so `FOR SHARE` / `FOR UPDATE` on it works for the household account and for moderators.
- `room` has no lock anywhere. `transitionRoomStatus` (`:590`) reads the row plain, then updates.
- Audit claim check: finding #3 and the lock part of #4 are **accurate** as written (line numbers match within 1-2 lines).

## 5. Package-specific hazards

- **Deadlock.** Adding a lock in one function without fixing the order of all functions creates a cycle. The order in section 6 is total; every function you touch takes locks in ascending position only.
- **Do not drop a lock** to make a test pass (hazard from PR #39). Do not replace a row lock with an advisory lock.
- **Permission check moves, permission semantics do not.** `assertHasPermission` refuses when `actor.accountId !== context.accountId`; `assertHasPermissionTx` ignores `actor` and also refuses a stale `profileId` claim. Until WP04 removes `actor`, keep the account mismatch check explicit (step B1) so `authorization-matrix.test.ts` ("createRoom refuses a resident's own session spoofed with the admin's accountId" style cases) stays green.
- **The household account has `context.profileId === null`** and holds `manage_rooms` / `manage_settings`; `assertHasPermissionTx` handles it (`null === null`). Moderators hold `close_round` and `manage_rooms`, not `manage_settings`.
- **A removed room.** Locking the covered rooms in `openRoundTx` forces a decision on `deleted_at`: filter it (`isNull(room.deletedAt)`) so a round cannot open on rooms that are already removed (they count as unavailable, EC-1.2). This is a deliberate small behaviour change; name it in the commit body.
- **Test blocking.** A real call that blocks behind a stand-in transaction holds one pooled connection while it waits; the stand-in holds another. Two connections are fine; never nest `withSessionContext` (it throws `NestedSessionContextError`).
- Unique-per-run data only (README rule 6): use `registerTestHousehold()` / `createTestModerator()`, never fixed labels for anything project-wide.
- The Supavisor pooler serialises one-statement transactions by accident (hazards file). Concurrency tests here use the stand-in pattern, not `Promise.all` of the two real calls, except the one clearly labelled invariant guard.

## 6. Plan

### The lock order (decided)

For every casting writer, locks are taken in this order, never backwards:

1. `membership` (own row, `FOR SHARE`, via `assertHasPermissionTx`)
2. `household_settings` (the household's single row): `FOR SHARE` by `openRoundTx`, `FOR UPDATE` by the settings writer
3. `casting_round`: `FOR UPDATE` by status writers, `FOR SHARE` by readers that must see a stable status (`captureApplication`)
4. `room`: `FOR SHARE` by `openRoundTx` (covered rooms), `FOR UPDATE` by `removeRoom` and `transitionRoomStatus`
5. `application`: `FOR UPDATE` by `updateApplication` / `transitionApplication`

Why settings before round: the settings writer has no round id. It asks "is any round of this household open?". Locking round rows first would mean locking every round of the household. The household's single settings row is the natural anchor, and `openRoundTx` can lock it before it locks the round it was given. Why room after round: `openRoundTx` already holds the round when it learns which rooms the round covers (`round.roomIds`); `removeRoom` has only a room id and reads rounds unlocked after taking the room lock (that is safe, see test C2). Cycle check against existing code: no function today holds a lock from a later position and then asks for an earlier one (`removeRoom` and `transitionRoomStatus` take only position 4; `captureApplication` takes 1, 3; application writers take 1, 5; the DB triggers `application_round_same_household` (0025, round share) and `auto_join_open_rounds` (0012, reads open rounds) are entered from positions 1-3 or from identity writers that hold none of 2-4).

Out of scope here: the race between a claim (`auto_join_open_rounds` trigger inserting `round_participation`) and `openRound`'s snapshot insert. Report it if you see it, do not fix it (section 8).

### Phase A — characterization / failing tests

Create **one** new file `tests/integration/policy/casting-lock-order.test.ts` (style: `procedure-lock.test.ts` imports and `afterEach` teardown, `registerTestHousehold`, `createTestModerator`). Shared helper inside the file: `holdOpen(context, fn)` that runs `withSessionContext(context, async (tx) => { await fn(tx); markApplied(); await gate; })` and returns `{ applied, release, done }`, copied in shape from `revoked-membership-sign-in.test.ts:187-210`. After starting the real call, wait `await new Promise(r => setTimeout(r, 1500))`, record whether the real call has settled (a `settled` flag set in `.finally`), then `release()`, `await done`, `await` the real call. Never put teardown in `finally` (README rule 6).

**First, pin what must not change (green today, must stay green).** Run `npx vitest run tests/integration/policy/procedure-lock.test.ts tests/integration/policy/room-independence.test.ts tests/integration/policy/room-round-authorization.test.ts tests/integration/policy/round-open-atomicity.test.ts tests/integration/policy/round-open-atomicity-orphan-draft.test.ts tests/unit/casting/round-open-preconditions.test.ts` and note they are green. These already pin: sequential `ProcedureLockedError`, `RoomInUseByOpenRoundError` (grep `room-independence.test.ts`), the EC-1.1/1.2/1.3 codes, snapshot contents, permission refusals. Add **one** new green-today test in the new file: "a settings change with no open round still succeeds and an open round with no concurrent change still snapshots the live values" (sequential, `quorumShare: "0.6"` then `openRound`, assert `settingsSnapshot.quorumShare === "0.6"`).

**Test C1 — a settings change in flight is waited for by `openRound` (finding #3, opener side).**
- Setup: household `hh`, moderator `mod` (`createTestModerator`), room (household context), draft round via `createRound(mod.context, ...)`.
- Stand-in (household context): in a held transaction `UPDATE household_settings SET quorum_share = '0.9' WHERE household_id = <hh>` (uncommitted; it models a settings writer that already passed its open-round check).
- Real call: `openRound(mod.context, round.id, modActor)`.
- Release the stand-in after the wait. Assert: the round is `open`, `round.settingsSnapshot.quorumShare === "0.9"`, and it equals the live `getHouseholdSettings(hh.context).quorumShare`. Secondary assert (fixed code): the real call had not settled before the release.
- Today: **red**. `openRoundTx` reads the old committed `0.5`, finishes while the stand-in is open, and the snapshot is `"0.5"` while live is `"0.9"`.
- Deliberate break (after the fix) that turns it red again: remove `.for("share")` from the settings select in `openRoundTx`.

**Test C2 — an opener in flight is waited for by the settings writer (finding #3, writer side).**
- Setup as C1 (draft round, nothing open).
- Stand-in (household context): in a held transaction `SELECT ... FROM household_settings FOR SHARE`, then `UPDATE casting_round SET status = 'open', opened_at = now() WHERE id = <round>` (uncommitted; it models `openRoundTx`'s lock protocol).
- Real call: `updateHouseholdSettingsWithProcedureLock(hh.context, { quorumShare: "0.7" }, actor)`.
- Release after the wait. Assert: the real call rejects with `ProcedureLockedError` and `openRoundId === round.id` (`rejects.toMatchObject`, plus `toBeInstanceOf(ProcedureLockedError)`), and `getHouseholdSettings` still shows the old `quorumShare`.
- Today: **red**. The writer's plain `SELECT` sees no open round, blocks only at its `UPDATE` (a `FOR SHARE` conflicts with an `UPDATE`), then writes after the commit and resolves.
- Deliberate break after the fix: remove `.for("update")` from the writer's settings select.

**Test C3 — `removeRoom` does not race an opener (finding #4, direction 1).**
- Setup: household, moderator, room R (status `open` so it is available), draft round covering R.
- Stand-in (household context): `SELECT ... FROM room WHERE id = R FOR SHARE` then `UPDATE casting_round SET status = 'open' ...` for the round (uncommitted).
- Real call: `removeRoom(hh.context, R.id, actor)`.
- Release after the wait. Assert: rejects with `RoomInUseByOpenRoundError`; the room row has `deleted_at IS NULL` (read via `withSessionContext(hh.context, tx => tx.select().from(room)...)`); no `room.removed` event for R.
- Today: **red** (the unlocked check sees no open round, the `UPDATE room` waits for the share lock, then deletes; resolves).
- Break after the fix: remove the `.for("update")` room lock in `removeRoom`.

**Test C4 — an opener does not race `removeRoom` (finding #4, direction 2).**
- Setup: household, moderator, room R only (`open`), draft round covering only R.
- Stand-in (household context): `UPDATE room SET deleted_at = now() WHERE id = R` (uncommitted).
- Real call: `openRound(mod.context, round.id, modActor)`.
- Release after the wait. Assert: rejects with `RoundOpenPreconditionError` whose `code === "rooms_unavailable"`; the round is still `draft`; no `round_participation` rows for it.
- Today: **red** (rooms read unlocked, round opens covering a room that is then removed).
- Break after the fix: remove the room `FOR SHARE` in `openRoundTx`.

**Test C5 — permission is checked inside the write transaction (settings).**
- Setup: household `hh`, nothing else.
- Stand-in (household context): `UPDATE membership SET revoked_at = now(), permissions = '{}' WHERE account_id = <hh.accountId>` (uncommitted; `membership_revoked_holds_nothing` allows this for `household_admin`; verify against `drizzle/0024` line 69 and that the update is not refused by a CHECK, otherwise stop).
- Real call: `updateHouseholdSettingsWithProcedureLock(hh.context, { quorumShare: "0.6" }, actor)`.
- Release after the wait. Assert: rejects with `PermissionDeniedError`, and the live `quorumShare` is unchanged. Read the live value through an `adminClient()`-free path: after the stand-in commits, the household account is revoked, so read via `withSessionContext(hh.context, tx => tx.select().from(householdSettings)...)` (RLS only needs the household id).
- Today: **red** (`assertHasPermission` reads the old committed row in its own tx; the write then succeeds or blocks only at `UPDATE`).
- Break after the fix: put `assertHasPermission` (outside the tx) back.

**Test C6 — same for `openRound` with a demoted moderator.**
- Stand-in: `UPDATE membership SET role = 'member', permissions = '{}' WHERE account_id = <mod.accountId>` (uncommitted).
- Real: `openRound(mod.context, round.id, modActor)`. Assert `PermissionDeniedError`, round still `draft`, no participation rows.
- Today: **red**. Break: as C5.

**Test C7 — labelled invariant guard (not a regression test).** `Promise.all([openRound(...), updateHouseholdSettingsWithProcedureLock(...)])` on a fresh draft round. Assert the invariant only: either (the round is `open` **and** the writer rejected with `ProcedureLockedError` and `snapshot == live`) or (the writer resolved **and** `snapshot == live`). Comment in the test: "invariant guard; the pooler may serialise this by accident (CLAUDE.md hazards), C1-C4 are the regression tests."

Record in the PR description how each of C1-C6 was seen red (command + failing assertion) before the fix, and red again after the named break (README rule 3). Do not commit a red test and do not skip one: `npm run verify` must be green on every commit (README rule 8). Write all tests first and run them red locally, keep those runs in your notes, then commit each test together with the fix it belongs to (B1-B3).

### Phase B — change

**B1. `refactor(casting): check manage_settings/close_round/manage_rooms inside the write transaction`** (only the four functions of this package, behaviour preserved)
- Keep a helper at the top of each function: `if (actor.accountId !== context.accountId) throw new PermissionDeniedError(<permission>);` (replaces the implicit comparison inside `assertHasPermission`; `PermissionDeniedError` is already imported). Keep the existing `if (!actor.accountId) throw new Error(...)` lines.
- Replace `await assertHasPermission(context, actor.accountId, X)` with `await assertHasPermissionTx(tx, context, X)` as the **first statement inside** `withSessionContext`, in: `removeRoom` (`manage_rooms`), `openRound` (`close_round`), `createAndOpenRound` (`close_round`), `updateHouseholdSettingsWithProcedureLock` (`manage_settings`).
- C5 and C6 (permission part) go green here. Run `npx vitest run tests/integration/policy/authorization-matrix.test.ts tests/integration/policy/moderator-permissions.test.ts` and the Phase A "must not change" set.

**B2. `fix(casting): lock household_settings before the round when opening and changing settings`** (C1, C2 green)
- `openRoundTx`: as the very first statement, before the round `FOR UPDATE`:
  ```ts
  const [settings] = await tx.select().from(householdSettings)
    .where(eq(householdSettings.householdId, context.householdId)).for("share");
  if (!settings) throw new Error(`HouseholdSettings not found for household ${context.householdId}`);
  ```
  Delete the later unlocked settings read and use this `settings` for the snapshot. Keep the precondition order for the error codes: the missing-settings throw stays a plain `Error` (unchanged class); `not_in_draft` etc. still come from the round checks.
- `updateHouseholdSettingsWithProcedureLock`: right after the permission check, lock the row `FOR UPDATE` (same select as above, `.for("update")`), then run the existing open-round `SELECT` (unchanged), then the `UPDATE`. Keep `ProcedureLockedError` and its message.
- `createAndOpenRound`: no extra code; the order inside the tx becomes permission (1) -> `insertDraftRoundTx` (new row, invisible to others) -> `openRoundTx` (2, 3, ...). Say in a comment that the freshly inserted round cannot be locked by anyone else, so inserting before taking the settings lock is not a lock-order violation.

**B3. `fix(casting): lock covered rooms when opening a round and when removing a room`** (C3, C4 green)
- `openRoundTx`: replace the unlocked `coveredRooms` select with
  ```ts
  const coveredRooms = await tx.select().from(room)
    .where(and(inArray(room.id, round.roomIds), isNull(room.deletedAt)))
    .orderBy(room.id).for("share");
  ```
  (`orderBy(id)` keeps the order stable if two openers share rooms.) `hasAvailableRoom` then ignores removed rooms. Add the commit-body note about the `deletedAt` filter.
- `removeRoom`: first statement after the permission check: `await tx.select({ id: room.id }).from(room).where(eq(room.id, roomId)).for("update");`. If it returns no row, keep today's behaviour (the open-round check then finds nothing and the `UPDATE` matches zero rows) - **do not** add a new error here (that is WP04, `RoomNotFoundError`). Then the existing open-round check, then the `UPDATE`. Replace the `${roomId}::uuid` fragment only if you must (WP04 adds the `isUuid` guard).
- `transitionRoomStatus`: add `.for("update")` to its `select().from(room)` so a status change is also ordered against an opener (position 4). Its permission check stays outside the tx (WP04, finding #5).

**B4. `docs(casting): record the single lock order`** (comments only, no behaviour)
- Update the `LOCK ORDER` comments in `captureApplication`, `updateApplication`, `transitionApplication` ("membership -> round -> application" becomes the five-step order), the comment on `castingRound.status` in `schema.ts` (add "and the household_settings row is locked before it, `openRoundTx`"), and add a block comment above `openRoundTx` naming the order and the settings/round/room reasons from this file. Do not restate the whole of section 6; cite it once and keep it to the order plus one sentence of why.
- Update the stale "lock order: membership, then casting_round. No existing function locks casting_round and then membership" claim only if it is still true; it is.
- 🛑 HUMAN (optional): a one-line pointer in `.claude/rules/implementation-hazards.md` under "Every writer of the same state, pairwise". The agent proposes the sentence in the hand-back; it does not edit `.claude/rules` itself.

**B5. `test(casting): add the labelled invariant guard (C7)`** and the green-today sequential test, if not already in earlier commits.

### Phase C — follow-through

- `test/guarded.manifest.json`: no G-D invariant is added or changed by this package. Do **not** touch it. (If `guarded-tests.ts` complains, stop.)
- `openspec/specs/`: there is no capability spec for rooms, rounds or settings (`ls openspec/specs/casting` shows `application-capture`, `application-pipeline`, `household-account-visibility`). `identity/permissions/spec.md` states which permissions exist, not where they are checked; nothing to update. Do not create a spec (specs are written lazily when a change touches the capability; this is not an OpenSpec change).
- `docs/`: untouched. `node tools/check-refs.ts` not needed.
- Confirm no new test file is missing from cleanup: the new file creates only households via `registerTestHousehold` (no new table, so `cleanup-inventory` is unaffected).

## 7. Acceptance criteria

- [ ] C1-C6 each seen failing against unmodified `repository.ts` (commands and failing assertions are in the PR description), then green after the fix, then red again under the named deliberate break, then reverted.
- [ ] C7 present and labelled as an invariant guard.
- [ ] `openRoundTx` locks `household_settings` `FOR SHARE` first, the covered rooms `FOR SHARE` (ordered by id, `deleted_at IS NULL`), and its snapshot comes from the locked row.
- [ ] `updateHouseholdSettingsWithProcedureLock` locks `household_settings` `FOR UPDATE` before looking for an open round.
- [ ] `removeRoom` and `transitionRoomStatus` lock the room row `FOR UPDATE`.
- [ ] `openRound`, `createAndOpenRound`, `removeRoom` and the settings writer call `assertHasPermissionTx` as the first statement in the transaction; the `actor.accountId !== context.accountId` refusal is preserved.
- [ ] The five-step lock order appears in the code comments listed in B4 and is the same in all of them.
- [ ] No permission constant, role set or membership CHECK touched; no migration; `docs/` untouched; `test/guarded.manifest.json` untouched.
- [ ] No existing test weakened or deleted. `npm run verify` green after every commit.

## 8. Out of scope & stop conditions

Out of scope (do not do, report if relevant): household predicates and `isUuid` guards on the room mutators, `addResidentToRound` validation, coded `RoomNotFoundError` / `RoundNotFoundError`, removing the `Actor` parameter (all **WP04**); the claim-vs-`openRound` participation race via the `auto_join_open_rounds` trigger; `forceChangeSettingWhileRoundOpen` (test-only bypass, finding #11 / WP12) beyond noting it takes only the implicit settings row lock; moving casting's access to identity tables behind an identity API (WP12).

Stop and report (README rule 9) if: a lock you add makes an existing test hang (a deadlock is a finding, not something to time out around); C5 is refused by a CHECK so the stand-in cannot be written; any step seems to need a permission-name change or touches a file reserved for 2b; `authorization-matrix.test.ts` needs editing to pass; the verified line numbers in section 4 are off by more than a few lines or the code differs in structure.

## 9. Hand-back report (template)

```
WP03 hand-back
Branch / PR:
Commits (one line each, hash + message):
Lock order as implemented (paste the final comment block):
Characterization / new tests (C1..C7): for each - red against which commit, failing assertion, break used to turn it red again
Behaviour changes to name in the PR: (1) settings snapshot now taken under a settings row lock; (2) writer waits on / is refused by an opener; (3) removeRoom waits for an opener; (4) openRound ignores removed rooms (rooms_unavailable); (5) permission is now checked in the write tx for 4 functions
npm run verify: pass/fail counts, duration
Existing tests changed (should be none): 
Open questions / anything skipped / pooler-serialisation observations:
Proposed one-liner for .claude/rules/implementation-hazards.md (not applied):
```
