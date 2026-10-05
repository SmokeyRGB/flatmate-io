## Why

A resident without an email signs in with household, display name and password (O-12,
`docs/domain/identity.md` §2.1). Today the "household" in that triple is the household's UUID,
which nobody who joined by link has ever been shown, so a resident's first sign-out is a dead end.
The field's placeholder (*„wird nach dem Beitritt auf diesem Gerät gemerkt"*,
`src/ui/strings/de.ts`) promises a memory that does not exist. The E2E walkthrough of 2026-10-05
found this: after joining by `/join/<code>` and signing out, the field was empty, there was no
cookie and no localStorage entry, and typing the household's name gave *„Diese Haushalts-ID sieht
ungültig aus."* The join-screen change already named this gap and left it out on purpose
(`openspec/changes/archive/2026-09-23-join-screen/proposal.md`, Assumption 6: *"a device cookie
alone fixes only one device"*). This change is that follow-up.

The sources this serves, quoted rather than restated:

- **O-12** (`docs/domain/identity.md` §2.1): *„Beim Anmeldeformular wird zuerst der Haushalt
  gewählt (typischerweise bereits durch das Gerät bekannt, siehe „angemeldet bleiben" bei
  `Session`), danach der eigene Anzeigename und das Passwort"*.
- **A2** (`docs/screens/A-zugang.md`): *„Feld „Haushalt" vorbelegt, wenn das Gerät „angemeldet
  bleiben" hält"*.
- **P-1** (`docs/README.md` §3.1): *„jede Information, die über einen Link hereinkommen kann, muss
  auch von Hand einpflegbar sein; kein Feature setzt einen Link voraus"*. `docs/review-log.md`
  applied P-1 to a UUID on 2026-09-21 (the join-code format row): *„niemand tippt 36 Zeichen von
  einem Zettel ab, also genügte das `uuid` P-1 nicht"*. The same reasoning applies to the sign-in
  field, and the joiner here has never seen the UUID at all.
- **P-2** (`docs/README.md` §3.1): *„kein Bewohnender darf durch sein Gerät ausgeschlossen
  werden"*. Device memory alone would fail on every new or cleared device, so it can only be a
  convenience on top of something a person can type.
- **`03-PRD.md` §6.5**: *„Ratenbegrenzung bei Anmeldung und Beitrittscode-Eingabe"*. The name path
  of resident sign-in has no rate limit today.

## What Changes

- **New `Household.sign_in_code`**: a short, stable code per household that a person can type in.
  It is not secret. It uses the same alphabet as join codes but a shape of its own (design D1), so
  it can never be mistaken for one. The database generates it, so every existing writer of
  `household` (registration, test helpers, other branches on shared dev) gets one without change.
  It is backfilled for existing households.
- **BREAKING (UI only)**: the resident sign-in form's „Haushalt" field takes the household sign-in
  code instead of the UUID. The form never displayed the UUID, so no visible value stops working.
  `signIn({ kind: "resident", householdId })` stays as the module-internal path every existing test
  uses.
- **A new lookup from code to household id**, called before any session exists (a new
  `SECURITY DEFINER` function, applied by the human). An unknown code takes the same request
  sequence as an unknown name (auth-provider-deadline D11), so the answer never shows whether a
  code exists.
- **A rate limit on the resident name path**, reusing `record_join_attempt` in its own bucket.
- **The code is shown** to residents on E1 (`/account`), with a line saying it is what they sign in
  with, and to the household account on O20 (`/settings`), so the administration can pass it on.
- **„Auf diesem Gerät angemeldet bleiben" on A2, both tabs**, ticked by default, passed into the
  existing `signIn` `rememberMe` option. A2 has had no checkbox so far (join-by-link,
  Assumption 8), and without one the device memory below could not be opt-in. It is on both tabs
  because the household tab also accepts a resident's address and so also creates resident
  sessions (identity/sign-in). After this change, every path that creates a resident session (join,
  password-reset redemption, both sign-in tabs) shows the checkbox.
- **Device prefill via localStorage**: while a resident's session has `remember_me = true`, the
  resident frame writes the household sign-in code (and nothing else) into localStorage. When
  `remember_me = false`, it removes it. The value stays after sign-out, and the sign-in form
  prefills the field from it. Every read and write is wrapped in try/catch, and the form works
  without it.
- **Docs, in German, in the same change**: `docs/domain/identity.md` (`Household.sign_in_code`
  plus a note at O-12), `docs/screens/A-zugang.md` (A2), `docs/screens/E-einstellungen.md` (E1),
  `docs/screens/O-organisation.md` (O20), a new subsection in `docs/06-Compliance-Anhang.md` §10,
  a register row in `docs/review-log.md`, and `data-inventory.yml`.

## Capabilities

### New Capabilities
- `identity/household-sign-in-code`: what the household sign-in code is, how it is issued, that
  it is stable and not secret, and where it is shown.
- `identity/device-memory`: what the device may remember about a sign-in, when it writes and
  removes it, what it never holds, and what happens on a shared device.

### Modified Capabilities
- `identity/sign-in`: the resident name path identifies the household by its sign-in code, is rate
  limited, refuses an unknown code exactly like a wrong password, and offers „angemeldet bleiben".

## Impact

- **Guardrails touched.** G-C (authorization/visibility): a new `SECURITY DEFINER` function
  answers unauthenticated callers. It returns one household id for one exact code, and design D3
  argues it against join-code-protections' narrowness reasoning. G-B6/G-B7 (device storage):
  localStorage gains one value that is not applicant, deliberation or vote data, and design D6
  argues why the "only one exception" wording of G-B6 is not widened by it. G-A5: not touched,
  because this code is not a join code and grants nothing on its own. G-D: no guarded test changes
  or weakens. G-L: not touched.
- **Compliance.** § 25 Abs. 2 Nr. 2 TDDDG covers every kind of device storage, not only cookies.
  The justification is the explicit opt-in of the checkbox, and it is written into 06 §10 in German
  (design D6). `03-PRD.md` §6.5's *„Nur eine unbedingt erforderliche Sitzungs-Cookie"* stays true
  and unedited, because no cookie is added. The compliance subsection says so in so many words,
  rather than leaving it to a reader to notice.
- **Code.** `src/modules/identity/` (schema, repository, auth), `src/app/(auth)/sign-in/`,
  `src/app/(resident)/` (frame, `/account`), `src/app/(org)/settings/`, `src/ui/strings/de.ts`.
- **Database.** One migration (next free number after `0031`; `0029` is held by open PR #50): add
  the column with a DB-side default, backfill, unique index, NOT NULL. Plus a second file with the
  `SECURITY DEFINER` lookup for the human to apply.
- **Tests.** New integration tests (policy and raw-SQL for the definer), unit tests for the code
  shape and the form's storage. Existing `signIn` tests are untouched (the `householdId` path
  stays).

### Assumptions (recorded, not silently resolved)

1. **No rotation in this change.** The code is not secret, and changing it would invalidate every
   device's stored value. If the household asks for it, it is its own change.
2. **The UUID is not accepted in the form.** It was never shown to anyone, so accepting both would
   keep a second door open that nobody uses.
3. **The checkbox on the household tab also governs household-account sessions**: cleared gives a
   12 h session, the same rule as EC-2.10. A household session never reaches the resident frame, so
   it never writes device memory. The ticked default keeps today's 90-day behaviour.
4. **Rate limiting covers the resident name path only**, the path this change adds a lookup to.
   The email paths reach Supabase Auth from the server's address, so the provider's per-IP limit
   does not apply per visitor. Rate-limiting all sign-ins (§6.5) therefore remains a gap, named in
   the review-log row and not closed here.
5. **"Shown after joining" means E1**, one tap from the avatar menu. The joining device already
   has the code prefilled through device memory.
