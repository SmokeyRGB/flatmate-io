# Bug Assessment: profile-less household session can create/open a casting round

- **Slug**: rounds-new-profile-less-authorization
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot PR review finding)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> `close_round` is not sufficient to enforce the documented administration boundary:
> `assertHasPermission` treats the household account as implicitly having every permission, so
> this path lets a profile-less household session create/open a casting round. FR-1.23/S-50 allow
> that session to inspect round identity/lifecycle only; round mutations must require an active
> resident profile, and the repository mutation path should enforce that rather than relying only
> on the page. (file: `src/app/(org)/rounds/new/actions.ts` around line 20)

## Symptom

`createRound`/`openRound` (and, after the atomicity fix landed in this session,
`createAndOpenRound`) are gated only by `assertHasPermission(context, actor.accountId,
"close_round")`. `assertHasPermission` grants every permission implicitly to the
`household_admin` role regardless of `context.profileId`, so a profile-less household-account
session (ADR-013 — signed in with the shared household credentials, no `ResidentProfile` claimed)
can create and open a `CastingRound`. Per S-50 (as precisified by ADR-014) and FR-1.23, an account
acting without an active resident profile must reach round **identity/lifecycle read access
only** — `CastingRound` (like `Application`/`Slot`/`Appointment`/`CastingNote`) still requires a
`ResidentProfile` for any actual casting **action**; ADR-014 only widened *visibility*, not
mutation rights ("Die Rechtematrix bleibt unverändert, jede Casting-Handlung trägt weiterhin
einen Namen" — the permission matrix is unchanged, every casting action still carries a name).
Expected: `createRound`/`openRound` refuse a profile-less session with a `PermissionDeniedError`,
enforced in the repository, not only (or not at all) at the page.

## Reproduction

1. Sign in with the shared household-account credentials without claiming/selecting a resident
   profile (a profile-less session, `context.profileId === null`).
2. Submit the "new round" form at `/rounds/new`.
3. `assertHasPermission(current.context, current.context.accountId, "close_round")` in
   `src/app/(org)/rounds/new/actions.ts` and again inside `createRound`/`openRound` in
   `src/modules/casting/repository.ts` succeeds, because `getMembershipForAccount` +
   `assertHasPermission`'s `household_admin` branch returns without ever looking at `profileId`.
4. The round is created and opened despite the session having no active resident profile.

## Suspected Code Paths

- `src/modules/identity/repository.ts:177-189` (`assertHasPermission`) — returns early for any
  `household_admin` membership row (`if (membershipRow.role === "household_admin") return;`),
  never checking `context.profileId`; a profile-less household session's own membership row is
  `household_admin` by construction (ADR-013), so every `close_round`-gated call succeeds for it.
- `src/modules/casting/repository.ts:242-246` (`createRound`) — gated only by
  `assertHasPermission(..., "close_round")`.
- `src/modules/casting/repository.ts:348-352` (`openRound`) — same.
- `src/modules/casting/repository.ts:361-373` (`createAndOpenRound`, added earlier in this same
  session for `rounds-new-orphan-draft-atomicity`) — same; a new instance of the same gap, since
  it copies the existing `createRound`/`openRound` permission-check pattern.
- `src/app/(org)/rounds/new/actions.ts:20` — calls `assertHasPermission(..., "close_round")` once
  more at the page, but this is exactly the "relying only on the page" pattern the report calls
  out; it uses the same broken predicate and adds no `profileId` check either.
- `src/modules/identity/repository.ts:576-583` (`assertHasResidentProfile`) — **already exists**,
  documented for exactly this purpose ("AC-1.16/FR-1.23: an account acting without an active
  resident profile reaches household administration only. This asserts the boundary for the
  entities F1 itself builds") — but it is currently **dead code**: `grep -rn
  assertHasResidentProfile src` shows zero call sites outside its own definition and
  `tests/integration/policy/admin-boundary.test.ts` (which tests the assertion function in
  isolation, not any real route wired to it).

## Root Cause Hypothesis

F1 already built the correct assertion (`assertHasResidentProfile`) and a test pinning its
behavior, but never wired it into any actual `CastingRound` mutation — `createRound`/`openRound`
(and their new caller `createAndOpenRound`) rely solely on `assertHasPermission("close_round")`,
which household-account sessions always pass. Confidence: high — directly visible in the code,
and the existing `assertHasResidentProfile` docstring names this exact boundary (FR-1.23) as the
gap it is meant to close.

## Proposed Remediation

**Preferred**: Call `assertHasResidentProfile(context)` inside `createRound`, `openRound`, and
`createAndOpenRound` in `src/modules/casting/repository.ts` — alongside, not instead of, their
existing `assertHasPermission(..., "close_round")` check — so a profile-less session is refused at
the repository layer regardless of which entry point is used. This is the layer G-C (Guardrails)
requires: authorization must not depend on the caller having remembered to check first. The
page-level `assertHasPermission` call in `rounds/new/actions.ts` can stay (defense in depth /
early, friendlier failure before any DB round-trip) but is no longer the only enforcement point.

Room mutations (`createRoom`, `transitionRoomStatus`, `removeRoom`, gated by `manage_rooms`)
are explicitly **not** in scope — S-50 lists rooms among the household administration a
profile-less account *is* meant to reach, so they must keep working exactly as they do.

**Alternatives**:
- Make `assertHasPermission` itself profile-aware for `close_round` specifically. Rejected: it
  would special-case one permission string inside a generic permission-check function, coupling
  an identity-module primitive to a casting-module rule; `assertHasResidentProfile` already exists
  as the correctly-scoped, casting-module-agnostic primitive for this — better to call it from the
  casting side than to grow `assertHasPermission`.

**Files likely to change**:
- `src/modules/casting/repository.ts` (import `assertHasResidentProfile`; call it in `createRound`,
  `openRound`, `createAndOpenRound`)
- A new/updated test asserting a profile-less session is refused by each of the three functions.

**Tests to add or update**:
- `createRound`, `openRound`, and `createAndOpenRound` each reject a profile-less
  (`profileId: null`) `SessionContext` with `PermissionDeniedError`, even when the account holds
  `household_admin`.
- A resident session (non-null `profileId`) with `close_round` permission continues to succeed
  (regression guard so the fix doesn't over-tighten and break the moderator/admin-with-profile
  path already covered by existing tests).

## Risks & Considerations

- `addResidentToRound` (`src/modules/casting/repository.ts:381-388`) is also gated only by
  `assertHasPermission(..., "close_round")` and has the identical gap by the same reasoning (it is
  a `CastingRound`-adjacent mutation), but it is **not named in this bug report** (which is scoped
  to `rounds/new/actions.ts`, i.e. create/open) and not covered by this fix — flagged here as a
  candidate for a follow-up bug rather than folded in silently, to keep this fix's diff matched to
  its assessed scope.
- Must not weaken `tests/integration/policy/admin-boundary.test.ts` (FR-1.23) or
  `tests/integration/policy/room-round-authorization.test.ts` (existing `close_round`/
  `manage_rooms` permission-boundary tests) — the fix adds a check, it must not remove or loosen
  either existing check.
- No schema/migration changes required; `assertHasResidentProfile` is a pure in-memory check on
  `context.profileId`, already used nowhere else, so wiring it in has no other blast radius.

## Open Questions

- [NEEDS CLARIFICATION: should `addResidentToRound` receive the same guard now, or as a separate
  follow-up?] — treated as out of scope for this fix per the bug report's exact wording, flagged
  above for a human decision.
