## Why

The check-in presentation has to be given in English, and the app speaks only German. Switching
between a German screen and an English talk throughout the demo gets in the way. The human therefore
decided on 2026-10-07 to make the UI language a per-person choice now rather than in v2. A German
resident and an English-speaking resident of the same WG each see the app in their own language,
and someone who reads no German can still register or join.

This is a **scope extension**. `docs/03-PRD.md` states it as excluded: *„UI deutsch in v1.
Mehrsprachigkeit ist **nicht** aktiviert (siehe Hinweis vor §4.6)"*, and the note before §4.6 says
*„Zu §4.5 Mehrsprachigkeit / Lokalisierung: nicht aktiviert."* ADR-006's 2026-09-16 Ergänzung
anticipated the need (*„englischsprachige Bewohner:innen in deutschsprachigen WGs sind ein
plausibler späterer Bedarf"*). It also said explicitly that it was *„**kein** Auftrag,
Mehrsprachigkeit in v0.1 zu bauen"*. The human's decision of 2026-10-07 lifts that exclusion.
Recording it in `docs/` is part of this change (see Impact), so the change does not silently
redefine the spec.

No F-packet or S-* line requires a UI language choice. The change serves the human's decision
above. It builds on the structure `openspec/specs/ui/vocabulary` already requires: *„the table
exists so that the second one does not require touching every screen"*.

## What Changes

- **English becomes a second UI language.** `src/ui/strings/en.ts`, which the human translated
  ahead of time, becomes tracked. It is type-checked key for key against `de.ts`, so a key added in
  German and missing in English fails the build.
- **Each account chooses its language.** The choice is stored on the account
  (`account.locale`, a column that already exists, defaults to `de` and is never read today) and is
  limited to `de` and `en` by a database CHECK. It applies to every role: residents, the household
  account and non-resident moderators.
- **A language toggle in the shared profile menu**, available on the resident and the organisation
  surface alike.
- **A language toggle on the sign-in, register and join screens**, before any account exists. It is
  remembered on the device in a cookie. A visitor who never touches it gets English only if their
  browser prefers English over German, and German otherwise.
- **A new account starts in the language it was created in.** Registering, joining or claiming a
  profile while the toggle shows English creates an account set to English.
- **The page declares its actual language** (`<html lang>`), and the document description and
  date formatting follow it.
- **Text handed to people outside the app stays German.** Examples are the invite text a moderator
  copies to an applicant and the join-link text. The switch changes UI chrome only. Content
  applicants entered is never translated.

## Capabilities

### New Capabilities
- `ui/language-choice`: who chooses the UI language and where (profile menu, pre-account toggle),
  where the choice is kept (the account; a device cookie before an account exists), the order in
  which a request's language is decided, and how a new account inherits it.

### Modified Capabilities
- `ui/vocabulary`: "The application speaks German" becomes "The application speaks the viewer's
  language": the document declares the language actually shown, and no screen mixes the two. A new
  requirement states that both tables carry the same keys, enforced at build time. Another states
  that text addressed to people outside the app stays German. The fixed-vocabulary requirement (§8.6)
  stays binding for the German table.

## Impact

- **Guardrails touched:**
  - **G-C** (authorization): the language setter acts on `context.accountId` only, never on a
    caller-supplied id. It is recorded in the authorization matrix as self-service.
  - **G-F** (data inventory): the column `account.locale` is already inventoried as category ⚙️ in
    `data-inventory.yml`, and no new column is added. The pre-account cookie holds only a language
    the visitor actively chose, never personal data.
  - **G-D** and **G-L**: untouched.
- **Code:**
  - `src/ui/strings/`: the type contract, a request-scoped server accessor, and a client provider
    and hook.
  - About 81 files that import `@/ui/strings` move to the request's dictionary.
  - The root layout and the `(auth)` layout.
  - `src/app/_frame/avatar-menu.tsx`.
  - `src/modules/identity/repository.ts`: a new setter, and the locale read alongside the session.
  - `src/modules/identity/auth.ts`: the three account-creating paths take a locale.
  - Two `toLocaleDateString("de-DE")` call sites.
- **Database:** one migration adding a CHECK on `account.locale`. Its number is the next free one
  after F5 `candidate-detail`'s `0035`.
- **Tests:**
  - A key-parity test.
  - Integration tests for the setter (own account only, value refused outside `de`/`en`) and for
    account creation inheriting the language.
  - The authorization-matrix entry.
  - Existing tests keep asserting through `de.*`, since German stays the default.
- **Docs (human decision of 2026-10-07, recorded in the same commit):**
  - `docs/03-PRD.md`: the language row and the note before §4.6.
  - ADR-006: a further Ergänzung.
  - `docs/screens/rahmenwerk.md` §8.6: the Architekturhinweis, plus the menu entry.
  - `docs/screens/A-zugang.md`: the pre-account toggle.
  - `docs/SPEC-INDEX.md`: the language row.
  - `docs/review-log.md`: the decision.
- **Ordering:** lands **after** F5 `candidate-detail` (human, 2026-10-07). That change owns
  migration `0035`, adds `de.ts` keys and edits several of the client components this change
  sweeps. This change is rebased onto main once F5 has merged.

### Assumptions

- **A1.** English wording is `en.ts`'s own. `rahmenwerk.md` §8.6 fixes German words only and has no
  English counterpart. Consistency of English terms is reviewed as copy in this change, not derived
  from a binding table.
- **A2.** The two language names in the toggle are each written in their own language ("Deutsch",
  "English") in both tables. This way a person who cannot read the current language still finds
  their own.
- **A3.** Signing out does not reset the device's language cookie. The sign-in screen keeps showing
  the language the device last chose.
