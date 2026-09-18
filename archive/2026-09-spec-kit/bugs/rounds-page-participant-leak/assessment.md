# Bug Assessment: Round-detail page leaks participant names to profile-less household-account sessions

- **Slug**: rounds-page-participant-leak
- **Created**: 2026-09-18
- **Source**: pasted text (Copilot PR #4 review comment)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim)

> This route calls `getRoundParticipants` for every session, including a profile-less
> household-account session. That leaks the participant display names even though the ADR-014
> policy and the guarded `getRoundForSession` contract restrict that identity to round
> lifecycle/identity fields and explicitly exclude Application-derived/participant data. Gate this
> read on `current.context.profileId !== null` (or enforce the same refusal in the repository)
> before rendering the participant section.

## Symptom

`src/app/(org)/rounds/[id]/page.tsx` calls `getRoundParticipants(current.context, id)`
unconditionally for any signed-in session, then renders every returned `displayName` in the
"Participants" panel. A household-account session (`context.profileId === null`) is only meant to
see round identity/lifecycle fields per ADR-014/G-D15 — `getRoundForSession` already enforces this
by returning the restricted `casting_round_admin_view` row set for such sessions (see
`src/modules/casting/repository.ts:401-422` and the guarded test
`tests/integration/policy/round-visibility-household-account.test.ts`). `getRoundParticipants`
(same file, lines 427-435) has no equivalent branch: it runs the same
`roundParticipation` ⋈ `residentProfile` query regardless of `context.profileId`, relying only on
RLS household-scoping (not profile-based exclusion) to limit rows. Expected behavior: a
profile-less session must not receive participant display names at all.

## Reproduction

1. Register a test household and sign in with a household-account session
   (`context.profileId === null`), e.g. via `registerTestHousehold()` as in
   `tests/integration/policy/round-visibility-household-account.test.ts`.
2. Create a round with at least one participant.
3. Visit `/rounds/[id]` as that household-account session (or call
   `getRoundParticipants(hh.context, round.id)` directly).
4. Observe that participant display names are returned/rendered, instead of being refused.

## Suspected Code Paths

- `src/app/(org)/rounds/[id]/page.tsx:22-25` — calls `getRoundParticipants` unconditionally, with
  no check on `current.context.profileId`, then renders `p.displayName` at lines 51-55.
- `src/modules/casting/repository.ts:427-435` — `getRoundParticipants` has no `profileId === null`
  branch/refusal, unlike its sibling `getRoundForSession` (lines 401-422), which explicitly swaps
  to a restricted admin view for profile-less sessions per the ADR-014/G-D15 comment at lines
  397-400.
- `tests/integration/policy/round-visibility-household-account.test.ts` — the existing `[GUARDED]
  G-D15` test only covers `getRoundForSession`'s column restriction; it does not cover
  `getRoundParticipants`, so this gap was not caught by the guarded suite.
- `tests/unit/casting/round-participant-list.test.ts` — existing unit coverage of
  `getRoundParticipants`; likely only exercises the resident-session path.

## Root Cause Hypothesis

High confidence. `getRoundForSession` was built with the ADR-014 profile-less-session restriction
in mind (explicit branch + comment citing ADR-014/G-D15), but `getRoundParticipants` was added as
a sibling repository function without the same guard, and the route wires both into rendering
without an additional check of its own. The gap is a straightforward missing-guard bug, not a
design disagreement: the restriction's intent (no Application-derived/participant data for
profile-less sessions) is already established precedent in the same file/module.

## Proposed Remediation

**Preferred**: Enforce the refusal in the repository, not just the route, so every current and
future caller of `getRoundParticipants` is covered (root-cause fix, not a per-caller patch).
Mirror the `getRoundForSession` pattern: add a `context.profileId === null` branch at the top of
`getRoundParticipants` in `src/modules/casting/repository.ts` that returns `[]` (or throws/refuses,
consistent with how the rest of the module signals "not visible to this session type") before
running the join query. The route (`src/app/(org)/rounds/[id]/page.tsx`) then naturally renders an
empty participants list for a household-account session with no route-level change required,
though the route may optionally also skip rendering the "Participants" heading/panel entirely for
a profile-less session for a cleaner UI (secondary, not required for the security fix).

**Alternatives**:
- Gate only in the route (`if (current.context.profileId !== null) { ... }` around the
  `getRoundParticipants` call). Rejected as the sole fix: it leaves the repository function itself
  unguarded for any other/future caller (e.g. an API route or server action), which is exactly the
  kind of gap this bug demonstrates. Can still be layered on top of the repository fix for
  UI-level clarity.

**Files likely to change**:
- `src/modules/casting/repository.ts` (add the profile-less guard to `getRoundParticipants`)
- `src/app/(org)/rounds/[id]/page.tsx` (optionally skip rendering the panel for profile-less
  sessions)
- `tests/integration/policy/round-visibility-household-account.test.ts` (extend the guarded G-D15
  test, or add a sibling guarded test, to cover `getRoundParticipants` returning no participant
  data for a profile-less session)
- Possibly `tests/integration/raw-sql/round-visibility-household-account.test.ts` if it exists and
  exercises the raw-SQL/bypass side per G-C7 (dual RLS testing) — needs confirming during the fix
  step.
- `tests/unit/casting/round-participant-list.test.ts` (add/extend a case for the profile-less
  branch)

**Tests to add or update**:
- A `[GUARDED]` test asserting `getRoundParticipants(profileLessContext, roundId)` returns `[]`
  (or equivalent refusal) even when participation rows exist, both through the policy layer and
  via raw SQL bypass (per G-C7), matching the existing G-D15 test's shape.
- A unit test at the route level (or repository level) confirming no `displayName` values reach
  rendering for a profile-less session.

## Risks & Considerations

- This is a `[GUARDED]` area (G-D15 references `getRoundForSession`'s test file); the fix must add
  coverage without weakening or renumbering the existing guarded test — extend/add, never edit the
  existing assertions away.
- Must confirm whether `test/guarded.manifest.json` needs a new/updated entry once the new guarded
  test exists, per the G-D guardrail process.
- Returning `[]` vs. throwing: check whether any other repository function in this module signals
  "restricted" via an empty array vs. an explicit error, for consistency (`getRoundForSession`
  returns the admin-view row, not an error, for the profile-less case — an empty array is the
  parallel choice for a list-shaped result).

## Open Questions

- [NEEDS CLARIFICATION: does `tests/integration/raw-sql/round-visibility-household-account.test.ts`
  already exist and cover `getRoundParticipants`, or only `getRoundForSession`? Confirm during the
  fix step before assuming new raw-SQL coverage is needed.]
