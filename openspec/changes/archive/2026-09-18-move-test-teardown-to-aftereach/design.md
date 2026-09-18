## Context

`registerTestHousehold()` (`tests/helpers/identity.ts:29`) returns a `cleanup()` that deletes the
household's rows (one statement, one round trip) plus its Supabase Auth user. 34 test files call
that `cleanup()` from a `finally` block inside the `it()` body — the shape the fix removes. Three
files already use the target shape (module-scoped `let hh` + `afterEach`):
`tests/unit/identity/display-name-uniqueness.test.ts`,
`tests/unit/identity/claim-session-setup-not-atomic.test.ts`,
`tests/integration/policy/account-cannot-vote.test.ts`. This design generalizes that existing
precedent to the other 34, rather than inventing a new shape.

Verified empirically before writing this design (throwaway test, deleted after): Vitest 5.0.1
still runs a suite's `afterEach` after a test that hit its `testTimeout`, even though the timed-out
test's own promise never settles. That confirms the proposal's load-bearing assumption — `afterEach`
is genuinely outside the timed region, not just conventionally so.

## Goals / Non-Goals

**Goals:**
- Every household `registerTestHousehold()` creates gets torn down via `afterEach`, so teardown
  runs on pass, fail, or timeout.
- No change to what any test asserts, its title, or its file path.

**Non-Goals:**
- Not touching `tests/integration/raw-sql/pool-reuse.test.ts` — its `finally` closes a raw
  `postgres` client it opened itself, unrelated to `registerTestHousehold`/`hh.cleanup()`.
- Not deduplicating or restructuring test bodies beyond what moving teardown requires.
- Not adding retry/orphan-sweeping logic for households that already leaked in the dev project —
  that's a one-off cleanup, not a test-suite change.

## Decisions

**One `afterEach` per file/describe, not a global one in `tests/setup.ts`.** A shared global hook
would need every test to register its household(s) into some common registry, which is more
machinery than 34 mechanical edits. Following the existing two-file precedent keeps the diff
boring and keeps `cleanup()` colocated with the `registerTestHousehold()` call it pairs with.

**Three mechanical shapes, chosen per file's existing structure (no shape is invented — each
mirrors the existing precedent files, generalized to N variables):**

1. **Single household, single `it()`** (12 files) — hoist the per-`it()` `let hh` to
   `describe`-body scope (or module scope, matching the two single-`it()` precedent files), drop
   the `try`/`finally`, add:
   ```ts
   afterEach(async () => {
     if (hh) await hh.cleanup();
     hh = undefined;
   });
   ```
   Files: `tests/unit/identity/subject-access-export-stub.test.ts`,
   `tests/unit/identity/resident-list-empty-state.test.ts`,
   `tests/unit/identity/current-household-members.test.ts`,
   `tests/unit/casting/round-participant-list.test.ts`,
   `tests/unit/casting/room-rename.test.ts`,
   `tests/integration/raw-sql/session-immutable-profile.test.ts`,
   `tests/integration/raw-sql/round-visibility-household-account.test.ts`,
   `tests/integration/policy/settings-page-admin-guard.test.ts`,
   `tests/integration/policy/resident-list-access.test.ts`,
   `tests/integration/policy/household-account-identity.test.ts`,
   `tests/integration/policy/founding-resident-permission.test.ts`,
   `tests/integration/policy/admin-boundary.test.ts` (variable is named `household`, not `hh`, and
   only the file's second `it()` uses it — keep the name, only its own `it()` needs the change).

2. **Single household, multiple `it()`s each declaring their own local variable of the same name**
   (12 files) — hoist one `let hh` to `describe`-body scope shared by all the file's `it()`s (same
   effect as case 1, just with more call sites losing their local `try`/`finally`). `afterEach`
   runs once per test, so reassigning module-shared `hh` inside each `it()` is safe — no cross-test
   leakage.
   Files: `tests/unit/casting/quorum-denominator.test.ts`,
   `tests/unit/casting/round-open-preconditions.test.ts`,
   `tests/integration/policy/procedure-lock.test.ts`,
   `tests/integration/policy/member-role-appointment.test.ts`,
   `tests/integration/policy/resident-list-audit.test.ts`,
   `tests/integration/policy/resident-claim-flow.test.ts`,
   `tests/integration/policy/room-independence.test.ts`,
   `tests/integration/policy/room-round-authorization.test.ts`,
   `tests/integration/policy/round-open-atomicity-orphan-draft.test.ts`,
   `tests/integration/policy/round-open-atomicity.test.ts`,
   `tests/integration/policy/round-visibility-household-account.test.ts`,
   `tests/unit/identity/moved-out-session-revocation.test.ts`.

