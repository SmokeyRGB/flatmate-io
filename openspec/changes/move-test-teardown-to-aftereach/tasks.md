## 1. Single-household, single-`it()` files (design.md shape 1)

- [x] 1.1 `tests/unit/identity/subject-access-export-stub.test.ts`: hoist `let hh` out of the
      `it()` body, drop `try`/`finally`, add module/describe-scoped `afterEach` cleanup.
- [x] 1.2 `tests/unit/identity/resident-list-empty-state.test.ts`: same.
- [x] 1.3 `tests/unit/identity/current-household-members.test.ts`: same.
- [x] 1.4 `tests/unit/casting/round-participant-list.test.ts`: same.
- [x] 1.5 `tests/unit/casting/room-rename.test.ts`: same.
- [x] 1.6 `tests/integration/raw-sql/session-immutable-profile.test.ts`: same (backs G-D14 — test
      body/title unchanged, teardown timing only).
- [x] 1.7 `tests/integration/raw-sql/round-visibility-household-account.test.ts`: same (backs
      G-D15 — test body/title unchanged).
- [x] 1.8 `tests/integration/policy/settings-page-admin-guard.test.ts`: same.
- [x] 1.9 `tests/integration/policy/resident-list-access.test.ts`: same.
- [x] 1.10 `tests/integration/policy/household-account-identity.test.ts`: same (backs G-D14 — test
      body/title unchanged).
- [x] 1.11 `tests/integration/policy/founding-resident-permission.test.ts`: same.
- [x] 1.12 `tests/integration/policy/admin-boundary.test.ts`: same, keeping the existing
      `household` variable name; only its second `it()` is affected.

## 2. Single-household, multiple-`it()` files sharing one variable name (design.md shape 2)

- [x] 2.1 `tests/unit/casting/quorum-denominator.test.ts`: hoist one shared `let hh` to
      describe-body scope, drop each `it()`'s local `try`/`finally`, add one `afterEach`.
- [x] 2.2 `tests/unit/casting/round-open-preconditions.test.ts`: same.
- [x] 2.3 `tests/integration/policy/procedure-lock.test.ts`: same.
- [x] 2.4 `tests/integration/policy/member-role-appointment.test.ts`: same.
- [x] 2.5 `tests/integration/policy/resident-list-audit.test.ts`: same.
- [x] 2.6 `tests/integration/policy/resident-claim-flow.test.ts`: same.
- [x] 2.7 `tests/integration/policy/room-independence.test.ts`: same.
- [x] 2.8 `tests/integration/policy/room-round-authorization.test.ts`: same.
- [x] 2.9 `tests/integration/policy/round-open-atomicity-orphan-draft.test.ts`: same.
- [x] 2.10 `tests/integration/policy/round-open-atomicity.test.ts`: same.
- [x] 2.11 `tests/integration/policy/round-visibility-household-account.test.ts`: same (backs
      G-D15 — test bodies/titles unchanged).
- [x] 2.12 `tests/unit/identity/moved-out-session-revocation.test.ts`: same.

## 3. Two-household (`hhA`/`hhB`) files (design.md shape 3)

- [x] 3.1 `tests/integration/raw-sql/household-and-settings-scoping.test.ts`: hoist `hhA`/`hhB` to
      describe-body scope, drop `try`/`finally`, add one `afterEach` cleaning both.
- [x] 3.2 `tests/integration/raw-sql/identity-household-scoping.test.ts`: same.
- [x] 3.3 `tests/integration/raw-sql/room-household-scoping.test.ts`: same.
- [x] 3.4 `tests/integration/raw-sql/session-household-scoping.test.ts`: same.
- [x] 3.5 `tests/integration/raw-sql/round-household-scoping.test.ts`: same.
- [x] 3.6 `tests/integration/policy/household-and-settings-scoping.test.ts`: same.
- [x] 3.7 `tests/integration/policy/identity-household-scoping.test.ts`: same.
- [x] 3.8 `tests/integration/policy/room-household-scoping.test.ts`: same.
- [x] 3.9 `tests/integration/policy/round-household-scoping.test.ts`: same.
- [x] 3.10 `tests/integration/policy/session-household-scoping.test.ts`: same.

## 4. Stale comments

- [x] 4.1 `vitest.config.ts`: update the comment at lines 21-23 — it currently states teardown
      happens in a `finally` inside the `it()` body and counts toward `testTimeout`; that stops
      being true once section 1-3 land.
- [x] 4.2 `tests/helpers/identity.ts`: update the comment at lines 43-44 — drop the "tests call
      this in a finally inside the it() body" framing; keep the CTE/single-round-trip rationale,
      which still holds independent of call site.

## 5. Verification

- [x] 5.1 Re-grep the 34 files for `.cleanup()` call sites before and after editing; confirm the
      count of `cleanup()` calls matches the count of `registerTestHousehold()` calls in each file
      (no call dropped in the mechanical edit).
- [x] 5.2 Run `npm run verify` (lint + the four guardrail lints + `tools/check-refs.ts` +
      the full Vitest suite against `flatmate-io-dev`) and confirm it passes.
- [x] 5.3 Confirm `test/guarded.manifest.json` needs no edit — G-D14/G-D15's `testFiles` entries
      (`household-account-identity.test.ts`, `session-immutable-profile.test.ts`,
      `round-visibility-household-account.test.ts` ×2) keep their paths, titles, and bodies; only
      teardown timing moved.
