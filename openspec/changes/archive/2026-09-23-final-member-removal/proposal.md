# Proposal

## Why

U-27 splits member removal into two tiers, and the difference between them is the point of the
decision. `docs/08-UX-Entscheidungen.md` **U-27** (maßgeblich):

> „Ausgezogen" (weich) erhält Stimmen und Historie und ist der reguläre Weg für tatsächliche
> Auszüge. „Entfernen" (hart, endgültig) verlangt die **Eingabe des exakten Anzeigenamens** zur
> Bestätigung […]

`docs/screens/O-organisation.md` O16 repeats it: *„«Entfernen» ist endgültig"*.
`docs/backlog/requirements/F1-requirements.md` **FR-1.26** carries it into the packet: *"'Remove' is
final, requires typing the exact display name to confirm"*.

The shipped hard tier is not final. `removeMember` (`src/modules/identity/repository.ts`) sets
`resident_profile.status = 'moved_out'`, the soft tier's state, on the reasoning that *"U-27 doesn't
need a fourth ResidentProfile state"*. `reactivateMember` then reverses *"either removal tier"*, and
O16 branches only on `status === "moved_out"`. So a person removed as an intruder is shown with the
„Ausgezogen" badge and a **Reaktivieren** button, and one click restores their access. The
contradiction with „endgültig" is direct, not a matter of reading. It also puts the soft tier's
§8.6 label (`moved_out` → „Ausgezogen", `screens/rahmenwerk.md` §8.6) on the tier U-27 exists to
keep apart from it.

Found by the user on 2026-09-22 while hand-testing change 2 (`join-by-link`). The user decided it
comes **before** F2's change 3, because change 3 builds the join screens an intruder arrives
through.

## What Changes

- **A fourth `ResidentProfile.status`, `removed`.** Declared transitions `active → removed` and
  `moved_out → removed`, **and none out of it.** `removeMember` moves to it. `reactivateMember` can
  then reach only `moved_out` profiles, because the transition table refuses `removed → active`.
- **Finality also holds in the database.** Today the transition table is application code only:
  under RLS, `app_runtime` can `UPDATE resident_profile SET status = 'active'` on any row of its
  own household. A `BEFORE UPDATE` trigger refuses any update that moves a row's status *out of*
  `removed`, following `drizzle/0006`'s immutability-trigger precedent. It is deliberately that
  narrow: other columns stay writable, so a later redaction or F3+'s purge is not blocked. Without it, "endgültig"
  would rest on nobody calling a function. That is the kind of guarantee G-C7 exists to reject.
- **A removed person no longer appears on O16's resident list.** Human decision, 2026-09-22. The
  audit trail keeps the record (FR-1.30/AC-1.23 unchanged).
- **A removed person's display name is free again.** Human decision, 2026-09-22. This extends
  **FR-1.4** from *"not `moved_out`"* to *"neither `moved_out` nor `removed`"*, plus the partial
  unique index and the sign-in lookup. Without it, an intruder who joined as „Sam" keeps the real
  Sam from ever using that name, and a mistaken removal has no clean recovery. The recovery is
  re-inviting the person under the same name.
- **A live link a removed person joined through is flagged on O16.** Human decision, 2026-09-22,
  narrowed 2026-09-23 after the walkthrough. After a removal, the intruder may still hold a reusable
  link and can rejoin under a new name. The link row shows a caution with its „Löschen" action beside
  it. Only a **live** link (not deleted, not expired, uses left) carries it. A used-up or deleted link
  can never be used again, because „+7 Tage" moves only the expiry, never the use count. An expired
  one is harmless until someone extends it, and extending it makes it live and brings the caution
  back. The first version flagged every non-deleted link, which put a warning on a spent single-use
  link that nobody can use. The moderator decides, and nothing is deleted automatically, because a
  reusable link may also be waiting for legitimate flatmates.
- **Dead links are collapsed on O16.** Human decision, 2026-09-23, from the walkthrough, folded in
  here rather than given its own change because it reshapes the same list the flag sits in. Live
  links come first. Expired, used-up and deleted links sit in a section collapsed by default, with
  its count in the summary. O16's *„Ein toter Link verschwindet nicht"* still holds, because a
  collapsed link is still listed with its end state and its joiners (FR-2.29, AC-2.26).
- **A revoked membership can no longer open a session.** Found while planning. `signIn`'s
  email branch loads the membership without checking `revoked_at`, so anyone holding the derived
  address (`resident-<profile-id>@accounts.flatmate.invalid`) and the password gets a fresh session
  after either removal tier. Hard to exploit (the profile id is visible only to moderators), but V-3
  says *„sofortiger Zugriffsentzug"*, and "endgültig" means nothing if a new sign-in undoes it.
- **A round's participant list shows only current residents.** Found while planning, and it
  affects both tiers. Neither removal touches `round_participation`, and `getRoundParticipants`
  (`src/modules/casting/repository.ts`) joins the profile without checking its status. So a
  moved-out or removed person stays on FR-1.19's list, *"all residents taking part in a round"*,
  and an intruder's name stays in front of every participant. The rows themselves are left alone:
  F4's denominator will need their history, and V-3's formula already filters on
  `profile(p).status = 'active'` at read time.
- **Existing hard removals are migrated.** A profile still `moved_out` whose latest membership event
  is `membership.removed_as_intruder` becomes `removed`. Otherwise every intruder removed before
  this change stays reactivatable.

**Not in this change:** U-27's other half, that an intruder's votes and applications *„nicht in
Score oder Protokoll verbleiben"*. `Vote` and `Application` do not exist until F3+, and F1's code
comment saying so is correct. This change makes `removed` the state that later purge keys on.

## Capabilities

### New Capabilities

- `identity/member-removal`: the two removal tiers as implemented behaviour: what each does to the
  profile, the membership and the sessions, that the hard tier is final in the data, that a removed
  person leaves the resident list and frees their name. Cites FR-1.4, FR-1.26, FR-1.30, U-27, V-3.

### Modified Capabilities

- `identity/join-code`: *The moderating person governs the links* now names only residents who were
  not removed (AC-2.26 was written about flatmates, not intruders), flags a live link a removed person
  joined through, and lists dead links in a collapsed section.
- `identity/permissions`: *A revoked membership grants nothing* now also covers opening a new
  session, not only permission and role checks.

## Guardrails touched

- **G-C (authorization/visibility)**: directly. V-3 (`docs/domain/invarianten.md` §5.3) access
  revocation is extended to sign-in; `removed` must behave like `moved_out` in every access and
  quorum predicate. **G-C7**: the new trigger is a data-level guarantee, so it is tested as raw SQL
  under `app_runtime` as well as through the repository.
- **G-D3** (*„Nur in der Übergangstabelle deklarierte Übergänge sind ausführbar"*): the table gains
  two entries and a state with no exit. The guarded tests on G-D3's manifest entry
  (`tests/unit/casting/state-machine.test.ts`, `tests/unit/audit/backward-transition.test.ts`)
  belong to the `Application` machine and are not touched. P-4 (Reversibilität) is about the
  application pipeline. U-27 decides the hard tier is deliberately irreversible, and that decision
  outranks any reading of P-4 that would stretch it onto `ResidentProfile`.
- **G-D (guarded tests)**: none modified. `tests/unit/identity/resident-profile-transitions.test.ts`,
  which asserts the three-value status set, is not in `test/guarded.manifest.json` (checked) and is
  **updated**, not deleted (G-G1).
- **G-A5**: the O16 flag refers to a link by its issuance, never by putting its code anywhere new.
- **G-L**: not touched.

## Assumptions

1. **The link flag sits on the link, not on a one-off post-removal message.** The user chose "show a
   hint after removal" and also chose to hide removed people. With the removed row gone from the
   list, a hint attached to it has nowhere to render. On the link row the hint survives a reload,
   is seen by every moderator rather than only the one who acted, and disappears by itself once
   the link dies. **Flagged for review.**
2. **The flag and the joiner list do not name the removed person.** Hiding them from the resident
   list but printing their name under a link would undo the hiding one section lower. The link says
   that *a removed person* joined through it, without naming them. AC-2.26's *"names the two
   residents who joined"* is read as being about residents, which a removed intruder no longer is.
3. **`prepared → removed` is not declared.** Removal acts on a membership, and a `prepared` profile
   has none. The existing `prepared → moved_out` has no caller either, and is left alone rather than
   tidied in passing.
4. **The sign-in refusal uses `invalid_credentials`,** the single code change 0 converged on, so a
   revoked person learns nothing about why. A reactivated `moved_out` person signs in normally,
   since reactivation clears `revoked_at`.
5. **The docs gap is closed in `docs/`, not here.** `domain/identity.md` §2.1 gains `removed` in the
   status enum and the uniqueness wording. F1's FR-1.4 is amended, O16 records that removed people
   are not listed, and `review-log.md` §Offene-Punkte-Register gets the entry. This change cites
   those edits and never points `docs/` into `openspec/` (Rule 7).

## Impact

- **Schema/migrations:** `resident_profile_status` enum gains `removed`. Because Postgres refuses to
  use a new enum value in the transaction that added it, this takes **two** migrations: `0016` adds
  the value, and `0017` rebuilds the partial unique index, adds the trigger and backfills. Neither
  creates a `SECURITY DEFINER` function or drops a column, so the harness refusals seen on
  `0013`–`0015` are not expected. `0017` is still written re-runnable.
- **Code:** `src/modules/identity/{transitions,schema,repository,auth}.ts`,
  `src/app/(org)/members/{page.tsx,remove-member-form.tsx}`, `src/ui/strings/de.ts`.
- **Tests:** transitions unit test updated; new tests for finality (repository and raw SQL), list
  hiding, name reuse, the link flag, revoked sign-in, and the backfill.
- **Docs:** `docs/domain/identity.md`, `docs/backlog/requirements/F1-requirements.md`,
  `docs/screens/O-organisation.md`, `docs/review-log.md`; `node tools/check-refs.ts` afterwards.
