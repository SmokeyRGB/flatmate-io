# Proposal

## Why

A resident who forgets their password today has no way back. `/account` is a placeholder (change
4), no email can be added after joining, and the administration reset that PRD §4.1.1 promises
(K-18) does not exist. That is the risk `docs/backlog/requirements/F2-requirements.md` **R-2.1**
names:

> A resident votes once, clears cookies, and cannot get back in

The packet assigns the answer to this slice. **FR-2.17**: *"A resident shall be able to add or
change an email address later in their own settings, presented as restoring access if the password
is lost."* The screen is `docs/screens/E-einstellungen.md` **E1**, whose v0.1 sections are
*„E-Mail nachtragen"* (pitch *„Zugang wiederherstellen, falls du dein Passwort vergisst"*), *„Passwort
ändern"* and *„Abmelden"*. The scope line is **S-03** (`02-SRD.md` §5.3, v0.1):
*„`Account.email` ist beim Beitritt für Resident-Accounts **optional** und später im Profil
nachpflegbar"*.

The packet also contradicts itself on the way back without an email. **EC-2.6** says *"Recovery is
impossible; a moderator must create a fresh profile"*. PRD §4.1.1 (K-18, precedence 3) and
`domain/identity.md` §2.1 (O-16) say instead that *„die Verwaltung kann es stattdessen
zurücksetzen"*, with an ActivityEvent and every session of the profile ended. The human decision of
2026-09-24 builds the PRD's version, reshaped into a link (below). EC-2.6 is corrected to match.

## What Changes

- **Screen E1 at `/account`**, replacing change 4's placeholder. Three sections: email, password,
  sign-out. No push section (S-28/S-45 are v0.2) and no passkey (below).
- **Adding or changing the email address (FR-2.17).** Human decision, 2026-09-24:
  - the address is stored on `account.email`, **and** the resident's Supabase Auth user moves from
    its derived `.invalid` address to the real one;
  - `account.email_verified_at` stays `null`. No mail is sent in v0.1: the mail channel is S-28
    (v0.2), and A-2.5 says the slice has no notification channel;
  - the address is ready for v0.2's reset mail, which then needs custom SMTP and no further code
    here;
  - **the address can be changed but never removed** (human decision, over the recommendation to
    allow it; see Assumption 3).
- **Signing in with email + password as a resident** (human decision, 2026-09-24). Once a
  resident's Auth address is real, the email sign-in path signs them in as themselves. The sign-in
  screen says so. Name + password stays the universal way in (P-2, O-12). For everyone who adds an
  address, this closes the „household UUID" gap in resident sign-in.
- **An email given at join goes to Supabase Auth too**, so "has an email" means the same thing
  whether it was given at join or added in E1 (Assumption 1).
