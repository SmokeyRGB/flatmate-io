# Bug Fix: profile-less household session can create/open a casting round

- **Slug**: rounds-new-profile-less-authorization
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: not-applied

## Summary

The assessment's proposed fix (call `assertHasResidentProfile(context)` inside `createRound`,
`openRound`, and `createAndOpenRound`) was implemented, then **reverted** after it broke 9 tests
across 3 files — including a `[GUARDED]` invariant test — and, more importantly, revealed a
logical contradiction with `EC-1.3`'s own test scenario. This is deeper than a page/repository
enforcement gap; it's a cross-cutting design question this fix cannot resolve unilaterally.
Repository is left unchanged (the pre-existing `rounds-new-orphan-draft-atomicity` refactor from
earlier in this session is untouched). Recommend re-running `/speckit-bug-assess` with a human
decision on the question below before any code change lands.

## What Was Attempted

- Imported `assertHasResidentProfile` from `@/modules/identity/repository` into
  `src/modules/casting/repository.ts`.
- Called it in `createRound`, `openRound`, and `createAndOpenRound`, alongside the existing
  `assertHasPermission(..., "close_round")` check, exactly as the assessment proposed.
- `npx tsc --noEmit` and `npx eslint` both passed clean on this change in isolation.

## Why It Was Reverted

Running the affected suites immediately surfaced the real scope of the change:

```
npx vitest run tests/unit/casting/round-open-preconditions.test.ts \
  tests/integration/policy/round-open-atomicity.test.ts \
  tests/integration/policy/round-household-scoping.test.ts
```
→ **9 failing tests across all 3 files**, all `PermissionDeniedError: this route requires an
active resident profile (FR-1.23)` thrown from the new guard in `createRound`.

Every round-related test in this repository (11 files: `procedure-lock`, `room-round-authorization`,
`round-household-scoping` (policy — a `[GUARDED]` `castinground_via_policy` visibility invariant per
`test/guarded.manifest.json`), `round-open-atomicity-orphan-draft`, `round-open-atomicity`,
`round-visibility-household-account`, the raw-sql household-scoping mirror, `quorum-denominator`,
`round-open-preconditions`, `round-participant-list`) creates and opens rounds through the raw,
profile-less household-account `SessionContext` (`hh.context`), relying on `household_admin`'s
implicit all-permissions grant in `assertHasPermission`. This is not incidental — it is the
codebase's single, consistent, deliberately-built pattern for "act as the household's round
administrator" throughout F1's existing (reviewed, merged) test suite.

More critically, **`EC-1.3` ("refuses opening with zero eligible residents") cannot be
constructed under strict enforcement of this fix**: `claimResidentProfile` always sets
`isResident: true` on the claimed profile (`src/modules/identity/auth.ts:193`), so the moment any
account acquires the resident profile needed to satisfy `assertHasResidentProfile` and act as the
round's creator, that same account becomes an eligible resident — eligible-resident count can
never be zero while a valid (profiled) actor exists to create/open the round. The scenario `EC-1.3`
tests (a round opened while the household has zero eligible residents) is only reachable via the
profile-less household-account path this fix would remove. Enforcing the assessment's fix as
written makes `EC-1.3`'s premise unbuildable, not just its test code stale.

## The Underlying Tension (for the re-assessment)

Both readings have real textual support and neither is obviously wrong on its own:

- **For the fix (Copilot's reading):** FR-1.24 names exactly two exceptions to FR-1.23's
  profile-less restriction — retention actions, and a non-displaying subject-access export.
  Round create/open/close/reopen/archive are not on that list, so by FR-1.24's own "exactly two
  exceptions" framing, they should require an active resident profile. FR-1.12 also says "The
  system shall allow **a moderator** to create a casting round" — not "administration."
- **Against the fix (the existing implementation's reading):** `close_round` is a `Membership`
  permission (`docs/04-Domaenenmodell.md:1211-1217`) that `household_admin` holds implicitly by
  design (`assertHasPermission`'s documented rationale, `identity.md` §2.1) — the same mechanism
  ADR-014 relies on for round-adjacent administration (procedure-lock enforcement, `not_available`
  transitions) without calling that a new exception. `founding-resident-permission.test.ts`
  documents `close_round` as *also* auto-granted to a household's first claimed resident — i.e.
  the codebase already has a notion of "who administers rounds" that is orthogonal to F1.23's
  "no `ResidentProfile`" boundary, and `EC-1.3`'s test scenario depends on the profile-less path
  remaining open.

## Recommendation

Reopen this as an assessment-level question, not a fix-level one: **does `close_round` need to be
withdrawn from `household_admin`'s implicit grant (requiring every household to have a founding
resident with the permission before any round exists), or is round create/open/close correctly
scoped as household administration (same tier as retention, procedure-lock enforcement, and
`Room → not_available`), with FR-1.23/FR-1.24's "two exceptions" language needing a documented
third exception (or a narrower FR-1.24 rewrite) instead of a code change?** Whichever way that's
decided, `EC-1.3`'s test scenario needs to be re-examined alongside it, since its current form
assumes the profile-less path stays open. This is exactly the kind of precedence/ID-registry
question `docs/SPEC-INDEX.md`/ADR process is for, not something to decide unilaterally inside a
Copilot-review bug-fix pass.

## Changes

None — the attempted change was fully reverted. `src/modules/casting/repository.ts` and
`src/app/(org)/rounds/new/actions.ts` are unchanged from the state left by the
`rounds-new-orphan-draft-atomicity` fix earlier in this session.

## Local Verification

- `npx tsc --noEmit` (post-revert) → no errors.
- `npx eslint src/modules/casting/repository.ts` (post-revert) → no errors.
- `npx vitest run tests/unit/casting/round-open-preconditions.test.ts tests/integration/policy/round-open-atomicity.test.ts tests/integration/policy/round-household-scoping.test.ts` (post-revert) → 9/9 passed, confirming the revert is clean and no unintended state was left behind.

## Deviations from Assessment

The assessment's proposed remediation was implemented exactly as written, then reverted after
discovering it breaks a `[GUARDED]` invariant test and makes `EC-1.3`'s test scenario logically
unbuildable — a root-cause conflict the assessment did not surface (it noted `addResidentToRound`
as an out-of-scope follow-up, but did not anticipate that the in-scope functions' own precondition
tests would become unconstructable). Per the bug-fix skill's guardrail ("if you discover the
assessment was wrong... stop modifying code, document the finding, recommend re-running
`/speckit-bug-assess`"), no code change is left in place.

## Follow-ups

- Re-run `/speckit-bug-assess` for this slug (or a successor) once a human has decided the
  question in **The Underlying Tension** above.
- The page-level check in `src/app/(org)/rounds/new/actions.ts:20` remains exactly as it was
  before this session — no regression introduced, but also no additional enforcement added.
