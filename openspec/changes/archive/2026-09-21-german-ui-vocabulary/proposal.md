# Proposal

## Why

**The app speaks English. The specification says it speaks German, and says so in a Confirmed-tier
ADR.** `adr/0006-stack-nextjs-postgres-drizzle.md`, carried verbatim in
`screens/rahmenwerk.md` §8.6:

> v0.1 liefert nur diese `de`-Tabelle, aber die Struktur soll von Anfang an **eine
> Schlüssel→Text-Tabelle sein, kein Text inline im Code** […] Kein Mehrsprachigkeitssystem in v0.1
> bauen, nur nicht die spätere Erweiterung durch inline-Strings verbauen.

Neither half holds today. All 20 `.tsx` files under `src/app/` (~1050 lines) carry inline English:
`"Members"`, `"Join code"`, `"Rotate join code"`, `"Something went wrong completing sign-in."` Not
one German string exists in the application. `src/app/layout.tsx` declares `lang="en"`.

**Why now, rather than later.** This surfaced while planning F2's first slice, which adds roughly a
dozen strings to screen O16 — one of which `rahmenwerk.md` §8.6 names by force: invalidating a link
is **"Löschen"**, *„**nicht** „Widerrufen" und **nicht** „Zurückziehen""*. Writing `"Delete"`
violates §8.6. Writing `"Löschen"` into an otherwise-English screen is incoherent. F2 goes on to add
three screens (A3, B1, and the manual-entry path). Doing this after F2 means translating three more
screens and unpicking three more sets of inline strings; doing it now means F2 is built on the right
foundation. It is the cheapest this change will ever be.

## What Changes

- **A key→text table** holding a single `de` locale becomes the only source of user-facing text.
  Components and server actions reference keys; no user-facing literal remains in a component.
- **Every string in the 20 `.tsx` files** moves into it, translated into German. `rahmenwerk.md`
  §8.6 is binding wherever it speaks; the rest is new copy (see Assumptions 1).
- **Every user-facing error string returned by a server action** moves too, and this is where the
  change stops being a translation. `claim/actions.ts:64,70`, `register/actions.ts:46,52`,
  `sign-in/actions.ts:37` and `members/actions.ts:53` do `return { error: err.message }` or
  `{ error: sessionErr.message }` — putting a raw domain-error string, or a raw **Supabase Auth**
  string, in front of the resident. Trying to key those messages exposed two defects that were
  invisible while everything was English prose:

  - **A domain error class is not one message.** `SignInError` is thrown with six different texts,
    `ClaimError` with three, including `` `ResidentProfile not found: ${residentProfileId}` `` —
    a model term *and* a raw UUID, shown to whoever triggered it. That is precisely what §12
    forbids. So the error classes whose messages reach a form gain a **discriminant code**, and
    actions map the code to a key. Mapping the class alone would flatten six conditions into one;
    matching on message text would be worse.
  - **`SignInError("No such resident in this household")` versus
    `SignInError("Invalid credentials")` tells an unauthenticated visitor whether a name exists in
    a household.** It is the same disclosure F2's FR-2.8 refuses to make about join links, on the
    same reasoning, one screen earlier. **These two collapse to one key** — see Assumption 6,
    because unlike everything else here it changes what a user sees happen.
- **`lang="en"` becomes `lang="de"`** in `src/app/layout.tsx`, and `metadata.description` is
  translated. A screen reader pronouncing German text with an English voice is an accessibility
  defect, and §12 is where this change's accessibility obligations live.
- **One test stops asserting on a rendered English string.**
  `tests/unit/casting/new-round-page-permission-guard.test.ts:44` asserts
  `toContain("don&#x27;t have permission")`; it will assert through the table, never against a
  German literal copied into the test.

**No schema change. No new dependency. One deliberate behaviour change** — the sign-in
enumeration fix above, which is recorded as Assumption 6 rather than slipped in.

