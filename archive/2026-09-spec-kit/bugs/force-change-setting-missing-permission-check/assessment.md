# Bug Assessment: `forceChangeSettingWhileRoundOpen` skips the `manage_settings` permission check

- **Slug**: force-change-setting-missing-permission-check
- **Created**: 2026-09-17
- **Source**: pasted text (PR review comment)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> src/modules/casting/repository.ts
> Comment on lines +497 to +503: Unlike the other settings mutation, this exported write path only
> checks that `actor.accountId` is present and never verifies `manage_settings` (or an equivalent
> administration permission). It is therefore callable by any signed-in resident through
> repository-level code and bypasses the procedure-lock authorization boundary; enforce the
> intended admin/permission check before the update, even if no current UI exposes this helper.

## Symptom

`forceChangeSettingWhileRoundOpen` (src/modules/casting/repository.ts:490-513) writes to
`householdSettings` for a locked field while a round is open, bypassing `ProcedureLockedError`,
after checking only that `actor.accountId` is truthy. It never calls `assertHasPermission(...,
"manage_settings")`. Any caller with a valid `Actor` — including a plain resident with no granted
permissions — can invoke it directly and force a locked-field change plus write a
`household_settings.changed_while_round_open` activity event, i.e. call the intended
"administrative override, audited" path without administration rights.

Compare with the sibling mutation directly above it, `updateHouseholdSettingsWithProcedureLock`
(:435-483), which was already fixed to require `manage_settings` (see the FR-1.8/G-C comment at
:440-444) and every other mutating export in this file (`createRoom`, `renameRoom`,
`transitionRoomStatus`, `removeRoom`, `createRound`, `openRound`, `addResidentToRound`), which all
call `assertHasPermission` before mutating.

## Reproduction

1. Register a household and claim a plain resident profile with no permissions granted
   (`createResidentProfile` + `claimResidentProfile`, as in the existing test file).
2. Create a room, create a round, open it (these steps need `manage_rooms`/`close_round` from an
   admin actor, or use fixtures that already have an open round).
3. As the unprivileged resident's `Actor`, call
   `forceChangeSettingWhileRoundOpen(context, "quorumShare", "0.9", roundId, actor)`.
4. Observe the write succeeds and `hasProcedureChangedNotice` returns `true` — no
   `PermissionDeniedError` is thrown, unlike the equivalent attempt against
   `updateHouseholdSettingsWithProcedureLock` (see
   `tests/integration/policy/procedure-lock.test.ts:76` for that comparison case).

## Suspected Code Paths

- `src/modules/casting/repository.ts:490-513` (`forceChangeSettingWhileRoundOpen`) — the
  vulnerable export; only checks `actor.accountId` truthiness, never calls `assertHasPermission`.
- `src/modules/casting/repository.ts:435-445` (`updateHouseholdSettingsWithProcedureLock`) — the
  sibling mutation with the correct pattern to mirror (`assertHasPermission(context,
  actor.accountId, "manage_settings")`, called before any read/write).
- `src/modules/identity/repository.ts` (`assertHasPermission`, `PermissionDeniedError`) — the
  guard to reuse; already imported in `casting/repository.ts:5`.
- `tests/integration/policy/procedure-lock.test.ts:64` — the one existing caller of
  `forceChangeSettingWhileRoundOpen` in the test suite; it invokes with the household-creator
  actor (who has admin-implicit permissions), so it will keep passing once the check is added.

## Root Cause Hypothesis

High confidence. This function was added as an administrative override for exercising the
"procedure changed while round open" guarded scenario (per its own header comment at :488-489:
"an administrative bypass path ... not exposed to any normal UI action"). The intent was clearly
that it be admin-only, but the permission check was never added — the accountId-presence check
looks like it was copy-pasted from the pattern used before `updateHouseholdSettingsWithProcedureLock`
got its FR-1.8/G-C fix, and this sibling function was missed in that pass. No UI route currently
calls it, but per project guardrails (G-C: authorization/visibility is a hard floor), an unexported
repository function reachable by any signed-in account is still a live authorization bypass, not
a hypothetical.

## Proposed Remediation

**Preferred**: Add `await assertHasPermission(context, actor.accountId, "manage_settings");`
immediately after the existing `!actor.accountId` guard in `forceChangeSettingWhileRoundOpen`,
mirroring `updateHouseholdSettingsWithProcedureLock` exactly (same permission, same placement
before any read or write). No signature change, no new abstraction — one line, reusing the
already-imported `assertHasPermission`.

**Files likely to change**:
- `src/modules/casting/repository.ts` (add the one-line check inside
  `forceChangeSettingWhileRoundOpen`)

**Tests to add or update**:
- Extend `tests/integration/policy/procedure-lock.test.ts` with a case mirroring the existing
  "refuses a plain resident with no manage_settings permission" test (:76) but calling
  `forceChangeSettingWhileRoundOpen` instead of `updateHouseholdSettingsWithProcedureLock`, asserting
  it rejects with `PermissionDeniedError` for an unprivileged resident actor.
- The existing passing case at :64 already exercises the admin-actor success path and needs no
  change, since the household-creator actor used there already holds `manage_settings`.

## Risks & Considerations

- None expected: no current UI or route calls this function (confirmed — the only other reference
  in the repo is the test file), so adding the check cannot regress a live user flow.
- This is a G-C (authorization) class fix, which the project constitution treats as a hard floor —
  should be fixed directly, not deferred or routed around.

## Open Questions

None.
