# Proposal

## Why

`join-by-link` (change 2, PR #17) shipped `/join/[code]` working but plain, and said so as its own
Assumption 6: *"The join route ships functional and plain; A3 ships in change 3."* `main` has
carried a join screen that does not meet **G-N6** since then — *„Jeder Bildschirm führt die vier
Pflichtzustände"* — for the path `screens/A-zugang.md` A3 calls *„der kürzeste, meistgenutzte Pfad
der Anwendung"*. The screen also has no way in except a link. `docs/backlog/requirements/F2-requirements.md`
**FR-2.27**:

> There shall be a way to enter a join code by hand, without a link. This is what makes FR-2.26
> worth anything and what P-1 actually asks for; a code that is typeable but has nowhere to be
> typed satisfies nothing.

Its user story, **US-2.15**, is the case the usability test ran into: *"As a resident whose link
will not open, I want to be able to type the code by hand, so that a broken link is not the end of
the road."* The prototype's refusal was found to have *"no recovery path"*. Today's refusal names
one way back (ask a flatmate), and nothing on it lets the visitor type a code.

Two entry points were moved from change 2 to this one on 2026-09-22. `/register` can only be
reached by typing its URL: `/` redirects to `/sign-in`, and `/sign-in` links nowhere since `/claim`
was deleted. And sign-in offers a person holding a code nowhere to type it.

## What Changes

- **A new `/join` route, the manual entry screen (FR-2.27, US-2.15).** It has one field,
  „Beitrittscode" (`rahmenwerk.md` §8.6). The code is submitted by POST and normalised as EC-2.15
  requires. Then the visitor is redirected to `/join/<CODE>`, so the code reaches the invitation
  route as a path segment and never as a query string (G-A5). A code that cannot be one (wrong
  length or characters no code uses) is refused inline with a format hint. That happens before any
  lookup, so it is not a redemption attempt. Human decision of 2026-09-23: a route of its own, not
  a field on the sign-in tab. See Assumptions 1 and 2.
- **Screen A3 on `/join/[code]`, in both shapes.** A *neutral* link shows the household chip
  (*„Du trittst … bei"*) with name, password, optional email and "stay signed in". A *bound* link
  shows the greeting by the prepared profile's name and asks only for the password. The visual
  treatment follows `docs/09-Design-System.md`, and a shared `(auth)` shell carries the brand mark.
  No field is added or removed. Both shapes are change 2's.
- **The four mandatory states (`rahmenwerk.md` §6), for both shapes:**
  - **Laden**: a skeleton in the shape of the heading, household chip and card, with no field
    rows. The skeleton renders before the link is resolved, so it cannot know which shape follows,
    and §6 forbids *„Layoutsprung"*.
  - **Leer**: arriving with no code at all is `/join`. Assumption 1.
  - **Fehler**: FR-2.8's single invalid-link message, which keeps *„Frag in der WG nach einem
    aktuellen Link"* and **gains a way to type the code by hand**. Also the rate-limited refusal,
    kept distinguishable per change 2's Assumption 3. An unexpected failure shows §6's *„Erneut
    versuchen"* and the assurance that nothing was lost, never the failure's own text.
  - **Keine Berechtigung**: EC-2.5, a visitor signed in to a different household. The screen
    explains why, and **offers signing out right there**, which returns the visitor to the same
    invitation. Today the text says „Melde dich ab" and offers no way to do it.
- **A refused submission keeps what was typed.** React 19 resets a form's uncontrolled fields after
  every form action that does not throw, and a reducer that returns `{ error }` does not throw. So
  today a `name_taken` refusal (AC-2.17: *"with a way forward"*) empties the very field it asks the
  visitor to change. Name, email and "stay signed in" are kept in the browser and put back. The
  password is not. The server never sends what was typed back. Assumption 5.
- **Every refusal a submit can produce gets the same way forward as the page.** A link deleted
  mid-registration (EC-2.9) is refused on submit, and so can a visitor who signed in to another
  household in the meantime. The hand-entry link and the sign-out appear inline there too.
- **Sign-in gains two links**: *WG gründen* → `/register`, and *Beitrittscode eingeben* → `/join`.
  Sign-in is not otherwise restyled.
- **`screens/A-zugang.md` A3 records the new states**, with one register entry. The rows cover
  Leer, the manual-entry recovery on the invalid-link refusal, and EC-2.5's sign-out. §6 asks for a
  state to be written into the screen's own entry wherever it departs from the default, and every
  one of these does. Assumption 3.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `identity/join`:
  - **Added: a code can be entered by hand** (FR-2.27, AC-2.24, EC-2.15).
  - **Added: the join screen carries §6's four states** (G-N6).
  - **Added: a refused submission keeps what was typed** (AC-2.17, §6).
  - **Added: sign-in leads to the two ways in** that are not sign-in.
  - **Modified: "A refused join says one thing and names a way back"** gains hand entry as a second
    way back.
  - **Modified: "Someone who already belongs is not made to join again"** gains the sign-out way
    forward for EC-2.5.

## Impact

**Guardrails this change touches:**

- **G-N6**: the reason for the change. It closes the gap change 2 named in its Assumption 6.
- **G-A5**: *„Der Code wandert ausschließlich im Pfad des Einladungslinks und im Anfragekörper."*
  Hand entry is the POST case the 2026-09-21 addendum names. The manual-entry action and the
  sign-out-and-return action both read the code from the body. Both redirect to a path assembled
  only from a code that has passed the format check, and both never write a query string. The new
  error boundary must neither log the error nor render its text, because an unexpected failure on
  this route must not become the log line G-A5 forbids. **Two logs `next dev` writes were found in
  planning.**
  - The dev request log prints `GET /join/<CODE>`. Change 2's Assumption 7 (*"This application
    writes no access log"*) held for production only, so `next.config.ts` now tells the dev log to
    ignore `/join/` paths.
  - The dev action log prints each server action's arguments as JSON. A `FormData` prints as `{}`,
    but the previous state prints in full, so no action on this route carries a code, name, email or
    password in the state it returns.

  The production access log stays a deployment obligation, as change 2 recorded.
- **G-C**: not moved. Sign-out on the Keine-Berechtigung state ends only the visitor's **own**
  session, through the existing `revokeSession`, which #19 narrowed to exactly that (it refuses any
  session whose account is not the caller's). It can now throw, and the new action clears the
  cookie regardless, in `signOutAction`'s shape.
- **G-C1 / G-C8**: no new database access. The new actions call identity module functions that
  already exist, plus one pure format check. Nothing under `src/app/` touches the client.
- **G-C7**: no table, policy or RLS predicate changes, so there is no new two-sided test. That is
  stated here, not left out silently.
- **G-D**: `test/guarded.manifest.json` stays byte-identical. None of the pending entries is F2's.
- **G-L / P-5**: not in play.

**Code:**
- New routes under `src/app/(auth)/join/`: `page.tsx`, `actions.ts`, `join-code-form.tsx`.
- New files under `src/app/(auth)/join/[code]/`: `loading.tsx`, `error.tsx`.
- Changed: `page.tsx`, `join-form.tsx` and `actions.ts` in `src/app/(auth)/join/[code]/`, plus
  `src/app/(auth)/layout.tsx` and `src/app/(auth)/sign-in/sign-in-form.tsx`.
- `src/ui/strings/de.ts`, `src/app/globals.css` (skeleton and chip),
  `src/modules/identity/repository.ts` (one pure, exported format check beside
  `normalizeJoinCode`), recorded as NOT_APPLICABLE in
  `tests/integration/policy/authorization-matrix.test.ts`.
- `next.config.ts`: the dev request log ignores `/join/` paths (dev only; human decision of
  2026-09-23).

**Docs:** `docs/screens/A-zugang.md` A3 and `docs/review-log.md` §Offene-Punkte-Register. Both are
living files, neither is frozen, and neither points into `openspec/`.

**Compliance:** name and email stay in the visitor's own browser between a refusal and the retry.
They are never returned by the server, so they cannot reach the dev action log, and this change
persists nothing new (G-B3).

## Assumptions

1. **"Leer" on A3 means arriving with no code.** A3 has no list, so a literal empty list does not
   exist here. §6 defines Leer as *„Ein Satz, was hier normalerweise steht, plus die eine sinnvolle
   Handlung"*. A visitor on the join path with no code is exactly that case, and the sensible
   action is to type the code. This is a reading of §6, not a quotation of it. Recorded in A3 by
   the docs task, so that it can be challenged.
2. **Manual entry is a step in front of A3, not a code field on A3.** Change 2's design Decision 10
   pictured the manual screen as *"a form that posts a typed code to this same action"*. That
   cannot meet FR-2.9 (*"display the household's name before any input is requested"*). And a
   bound link needs its greeting and **one** field, which cannot be known before the code is
   resolved. So `/join` resolves nothing: it only normalises the code and redirects. The format
   check refuses a string that cannot be a code at all. A malformed string is never checked
   against a link, so refusing it discloses nothing FR-2.8 protects, and consumes no FR-2.28
   attempt.
3. **The invalid-link refusal stays a Fehler state**, as A3's own table labels it (*„Fehler — Link
   nicht gültig"*), even though §6's Keine-Berechtigung wording (*„warum plus wer helfen kann"*)
   would also fit. Keine Berechtigung is EC-2.5. This proposal does not reclassify a state the
   screen document already classifies.
4. **A completed join still lands on `/dashboard` (screen O1).** This is carried over from change
   2's Assumption 4, unchanged. FR-2.18 and A3 require Start (B1), which change 4 builds. R-2.5's
   failure (*"residents arrive and stall"*) is why this is named, not left implicit. This change
   makes the path in better and leaves the landing as it was.
5. **The password is typed again after a refusal.** Name, email and "stay signed in" are put back
   from the browser's own copy. The password is not, because keeping a secret around in the page is
   worse than one retyped field.
   §6's *„nichts verloren"* is read as referring to what the visitor chose (their name), not to a
   credential.
6. **Resident sign-in asks for a household UUID that nobody who joined by link has ever seen:
   named here and deliberately left out** (human decision, 2026-09-23). A2 promises the field
   *„vorbelegt, wenn das Gerät „angemeldet bleiben" hält"*, and nothing prefills it. So once a
   joiner's session ends, sign-in is a dead end one screen away from this change. The fix touches
   O-12 and A2, not A3, and it needs its own design (a device cookie alone fixes only one device).
   Filed as separate work. This change adds a *Beitrittscode eingeben* link to that tab and nothing
   more.
7. **This change was revised against #19 (`chore/review-lessons`) after it merged.** #19 added
   planning rules to `openspec/config.yaml`, a type-check and new lints to `npm run verify`, the
   authorization matrix test, and the narrowed `revokeSession`. The branch sits on #19's merge. The
   artifacts were revised with `/opsx:update` before any apply, and the revision's pre-mortem
   produced the log findings under G-A5 and the submit-time refusals.
