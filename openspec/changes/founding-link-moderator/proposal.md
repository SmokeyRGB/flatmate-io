## Why

A household's founder can't run their first round without switching accounts four times. They
register (household account), open their founding link only to be told they are already a
member, sign out, join as a resident, sign out, sign back in as Verwaltung, appoint themselves
moderator, sign out again, sign in as the resident and open the round. The human found this on the
first walkthrough of the onboarding slice (2026-10-06) and decided that **whoever joins through the
founding link becomes moderator**, and that the founding link must work while the founder is
still signed in as the household account.

The rule is tied to the founding link on purpose, not to "the first resident to join". The first-joiner automatism
existed before and was removed on 2026-09-22 because it misfired *„sobald eine Mitbewohnerin vor
der registrierenden Person selbst beitrat"* (`docs/domain/identity.md`, Rolle-Vorbelegung). The
founding link is a single, named link that registration hands to the founder, so the special
position it gives is visible and traceable. No arrival order is involved.

## What Changes

- Registration marks the founding link it already issues (`registerHousehold`, single use,
  7 days) as the household's **founding link**. No other path ever sets the mark.
- A join through a founding link (`joinHousehold`) creates the membership with role `moderator`.
  Its stored permissions are the resident set plus the moderator set, exactly as `setMemberRole`
  stores an appointment. The appointment is recorded as its own audit event, so the special
  position is visible.
- **BREAKING (spec):** the requirement *"No permission is inferred from how a membership came
  about"* (identity/permissions) is narrowed. Order of arrival still confers nothing, and so does
  any link other than the founding link. The founding link confers the moderator role, and only
  that.
- **Founding link while signed in as the household account:** today the household account that
  opens one of its own links is sent to its settings ("already a member"). For the founding link
  of its own household, it gets the join form instead. Submitting the form ends the household
  account's session in the same transaction that creates the resident, so the founder lands on
  Start as resident and moderator in one step. Opening the link changes nothing; only the
  submit does. Every other link, and every other signed-in visitor, behaves as today.
- `claimResidentProfile` (no production caller; seeds and about 40 tests) is unchanged and still
  creates a plain resident. The demo seed keeps appointing Alex explicitly.
- Living docs get dated amendments recording the 2026-10-06 human decision: `docs/domain/identity.md` (Rolle-Vorbelegung), `03-PRD.md`
  §4.0.1 (moderator-appointment row), F1 FR-1.8, F2 (founding link), and a register row in
  `docs/review-log.md`.

Sources: FR-1.8 *"Membership shall carry voting eligibility and a role as independent attributes,
plus permissions grantable individually to a moderator only"*; EC-2.4 (already a member); FR-2.4
(founding link is single use); SRD S-04 (no permission templates; this change adds no template, only
one more path that stores the existing moderator set).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `identity/permissions`: "No permission is inferred from how a membership came about" gains the
  founding-link exception. "Occupying a role grants its permissions" adds the founding join as a
  path that stores the moderator set.
- `identity/join-code`: a new requirement that registration issues exactly one founding link and the
  members screen names it while it can be used.
- `identity/join`: "Someone who already belongs is not made to join again" gains the
  founding-link case for the household account. "A join is recorded" adds the appointment event
  for a founding join.

## Impact

- **Guardrails:**
  - **G-C** (authorization): a new path grants the moderator set. It is bounded by the founding
    mark, which only registration writes, and by the link's single use, which `claim_join_code`
    enforces with one conditional update.
  - **G-F1** (data inventory): the new column needs an entry.
  - **G-D:** no guarded test changes meaning.
  - **G-L:** untouched.
- **Code:**
  - `src/modules/identity/schema.ts`: new `join_code_issuance.is_founding_link`.
  - `src/modules/identity/auth.ts`: `registerHousehold` and `joinHousehold`.
  - The join page state (`join-screen-state.ts`, `page.tsx`) and the join action.
  - `data-inventory.yml`.
- **Migration:** one additive migration (`ADD COLUMN IF NOT EXISTS … NOT NULL DEFAULT false`). No
  SECURITY DEFINER change: `resolve_join_code` and `claim_join_code` keep their shape.
- **Assumptions (recorded, not silently resolved):**
  - Existing households keep their unmarked founding links (no backfill). They exist only on
    shared dev and appoint by hand as before.
  - A founder who opens the founding link signed out gets the ordinary neutral form. Telling them
    beforehand that they will become moderator would need `resolve_join_code` to return the mark,
    and that is a SECURITY DEFINER shape change. Deferred.
  - If the founding link expires unused, or is deleted, nobody becomes moderator automatically,
    and appointment works as today.