3. **Two households per test (`hhA`/`hhB`)** (10 files) — hoist both to shared scope, one
   `afterEach` cleans both:
   ```ts
   afterEach(async () => {
     if (hhA) await hhA.cleanup();
     if (hhB) await hhB.cleanup();
     hhA = undefined;
     hhB = undefined;
   });
   ```
   Files: `tests/integration/raw-sql/household-and-settings-scoping.test.ts`,
   `tests/integration/raw-sql/identity-household-scoping.test.ts`,
   `tests/integration/raw-sql/room-household-scoping.test.ts`,
   `tests/integration/raw-sql/session-household-scoping.test.ts`,
   `tests/integration/raw-sql/round-household-scoping.test.ts`,
   `tests/integration/policy/household-and-settings-scoping.test.ts`,
   `tests/integration/policy/identity-household-scoping.test.ts`,
   `tests/integration/policy/room-household-scoping.test.ts`,
   `tests/integration/policy/round-household-scoping.test.ts`,
   `tests/integration/policy/session-household-scoping.test.ts`.

**Cleanup order within a shared `afterEach` (case 3) doesn't matter.** Per
`tests/helpers/identity.ts:37-47`, the two households' rows carry no foreign keys to each other —
each `cleanup()` only touches its own `household_id`.

**Update the two stale comments in the same commit**, since they describe the old behavior as
current fact:
- `vitest.config.ts:21-23` — drop "these tests call hh.cleanup() in a finally inside the it() body";
  the timeout budget still covers setup + assertions, but teardown is no longer part of what a hang
  can starve.
- `tests/helpers/identity.ts:43-44` — drop "tests call this in a finally inside the it() body";
  the single-round-trip CTE rationale (avoiding ten sequential deletes) still holds independent of
  where the call is made from, so only the "why a CTE" framing needs adjusting, not the CTE itself.

## Risks / Trade-offs

- **[Risk]** A file in category 2 has an `it()` that never assigns `hh` (an early-return/guard-clause
  test) → `afterEach`'s `if (hh)` still guards correctly since `hh` carries over as `undefined` from
  the previous test's reset. No mitigation needed, already handled by the reset line.
- **[Risk]** Hand-editing 34 files risks a transcription slip (wrong variable name, missed `try`
  removal) → mitigated by tasks.md requiring `npm run verify` (full vitest run against the real
  `flatmate-io-dev` Supabase project) after the edits, which would fail loudly on a leftover
  double-`await`/syntax error and, more importantly, would still leave orphaned rows if a
  `cleanup()` call were dropped by mistake — worth a manual re-grep for `hh.cleanup()`/`.cleanup()`
  call-site count before/after to confirm none were lost.
- **[Trade-off]** `afterEach` still has Vitest's own `hookTimeout` (unset here, so Vitest's 10s
  default) budget, separate from `testTimeout`. `registerTestHousehold().cleanup()` is one SQL
  round trip plus one Auth admin call — well under 10s in current CI runs — so no config change is
  needed now; this is worth revisiting only if teardown itself starts timing out.

## Migration Plan

No runtime migration — this only touches test files and two comments, nothing deployed. Rollout is
a single commit; rollback is `git revert`. Sequence:
1. Fix the 34 files (three mechanical shapes above).
2. Update the two stale comments.
3. Run `npm run verify` locally against `flatmate-io-dev` to confirm the full suite still passes
   and no new orphaned rows appear.
4. The 8 households / 5 Auth users already orphaned by the CI incident are a separate, one-time
   manual cleanup against `flatmate-io-dev` — out of scope for this change (it fixes future runs,
   not past state), call out to the user separately.
