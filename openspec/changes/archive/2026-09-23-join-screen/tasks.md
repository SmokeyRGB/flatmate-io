# Tasks

> **Before starting:** the branch sits on #19's merge (`b937864`), and the artifacts were revised
> against it. Re-read `openspec/config.yaml` and `CLAUDE.md`, especially *Implementation hazards*.
> Read Next's bundled docs (node_modules/next/dist/docs, API reference): the `error.js` and `loading.js`
> file-convention pages and the next.config.js `logging` page, before groups 4–5. This Next version's error
> boundary takes `{ error, retry }`.
>
> **What `npm run verify` checks now:** eslint, `next typegen && tsc --noEmit`, six lints under
> `scripts/lint/`, check-refs, then vitest, including `tests/unit/lint/cleanup-inventory.test.ts`
> and `tests/integration/policy/authorization-matrix.test.ts`. This change adds no table, so the
> cleanup inventory needs nothing.
>
> **No RLS-relevant change:** no table, policy, predicate or `SECURITY DEFINER` function is added
> or altered, so G-C7's two-sided rule has nothing new to cover. `test/guarded.manifest.json` stays
> byte-identical. **No statement the harness may refuse:** no migration, no DDL, so there is no
> human hand-off in this change.
>
> **Every test task names a deliberate break.** Apply the break, see the test fail, revert, see it
> pass, and **report each one seen failing** in the apply summary. A test not seen failing does not
> count.

## 1. Docs first: A3 records its states

> German prose (ADR-012). **Nothing under `docs/` may cite `openspec/`** (check-refs Rule 7).
> Frozen files (`04`, `05`, `07`) are not touched.

- [x] 1.1 `docs/screens/A-zugang.md` A3, table *Abweichende Zustände*:
  - Add **Leer — kein Code**: the entry field for the Beitrittscode (FR-2.27, P-1). The code arrives
    by POST, never in a query string (G-A5).
  - Extend **Fehler — Link nicht gültig** with the second way back, „Beitrittscode von Hand
    eingeben", offered both on opening and on submitting. The damaged code is not prefilled. Keep
    the existing quoted message unchanged.
  - Add **Keine Berechtigung — bei einem anderen Haushalt angemeldet** (EC-2.5): the explanation
    plus „Abmelden", on opening and on submitting. It ends only the visitor's own session and
    returns to the same invitation.
  - No Laden row, because Laden follows §6's default.
- [x] 1.2 `docs/review-log.md` §Offene-Punkte-Register: add one struck-through row, **Menschliche
  Entscheidung (2026-09-23)**, in the shape of the removal row from 2026-09-22. It records:
  - hand entry is its own step in front of A3 (reason: FR-2.9, and the bound shape);
  - Leer is read as "no code";
  - the household-UUID gap on resident sign-in (A2, O-12) is named and left open for its own
    change;
  - `next dev`'s request log prints the invitation path, and the dev config now ignores `/join/`.
    The production access log remains a deployment obligation.
- [x] 1.3 Run `node tools/check-refs.ts`: 0 findings.

## 2. Shared pieces: code shape, strings, styles, dev log

- [x] 2.1 `src/modules/identity/repository.ts`: add `isWellFormedJoinCode(normalised: string):
  boolean` directly beneath `normalizeJoinCode`, built from `JOIN_CODE_ALPHABET` and
  `JOIN_CODE_GROUP_LENGTH` (design Decision 3). Its comment says why it is the redirects' safety
  (I2) as well as a UX hint.
  In `tests/integration/policy/authorization-matrix.test.ts`, add it to `NOT_APPLICABLE` beside
  `normalizeJoinCode` with the same reason, *"pure helper — no SessionContext, no DB access"*.
  **Break:** leave the entry out, and the matrix test must fail naming `isWellFormedJoinCode`.
