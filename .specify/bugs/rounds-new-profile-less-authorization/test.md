# Bug Verification: profile-less household session can create/open a casting round

- **Slug**: rounds-new-profile-less-authorization
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: failed

## Summary

No fix was applied (`fix.md` status: `not-applied`) — the assessment's proposed remediation was
implemented, then reverted after it broke 9 tests across 3 files (including a `[GUARDED]`
invariant) and made `EC-1.3`'s test scenario logically unbuildable. The original symptom therefore
still reproduces: a profile-less household session can still create/open a `CastingRound`, exactly
as before this bug-fix pass. This is expected and intentional, not an oversight — see `fix.md`'s
"Why It Was Reverted" and "The Underlying Tension" sections.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Manual code read: `createRound`/`openRound`/`createAndOpenRound` in `src/modules/casting/repository.ts` | fail (symptom persists) | Still gated only by `assertHasPermission(..., "close_round")`; no `assertHasResidentProfile` call present — unchanged from before this bug's assessment. |
| New / updated tests | none added (fix reverted before any test was written) | not-run | No test exists asserting the desired refusal, since the guard that would make it true was reverted. |
| Regression suite (during the attempted fix) | `npx vitest run tests/unit/casting/round-open-preconditions.test.ts tests/integration/policy/round-open-atomicity.test.ts tests/integration/policy/round-household-scoping.test.ts` (with the guard applied) | fail | 9/9 failed with `PermissionDeniedError: this route requires an active resident profile (FR-1.23)` — this is the evidence that led to the revert. |
| Regression suite (post-revert) | same command, guard removed | pass | 9/9 passed — confirms the revert left the repository in exactly its pre-bug-3 state (post-bug-2) with no new breakage. |
| Type-check / lint (post-revert) | `npx tsc --noEmit`, `npx eslint src/modules/casting/repository.ts` | pass | No errors; codebase is clean at the reverted state. |

## Output Excerpts

```
✗ (guard applied) PermissionDeniedError: this route requires an active resident profile (FR-1.23)
    at assertHasResidentProfile src/modules/identity/repository.ts:581:11
    at createRound src/modules/casting/repository.ts:249:3
Test Files  3 failed (3)
     Tests  9 failed (9)
```

```
✓ (post-revert) Test Files  3 passed (3)
                     Tests  9 passed (9)
```

## Residual Risks

- The authorization gap Copilot flagged is real per a literal reading of FR-1.23/FR-1.24/S-50 (see
  `fix.md`), and remains unaddressed in the codebase after this session. A profile-less household
  session can still create and open casting rounds via `src/app/(org)/rounds/new/actions.ts`.
- Any future attempt to close this gap must first resolve whether `EC-1.3` ("zero eligible
  residents") is meant to be reachable only via the profile-less path (as today) or needs a
  redesigned scenario (e.g., a resident who becomes ineligible after round creation) — otherwise
  the same regression will recur.

## Recommendation

Reopen — the symptom still reproduces by design (the fix was reverted, not applied). Do not
re-run `/speckit-bug-fix` on the existing assessment as-is; instead re-run `/speckit-bug-assess`
(or escalate to a human ADR-style decision per `docs/SPEC-INDEX.md`'s precedence process) to
settle whether `close_round`'s implicit grant to `household_admin` is intentionally exempt from
FR-1.23, or whether `EC-1.3`'s test scenario needs to be redesigned alongside the guard. This
falls under the constitution's guidance to report and stop rather than route around a hard-floor
finding when a task can only be "fixed" by breaking a `[GUARDED]` test.