- **Changing the password on E1** needs the current password and the new one, with the rule
  visible (FR-2.10a). It ends every **other** session of the profile and keeps the current one
  (human decision, 2026-09-24; O-13: *„endet bei Passwortänderung"*). It is audited, with an empty
  payload.
- **A password-reset link issued by the administration (O-16, reshaped).** The human asked for a
  profile to become "unclaimed" again and be re-claimed through a new link. A literal return to
  `prepared` is impossible for three reasons:
  - `active → prepared` is not a declared transition (ADR-002, G-D3);
  - a prepared profile would leave V-3's quorum denominator in the middle of a round;
  - the re-claim would collide with the existing Auth user.

  So the link is bound to the **active** profile, and opening it looks like A3's bound shape
  (*„Hi Sam"*, one password field). Redeeming it:
  - sets the new password;
  - ends **every** session of the profile;
  - records `account.password_reset_by_admin`;
  - signs the person in and lands them on Start.

  It can be issued only while the profile's account has no email (O-16: *„Die Lücke schließt sich
  selbst"*). The administration never learns the password when the link is used as intended. That
  does not make it a security boundary, and the product never presents it as one (E-03).
- **Docs amendments, with register entries:**
  - `domain/identity.md` §2.1: O-16's direct reset becomes a reset link;
  - `domain/identity.md` §2.1, provider box: a real email **replaces** the derived identifier at the
    provider rather than standing *„neben der abgeleiteten Kennung"*, and a resident with an email
    may sign in with it;
  - F2 **EC-2.6** is corrected to K-18.

**Out of scope, on purpose:**
- the passkey (ADR-007): `domain/identity.md` makes it depend on a **confirmed** email, which v0.1
  cannot produce, and ADR-006 requires checking Supabase WebAuthn first;
- push management (v0.2);
- verification mail and „Passwort vergessen" (v0.2, with custom SMTP);
- the feed surface that would *show* the reset event to all residents (S-27: the append-only log is
  v0.1, the feed surface comes later).

## Capabilities

### New Capabilities
- `identity/account-settings`: E1. Adding and changing one's own email, changing one's own password,
  and what each does to sessions and the sign-in address.
- `identity/password-reset`: the administration-issued reset link bound to an active profile. Who
  may issue it, when it is valid, what redeeming it does, and how it is recorded.
- `identity/sign-in`: seeded lazily. Only the behaviour this change adds or depends on: which
  address a resident signs in with, and email sign-in as a resident.

### Modified Capabilities
- `identity/join`: *"An email given at join is stored unverified and blocks nothing"*. The address
  also becomes the resident's sign-in address at the provider, and an address already in use is
  refused.
- `identity/join-code`: *"A link may name the person it was issued for"*. A link now has a purpose,
  joining or password reset, and a reset link names an active profile, not a prepared one.
- `ui/resident-frame`: *"The resident's own settings screen exists as a placeholder"* is replaced
  by the real screen.

## Guardrails touched

- **G-C (authorization and visibility):**
  - E1 acts on the session's own account only, derived from `context.accountId` and never from a
    caller-supplied id;
  - issuing a reset link is administration-only (O-16: *„`Membership.is_resident = false`,
    `manage_members`"*);
  - the new repository exports join `authorization-matrix.test.ts`.
- **G-C7:** `resolve_join_code` and `claim_join_code` (both `SECURITY DEFINER`) change shape, so
  raw-SQL tests cover the new branch, and the statements are a **human hand-off**.
- **G-A5:** the reset code never enters a log, a payload or a query string, exactly like a join
  code.
- **G-D7:** three new event types with empty payloads, and an email address never enters a payload.
- **G-D14:** email sign-in as a resident sets `acting_profile_id` from the membership, exactly as
  the name path does. The household account still never occupies a profile.
- **G-D3:** no new status transition. The reset deliberately avoids one.
- G-L is not touched.

## Assumptions

1. **The join path moves an email into Auth too.** Otherwise a resident who gave an email at join
   could neither sign in with it nor be reached in v0.2, while one who added it in E1 could. A join
   with an address already registered at the provider is refused with the same neutral message as
   E1. This is a new refusal on the join form, and FR-2.11's empty field is unaffected.
2. **Project-wide uniqueness is the provider's.** Supabase Auth refuses an address any account
   already uses, including the household account's own. The founding person therefore cannot reuse
   the household account's address on their resident profile. `domain/identity.md` already
   recommends a shared WG address for the household account for exactly that ownership reason. The
   refusal names no account and no household. A signed-in resident learns only that the address is
   taken.
3. **No removal of the address (human decision).** Cost: data minimisation now depends on account
   deletion. Recorded as a register entry, so the decision is visible and can be revisited.
4. **The reset link lives in `join_code_issuance`, with a purpose column.** It inherits the
   route's attempt limit (FR-2.28), the hand-entry path (P-1, FR-2.27), the single refusal message
   (FR-2.8) and the history on O16, rather than duplicating each.
5. **The issuer is the household account only**, per O-16's wording. Moderators hold resident-list
   parity (U-30), but a moderator is a flatmate: one resetting another's password would take over a
   peer's votes. The human can widen this.
6. **Existing accounts are not migrated.** Sign-in reads the provider's current address rather than
   rebuilding it. So residents who joined with an email before this change keep signing in by name
   and are simply not email-reachable until they save their address once in E1.

## Impact

- **Code:**
  - `src/app/(resident)/account/`: E1 and its actions;
  - `src/app/(auth)/sign-in/`: the copy for email sign-in as a resident;
  - `src/app/(auth)/join/[code]/`: the reset shape of A3;
  - `src/app/(org)/members/`: issuing a reset link on O16;
  - `src/modules/identity/auth.ts`: `signIn`, `joinHousehold`, the new email, password and reset
    functions;
  - `src/modules/identity/repository.ts` and `schema.ts`;
  - `src/modules/audit/repository.ts`: three event types;
  - `src/ui/strings/de.ts`.
- **Database:** one migration: a `join_code_purpose` enum, a `purpose` column, and both
  `SECURITY DEFINER` functions re-created (DROP IF EXISTS + CREATE, human hand-off).
- **Docs:** `domain/identity.md` §2.1, `backlog/requirements/F2-requirements.md` EC-2.6,
  `review-log.md` §Offene-Punkte-Register, `data-inventory.yml` (`account.email`'s purpose).
- **External:** Supabase Auth user emails for residents become real addresses. No SMTP change.