## Capabilities

### New Capabilities

- `ui/vocabulary`: how the application's user-facing text is sourced, named and rendered — that it
  comes from one table rather than from components, that it is German in v0.1, and that terms the
  specification fixes are used exactly as fixed.

### Modified Capabilities

None — `openspec/specs/` is still empty. This change and `identity/join-code` are the first two to
seed it.

## Impact

**Guardrails this change touches**, named plainly:

- **G-N6** — not touched. The four mandatory screen states are a separate obligation; this change
  translates whatever states exist, and adds none.
- **G-C, G-D, G-L** — **none of the three hard-floor classes is touched.** No authorization or
  visibility rule changes, `test/guarded.manifest.json` stays byte-identical, and nothing here
  decides anything, so the P-5 boundary is not in play.
- **G-A5** — indirectly relevant and worth stating: the join code is referred to in the UI as
  *„Einladungslink"*, and no key's *value* may ever contain a code. Keys are static text.
- **ADR-012** — the language rule this change turns on. Implementation-facing identifiers stay
  English, so **the keys themselves are English** while their values are German. A key named
  `mitglieder.titel` would make the table itself a translation problem.

**Code:** all 20 `.tsx` files under `src/app/`; the `actions.ts` files under `(auth)/claim`,
`(auth)/register`, `(auth)/sign-in`, `(org)/members`, `(org)/rooms`, `(org)/rounds`,
`(org)/settings`; one new module for the table; `src/app/layout.tsx`; one test.

**`src/modules/**` is touched after all**, narrowly: the error classes whose messages currently
reach a form gain a discriminant code, and `SignInError`'s two enumeration-distinct throws
converge. Their English `message` stays as it is — it is developer-facing and belongs in the log.

**Not touched:** `src/db/**`, `drizzle/**`, `data-inventory.yml`, and every module error class
whose message never reaches a screen (`PayloadValidationError`, the transition errors).

## Assumptions

Recorded rather than silently resolved.

1. **Most of this is authorship, not translation.** §8.6 is a table of *model terms* — `moved_out` →
   „Ausgezogen", hard removal → „Entfernen", `join_code` → „Einladungslink"/„Beitrittscode",
   invalidation → „Löschen". It does not supply button labels, headings, empty states or error
   copy. Those are written here, with the prototype screenshots
   (`coursework/exercise-12/`, untracked, design/UX reference only) as the tone reference. Where
   §8.6 speaks, it wins outright.
2. **The table is a plain typed module, not a library.** ADR-006 forbids building a
   multi-language system in v0.1 while forbidding inline strings. A typed object with a `de` locale
   satisfies both and adds no dependency. Choosing `next-intl` or similar would be a decision
   ADR-006 explicitly defers.
3. **Address form is `du`, not `Sie`.** Every German string already in the specification uses it —
   §8.6's own entries (*„bis **du** abgestimmt hast"*), the S-49 warning (*„Teile **diesen** Link
   nur direkt mit **deinen** Mitbewohnenden"*). Not a new decision; recorded because it is a
   pervasive choice that would be expensive to reverse.
4. **Gender-inclusive forms follow the specification's existing usage** — *„Bewohner:innen"*,
   *„Mitbewohner:innen"*, as §8.6 and the screen documents already write them. Colon form, not
   asterisk, not generic masculine.
5. **`metadata.title` stays "Flatmate.io".** It is the product name, not copy.
6. **Sign-in stops distinguishing "no such resident" from "wrong password".** This is the one
   user-visible behaviour change in the change, and it is a narrowing, not a regression: today an
   unauthenticated visitor can learn whether a display name exists in a household by watching which
   message comes back. Keying the two messages separately would preserve that; keying them together
   removes it. The same argument F2 accepted for FR-2.8's single refusal message. **If this is
   unwanted, say so before apply** — it is cheap to keep two keys and expensive to un-ship the
   narrower behaviour later.