- [x] 2.2 `src/ui/strings/de.ts`: new keys under `join`:
  - the neutral heading („Du bist eingeladen");
  - the household chip, A3's *„Du trittst {Haushalt} bei."*;
  - the bound heading („Hi {Name}!"), which replaces the single-sentence `boundHeading`;
  - the invalid-link way back („Beitrittscode von Hand eingeben");
  - the Keine-Berechtigung sign-out button;
  - the error boundary's three **generic** strings (e.g. „Das hat gerade nicht geklappt.", the
    reassurance, „Erneut versuchen"), per design Decision 5;
  - the `signup_failed` text, rewritten as "nothing was created, try again". That is true because
    the join is one transaction.

  New `joinByCode` block: heading, Leer sentence, field label „Beitrittscode", format hint (the
  example shape only, never a real code), submit and pending labels. `auth.signIn` gains the link
  labels „WG gründen" and „Beitrittscode eingeben". Use §8.6 words only (`join_code` →
  „Einladungslink" / „Beitrittscode"), and let no model term reach a visitor (§12).
- [x] 2.3 `src/app/globals.css`, `@layer components`:
  - `.skeleton`: `--color-muted` fill, gentle pulse, no animation under `prefers-reduced-motion:
    reduce`;
  - `.context-chip`: secondary paper tint, 16 px radius.

  Existing tokens only, no new hue (09-Design-System.md).
- [x] 2.4 `next.config.ts`: add `logging: { incomingRequests: { ignore: [/^\/join\//] } }` with a
  comment citing G-A5 and saying it is dev-only (design Decision 11). Leave `serverFunctions` at
  its default.

## 3. `/join`: the manual entry screen (design Decisions 1, 4)

- [x] 3.1 `src/app/(auth)/join/actions.ts`: `enterJoinCodeAction(prevState, formData)`.
  1. Read `code` from the body.
  2. Apply `normalizeJoinCode`, then `isWellFormedJoinCode`.
  3. If the code is malformed or empty, return `{ error: formatHint }`, **with no copy of the
     input**.
  4. If it is well-formed, call `redirect(buildJoinUrl(null, normalised))`, outside any `try`.

  No `recordJoinAttempt`, no lookup, no `console.*`.
- [x] 3.2 `src/app/(auth)/join/join-code-form.tsx`: a client `useActionState` form.
  - Keep a `draft` of the raw input in `useState`, filled by an action wrapper before dispatch, and
    render the input with `defaultValue={draft}`.
  - One input, `name="code"`, with `autoCapitalize="characters"`, `autoComplete="off"` and
    `spellCheck={false}`.
  - The format hint shows beneath the field as helper text before any error, in the spirit of
    FR-2.10a.
  - **POST only:** no `method="get"`, no `next/form`.
- [x] 3.3 `src/app/(auth)/join/page.tsx`: a static page with the Leer sentence and the form
  (spec: *"No code is an empty state with a way on"*).

## 4. `/join/[code]`: A3's shapes and states

- [x] 4.1 `src/app/(auth)/join/[code]/join-screen-state.ts`: the `JoinScreen` union and
  `decideJoinScreen({ allowed, resolved, sessionHouseholdId })`, per design Decision 2. It is pure,
  with a type-only import of `JoinCodeResolution`.
- [x] 4.2 `src/app/(auth)/join/[code]/join-ways-forward.tsx`: two small components, used by both the
  page and the form (design Decision 10):
  - `HandEntryWayBack`: a `.btn-secondary` `next/link` to `/join`, with no prefill.
  - `SignOutAndReturnForm`: a form with a hidden `code` field posting to `signOutAndReturnAction`.
- [x] 4.3 `src/app/(auth)/join/[code]/page.tsx`:
  - Keep the order session → `recordJoinAttempt` → `resolveJoinCode`. Pass the results to
    `decideJoinScreen` and switch exhaustively (`never` default).
  - `already_member` keeps its redirect to `/dashboard?note=already_member`.
  - Delete the bare `Refusal`.
  - Render per design Decision 8:
    - `invalid_link`: callout plus `HandEntryWayBack`;
    - `rate_limited`: callout, no retry;
    - `other_household`: explanation plus `SignOutAndReturnForm`;
    - `neutral` / `bound`: heading, chip, `JoinForm`.
  - Rewrite the header comment, which today calls the route "deliberately NOT screen A3 yet".
- [x] 4.4 `src/app/(auth)/join/[code]/actions.ts` + `join-form.tsx` (design Decisions 4, 10):
  - `JoinFormState` becomes `{ error, fieldError, refusal }`, with
    `refusal: "invalid_link" | "other_household" | null`, set in the exhaustive `switch`. **No typed
    value enters the state.**
  - The form keeps `draft = { displayName, email, rememberMe }` in `useState`, filled from the
    `FormData` by an action wrapper before dispatch (never the password). Inputs render
    `defaultValue` / `defaultChecked` from `draft`, and `rememberMe` starts `true`.
  - Beneath an inline refusal, render `HandEntryWayBack` for `invalid_link` and
    `SignOutAndReturnForm` for `other_household`.
- [x] 4.5 `src/app/(auth)/join/[code]/loading.tsx`: a skeleton with a heading bar, a chip bar, and
  a card outline as tall as the **bound** form (design Decision 6).
- [x] 4.6 `src/app/(auth)/join/[code]/actions.ts`: `signOutAndReturnAction(formData)`, in exactly
  `src/app/(org)/sign-out-action.ts`'s shape (design Decision 7):
  - `getCurrentSession()`. If there is a session, `try { revokeSession(current.context,
    current.sessionId) } finally { clearSessionCookie() }`. Otherwise, `clearSessionCookie()` alone.
  - Then, outside the `try`, `redirect(buildJoinUrl(null, code))` for a well-formed body code, or
    `redirect("/join")` if it is malformed.
  - No check of its own on top of `revokeSession`, and no `console.*`.
- [x] 4.7 `src/app/(auth)/join/error.tsx`: `"use client"`, props `{ error, retry }`. It renders the
  three generic strings and a button calling `retry()`. **No `console.*`, no `error.message`, no
  `error.digest`** (design Decision 5). The comment cites G-A5 and Next's `browserToTerminal`
  forwarding.

## 5. Shell and entry points

- [x] 5.1 `src/app/(auth)/layout.tsx`: a shared centred `max-w-md` column with the brand mark
  (terracotta pill, serif „flatmate.io"; that is the product name, not copy). Check that sign-in
  and register still render correctly inside it, and drop any page-level wrapper that now doubles
  the padding.
- [x] 5.2 `src/app/(auth)/sign-in/sign-in-form.tsx`: beneath the card, add a `next/link` „WG
  gründen" → `/register` on both tabs, and on the Bewohner:in tab only, „Beitrittscode eingeben" →
  `/join`. Use `.btn-link`. Nothing else on sign-in changes (design Non-Goals).

## 6. Hand-testing aid

- [x] 6.1 `scripts/seed-demo-household.ts`: also create a **prepared** profile („Robin") and a
  **bound** link for it via `issueJoinCode` with its `residentProfileId`, and print it beside the
  other two links.
  - Use the administration account's own `context` and actor, exactly as the seed already creates
    Alex and Sam. #19's `assert*` helpers refuse an actor whose `accountId` differs from
    `context.accountId`.
  - `scripts/cleanup-demo-household.sql` must still remove everything. Check its delete set covers
    the new rows, and extend it if not.

## 7. Tests

> Real `flatmate-io-dev` for anything touching the database. Teardown in `afterEach`, never a
> `finally` inside the test. Assert codes and state fields, not only end states. Each task's
> **Break** is applied, seen failing, reverted, and reported.

- [x] 7.1 `tests/unit/identity/join-code-well-formed.test.ts`. Cases:
  - a valid code;
  - lower case with a space and no hyphen, after `normalizeJoinCode`;
  - wrong length;
  - each excluded character (I, O, 0, 1);
  - `../X`-style, `%2F`, `?` and `#` inputs;
  - the empty string.

  Every non-code must return false.
  **Break:** drop the alphabet check, so the function tests length and separator only. The
  excluded-character and `../X` cases must fail.
- [x] 7.2 `tests/unit/identity/join-screen-state.test.ts`. `decideJoinScreen` cases:
  - the rate limit wins over an invalid link and over another household's session;
  - an invalid link wins over any session;
  - a same-household session gives `already_member`, for neutral and for bound;
  - an other-household session gives `other_household`, for neutral and for bound (spec: *"A bound
    link has the same states as a neutral one"*);
  - no session gives `neutral` / `bound`, carrying the names.

  **Break:** swap the invalid-link and session checks. *"Invalid link wins over any session"* must
  fail. **Second break:** return `neutral` for a bound resolution. The bound case must fail.
- [x] 7.3 `tests/unit/identity/manual-join-code-entry.test.ts`. Mock `next/navigation`'s `redirect`
  to record its argument, the same precedent as the G-A5 test.
  - Messy input redirects to exactly `/join/UAMPN-QACVZ`, and the target has no `?`.
  - Malformed input returns the format hint, `JSON.stringify(state)` does **not** contain the raw
    input, and `redirect` is not called.
  - No `console.*` call contains the code.

  **Break:** return `{ error, value: raw }`. The "does not contain the raw input" assertion must
  fail. **Second break:** skip `isWellFormedJoinCode`, and the malformed case must redirect and
  fail.
- [x] 7.4 `tests/unit/identity/join-code-never-in-query-or-log.test.ts`: **extend, never weaken.**
  - For the missing-fields refusal, assert the returned state has `refusal: null`, and that
    `JSON.stringify(state)` contains **none** of the submitted name, email, password or code (the
    dev action log prints the previous state; design constraint 5).
  - Add the manual-entry action to the "no log line contains the code" cases.

  **Break:** add `values: { displayName, email }` to the returned state. The name/email assertion
  must fail.
- [x] 7.5 `tests/unit/identity/join-error-boundary-silent.test.ts`: read
  `src/app/(auth)/join/error.tsx` as text and assert it contains no `console.`, no `.message` and
  no `.digest`. It is a guard in the style of `scripts/lint/`, and its comment names G-A5.
  **Break:** add `console.error(error)`, and it must fail.
- [x] 7.6 `tests/integration/policy/join-sign-out-and-return.test.ts`: a real registered household
  with two sessions for the same account (sign in twice). Mock `next/headers` `cookies()` to present
  session A's cookie, and call `signOutAndReturnAction` with a live link's code. Assert:
  - session A's `revoked_at` is set, and it is the only column the revocation writes. Compare the
    row's other columns before and after, per the tasks rule on status transitions;
  - session B is untouched;
  - `redirect` received `/join/<that code>`;
  - a malformed body code redirects to `/join`;
  - the cookie was cleared in both cases.

  Cleanup goes in `afterEach`.
  **Break:** remove the `revokeSession` call, and "A revoked" must fail. **Second break:** redirect
  to `buildJoinUrl(null, rawBodyCode)` without the shape check, and the malformed case must fail.

## 8. Verify and walk through

- [x] 8.1 `npm run verify` is green: type-check, lints and the full suite against
  `flatmate-io-dev`. Row counts are back to zero afterwards.
- [x] 8.2 Dev-server walkthrough at 390 px and at desktop width, light and dark. Use
  `npm run seed:demo`, a signed-out browser profile, and a preview screenshot of each step:
  1. neutral link;
  2. bound link („Hi Robin!", password only);
  3. loading skeleton (throttled);
  4. `/join` with no code;
  5. `/join` with a malformed code: the format hint, with the input still in place;
  6. `/join` with the reusable code typed in lower case with a space;
  7. the used-up founding link: the invalid-link message and the hand-entry link;
  8. a taken name: name and email survive, and the password is empty;
  9. a cleared „angemeldet bleiben" that survives a refusal;
  10. **submit-time invalid link**: open a live link, delete it on O16 in another profile, then
      submit. The hand-entry link must appear inline;
  11. signed in to a **different** household (register one via the new sign-in link), opening a
      demo link: Keine Berechtigung → Abmelden → the same invitation;
  12. **submit-time other household**: open a link signed out, sign in to another household in a
      second tab, then submit. The inline sign-out appears and returns to the invitation;
  13. sign-in's two links.

  **Read the dev-server log** (`preview_logs`) after steps 5, 6, 8, 11 and 12. It must contain no
  code, no name, no email and no password. Note any line that does, and stop.
  **Rate-limited:** trip it once, then empty `join_attempt` via the cleanup script's section.
  **The error boundary** is covered by 7.5 plus a read of the file. **If steps 8 or 9 fail**,
  apply design Decision 4's fallback and walk them again. Name any step not walked in the PR
  description.
- [x] 8.3 `openspec validate join-screen --strict`, then `/opsx:archive join-screen` before the
  PR, so the archived record lands with the code.
