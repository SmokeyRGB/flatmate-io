# Bug Verification: Move-out and session/membership revocation not atomic

- **Slug**: identity-moveout-session-revocation-not-atomic
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

`setMovedOut` and `removeMember` now run their status transition and membership/session
revocation inside one shared `withSessionContext` transaction (via the new
`transitionResidentProfileStatusTx`/`revokeMembershipForProfileTx` helpers), matching the
`createAndOpenRound` idiom the assessment pointed to. Full test suite, type-check, and the
session-context lint all pass with no regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Code review of `setMovedOut`/`removeMember` in `src/modules/identity/repository.ts` | pass | Both functions now open exactly one `withSessionContext` call that wraps the lookup, `transitionResidentProfileStatusTx`, and `revokeMembershipForProfileTx`; a throw anywhere inside rolls the whole `tx` back, so `moved_out` can no longer commit without the membership/session revocation also committing. No live crash-injection repro was run (no fault-injection seam exists in this module — see Residual Risks). |
| Existing V-3 test | `npx vitest run tests/unit/identity/moved-out-session-revocation.test.ts` | pass | Both cases (soft `setMovedOut` and hard `removeMember` tiers) still pass unchanged. |
| Identity unit suite | `npx vitest run tests/unit/identity` | pass | 11 files, 27 tests. |
| Identity integration/policy suite | `npx vitest run tests/integration/policy/identity-household-scoping.test.ts tests/integration/raw-sql/identity-household-scoping.test.ts tests/integration/policy/household-account-identity.test.ts` | pass | 3 files, 3 tests. |
| Full regression suite | `npx vitest run` | pass | 57 files, 120 tests — no regressions anywhere in the repo. |
| Type-check | `npx tsc --noEmit -p .` | pass | No type errors. |
| Session-context lint | `npx tsx scripts/lint/session-context.ts` | pass | "Session-context lint: OK" — confirms no new raw `SET`/`SET LOCAL` call was introduced outside `db/session-context.ts`. |

## Output Excerpts

```
 Test Files  57 passed (57)
      Tests  120 passed (120)
```

## Residual Risks

- No automated test directly injects a mid-transaction failure (e.g. forcing the session UPDATE to
  throw) to prove the rollback path specifically — atomicity is verified by code review (single
  `tx` shared across all writes) plus the existing end-to-end V-3 assertions, not by a synthetic
  fault-injection test. Flagged as a follow-up in `fix.md`.
- `reactivateMember` and the claim-step `prepared -> active` transition were not touched by this
  fix (they only ever needed `transitionResidentProfileStatus`'s standalone wrapper, not the
  revocation pairing) — confirmed via test suite pass, no behavior change expected or observed.

## Recommendation

Close the bug — verified via full regression suite (120/120 passing), type-check, and the
existing V-3 session-revocation tests, with the transaction-boundary fix confirmed by code review
against the `createAndOpenRound` pattern this codebase already uses elsewhere.
