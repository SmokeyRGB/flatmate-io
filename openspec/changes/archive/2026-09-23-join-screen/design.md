# Design

## Context

See proposal.md — Why. The motivation is not restated here. What follows is the state change 2
left behind and the constraints it puts on this change.

`src/app/(auth)/join/[code]/page.tsx` is a server component with a fixed order: read the session,
record the attempt (FR-2.28, **before** any lookup: AC-2.25), resolve the code (non-consuming), and
then branch on the session (EC-2.4 redirects, EC-2.5 refuses). Every refusal renders one bare
`<p className="field-error">`. `join-form.tsx` is a `useActionState` client form. Its reducer
`joinHouseholdAction` returns `{ error, fieldError }` for each `JoinError` code and re-throws
anything else. The code travels as a hidden field.

Four constraints shape the decisions below:

1. **React 19 resets a form after every action that does not throw.** Its docs say a
   `<form action>` *"resets automatically after submission"*. A reducer returning `{ error }` has
   not thrown, so every inline refusal today clears the name, the email **and** the "stay signed
   in" box. The last one quietly undoes EC-2.10's clearable choice on a retry.
2. **The test suite has no DOM.** `vitest.config.ts` runs `environment: "node"` against
   `tests/**/*.test.ts`. Nothing renders a component. Screen states are therefore tested through
   the pure decisions behind them and checked visually by a walkthrough. No test renderer is added
   (Non-Goals).
3. **This Next version is not the one in training data.** Per
   the `error.js` file-convention page in Next's bundled docs (node_modules/next/dist/docs, API reference, file conventions), an error
   boundary receives **`{ error, retry }`**. `retry` replaced the older `reset`. The doc's own
   example calls `console.error(error)`, which this route must not do (Decision 5).
   `loading.js` wraps the segment's page in a Suspense boundary and is shown immediately on
   navigation.
4. **G-A5 permits exactly two carriers:** the path of the invitation link and the request body.
   `next/form`, and any `method="get"` form, turns fields into a query string, so neither may carry
   the code.
5. **`next dev` writes two logs by default** (the `logging` page of Next's bundled docs, API reference, next.config.js options).
   - The **request log** prints every incoming path, so `GET /join/<CODE>` too.
   - The **server-function log** prints every action call with its arguments.
     `node_modules/next/dist/server/dev/server-action-logger.js` stringifies each argument with
     `safe-stable-stringify` at depth 2. A `FormData` has no own enumerable properties and prints
     as `{}`. A reducer's **previous state prints in full**.

   So anything an action returns into its state is in the dev terminal on the next submit.
   Change 2's Assumption 7 (*"This application writes no access log"*) is true only for
   production.

## Goals / Non-Goals

**Goals:**
- Every A3 state is produced by one pure function the suite can test, and the page component
  only renders what that function returns.
- Any URL built from input the visitor typed is assembled only from a string that has passed the
  code-shape check. No action redirects to a path it did not construct itself.
- No new database access, table or dependency.

**Non-Goals:**
- **No test renderer** (jsdom, Testing Library). It would be a new dependency class for one
  change, and the decisions it would test are already pure functions (Decision 2).
- **Sign-in's own reset problem is not fixed here.** The resident tab loses its name field on
  `invalid_credentials` for the same React reason as constraint 1. Sign-in only gains two links in
  this change. The fix belongs to the separate household-UUID work (proposal Assumption 6), which
  reworks that form anyway.
- **B1 is not built.** Joins still land on O1 (proposal Assumption 4).

## Decisions

### 1 · `/join` normalises and redirects, and resolves nothing

`src/app/(auth)/join/page.tsx` is a static page. It holds one field, `code`, in a `useActionState`
form (`join-code-form.tsx`). Its reducer `enterJoinCodeAction` in `src/app/(auth)/join/actions.ts`:

1. reads `code` from the body,
2. applies `normalizeJoinCode`, then `isWellFormedJoinCode` (Decision 3),
3. if the code is malformed, returns `{ error: formatHint }` and **nothing else**. The typed input
   is kept by the form itself (Decision 4), never returned. A near-miss of a real code would
   otherwise sit in the previous state and print in the dev action log on the next submit
   (constraint 5),
4. if it is well-formed, calls `redirect(buildJoinUrl(null, normalised))`. That is outside any
   `try`, per the server-action convention.

**It records no join attempt and calls no lookup.** The attempt is recorded where the lookup
happens, on `/join/<CODE>`'s GET and on the submit, exactly as change 2 built it. A malformed
string is never an attempt, because nothing is checked (spec: *"SHALL NOT count as a redemption
attempt"*).

**Alternatives rejected:**
- **One combined form** (code + name + password), change 2's design Decision 10 sketch. It asks
  for fields before the household name is known, which violates FR-2.9. It also cannot know whether
  to render one field (bound) or two.
- **Client-side `router.push`.** It needs JavaScript to reach A3 at all. A POST action with a
  server redirect also works as a plain HTML form, which P-2 favours, and it keeps the code out of
  client routing state until it is a path.
- **`next/form` / GET.** It puts the code in a query string (constraint 4).

### 2 · A3's states come from one pure decision

New `src/app/(auth)/join/[code]/join-screen-state.ts` exports:

```ts
type JoinScreen =
  | { kind: "rate_limited" }
  | { kind: "invalid_link" }
  | { kind: "already_member" }            // page redirects: EC-2.4
  | { kind: "other_household" }           // Keine Berechtigung: EC-2.5
  | { kind: "neutral"; householdName: string }
  | { kind: "bound"; householdName: string; displayName: string };

function decideJoinScreen(input: {
  allowed: boolean;
  resolved: JoinCodeResolution; // already includes null
  sessionHouseholdId: string | null;
}): JoinScreen;
```

`page.tsx` keeps the fixed order (session → attempt → resolve), then passes the three results in
and switches exhaustively on `kind`. The order of the checks inside the function is the order of
the page today. The rate limit wins over everything, and an invalid link wins over the session
branch, because EC-2.5's refusal is a statement that *this* link is fine. `JoinCodeResolution` is the
type `resolveJoinCode` already returns. The function imports it as a type and calls nothing.

**Why a function, not the page's own `if`s:** constraint 2. Without it, the only test of *"a bound
link has the same states as a neutral one"* is a person clicking through them. The function lives
beside the route, not in `src/modules/identity/`, because it maps domain results to screen states,
which is a UI concern (ADR-001).

### 3 · The code's shape has one definition

`isWellFormedJoinCode(normalised: string): boolean` is added to
`src/modules/identity/repository.ts`, directly beside `normalizeJoinCode`, and uses the existing
`JOIN_CODE_ALPHABET` and `JOIN_CODE_GROUP_LENGTH`. It returns true only for two groups of five
alphabet characters joined by `-`. It is pure and touches no client.

- **Why beside `normalizeJoinCode`, not a regex in the route:** a second copy of the alphabet would
  drift from the generator, and the alphabet deliberately excludes I, O, 0 and 1.
- **Why it matters for more than UX:** it is the reason the two redirects in this change are safe.
  The alphabet contains no `/`, `.`, `%`, `?` or `#`. A well-formed code is therefore a single path
  segment by construction, and `buildJoinUrl`, which does not encode, is correct for it. A
  malformed input never reaches a redirect.
- **Authorization matrix:** `tests/integration/policy/authorization-matrix.test.ts` (#19) fails on
  any exported `identity`/`casting` repository function without a recorded decision. This one goes
  into its `NOT_APPLICABLE` map beside `normalizeJoinCode` and `buildJoinUrl`, with the same
  reason: *"pure helper — no SessionContext, no DB access"*.

### 4 · The browser keeps what the visitor chose; the server never sends it back

`join-form.tsx` holds a `draft` in `useState`: `{ displayName: "", email: "", rememberMe: true }`.
The form's `action` is a small wrapper:

1. read `displayName`, `email` and `rememberMe` from the `FormData` into `draft` (not the
   password),
2. then dispatch the `useActionState` action with the same `FormData`.

The inputs render `defaultValue` / `defaultChecked` from `draft`. The dispatch runs in the same
transition as the `draft` update, and React's post-action reset restores the defaults rendered in
that transition, not empty fields. The password input has no `defaultValue` and is never copied
anywhere, so it is empty after every refusal (proposal Assumption 5). `draft.rememberMe` starts
`true` (FR-2.12) and follows the visitor's choice afterwards (EC-2.10).

`/join`'s `join-code-form.tsx` does the same with its one field.

**`JoinFormState` carries no typed value.** It stays `{ error, fieldError, refusal }` (Decision 10
adds `refusal`). The reducer's state is the previous-state argument of the next call, which
constraint 5 prints in the dev terminal. The first draft of this decision echoed name and email
through the state. The pre-mortem found that it would put them in that log.

**Alternatives rejected:**
- **Echo through the server state.** It puts personal data in the dev action log (constraint 5,
  G-B3).
- **Controlled inputs.** They hold the password in React state as well, and the goal is the
  opposite.
- **A `key` remount per submission.** It clears everything, which is the defect being fixed.

**Risk it rests on:** that the reset applies the `defaultValue`s rendered with the new `draft`. The
walkthrough (tasks 8.2, steps 8 and 9) proves it on the real browser. If it does not hold, the
fallback is keying the form on a submission counter *and* rendering from `draft`, which remounts
with the draft as defaults.

### 5 · The error boundary says three things and logs nothing

New `src/app/(auth)/join/error.tsx` (a client component). It sits at the `join/` level, so it
covers `/join` and `/join/[code]` alike. It renders fixed `de.ts` copy: one plain sentence, the
assurance that nothing was lost, and an „Erneut versuchen" button calling `retry()`. **It does not
call `console.*`** and **never renders `error.message` or `error.digest`**. On this route an
unanticipated error's text is exactly where a code would leak into a log or a screen (G-A5, spec
*"SHALL NOT show or log the failure's own text"*). The no-console rule also covers Next's default
`browserToTerminal: 'warn'`, which would forward a client `console.error` into the dev terminal.

**The copy is generic**, e.g. *„Das hat gerade nicht geklappt."*, not a sentence about joining.
The boundary also catches a failed page load, a throw from `signOutAndReturnAction` (Decision 7)
and a throw from the manual-entry action. The assurance is true on every one of those paths:
- a join is one transaction (`identity/join`: *"A redemption is spent only by a join that
  completes"*), so a failed one leaves nothing behind;
- a page load and a manual entry write nothing;
- a failed sign-out has already cleared the cookie, and the session stays valid only for an account
  that is no longer presenting it.

**What the boundary cannot preserve:** a throw from the submit replaces the form, so typed values
are lost on that path. `signup_failed`, the one expected failure past validation, is a domain code
and stays inline under Decision 4. Only a truly unanticipated failure reaches the boundary. That
trade-off is accepted, not solved.

### 6 · Loading is shaped like the part both forms share

New `src/app/(auth)/join/[code]/loading.tsx`. It renders inside the shared `(auth)` shell
(Decision 8): a heading bar, a household-chip bar, and a card outline as tall as the **bound**
form, which is the shorter shape. The heading and chip are in the same place in both shapes, so
nothing already on screen moves. A neutral form grows the card downward by one field, and never
moves anything above it (spec: *"did not reserve rows the bound form does not have"*).

New `.skeleton` class in `globals.css`: a `--color-muted` fill, which `09-Design-System.md` names
as *"skeleton fills"*. It has a gentle pulse, which is switched off under
`prefers-reduced-motion`.

`/join` itself needs no `loading.tsx`: it is static, and its only wait is the submit, which the
button's pending text already covers.

### 7 · Keine Berechtigung signs out and comes back

The `other_household` state renders the existing explanation plus a form with a hidden `code` and
an „Abmelden" button. It posts to a new `signOutAndReturnAction(formData)` in
`src/app/(auth)/join/[code]/actions.ts`, which:

1. calls `getCurrentSession()`. If there is a session, it calls `revokeSession(current.context,
   current.sessionId)` inside `try`, with `clearSessionCookie()` in its `finally`. If there is no
   session (the cookie expired between render and click), it calls `clearSessionCookie()` alone.
   That is exactly `src/app/(org)/sign-out-action.ts`'s shape after #19.
2. `revokeSession` enforces ownership itself. Its `UPDATE` carries `session.account_id =
   context.accountId`, and it throws `PermissionDeniedError` for a session that is not the
   caller's. The action adds no check of its own and cannot widen that (G-C unchanged).
3. applies `normalizeJoinCode` + `isWellFormedJoinCode` to the body's code, then calls
   `redirect(buildJoinUrl(null, code))` if it is well-formed, or `redirect("/join")` if it is not.
   Both are **outside** the `try`.

If `revokeSession` throws, the cookie is already gone and the throw reaches the error boundary
(Decision 5), exactly as it would from `signOutAction`. The action's only argument is `formData`,
which the dev action log prints as `{}` (constraint 5).

The returning GET records one more attempt. That is correct, because it is one more lookup.

**Alternatives rejected:** reusing `signOutAction` redirects to `/sign-in`, and the invitation is
lost. Giving `signOutAction` a return-path parameter adds a redirect target any caller can supply
to a shared action, which is an open-redirect shape. The dedicated action can only ever return to a
join path.

### 8 · Visual treatment, and what A3's copy is

- `src/app/(auth)/layout.tsx` becomes the shared shell: a centred `max-w-md` column with the
  terracotta brand mark above the content. That gives sign-in, register and join one frame.
  Sign-in's and register's own forms are not restyled.
- The **household chip** is a new `.context-chip` component class: secondary paper tint, 16 px
  radius, the household name in medium weight. Its text is A3's quote, *„Du trittst … bei"*.
- **Neutral heading**: new copy, „Du bist eingeladen". **Bound heading**: „Hi {Name}!", with the
  chip beneath it. `boundHeading`'s single sentence splits into the two. All copy is new keys in
  `src/ui/strings/de.ts`. The prototype screenshots set the **tone** (as in change 0), and no
  prototype code or markup is copied.
- The **invalid-link state** is a `.callout-caution` holding FR-2.8's unchanged text, then a
  `.btn-secondary` link „Beitrittscode von Hand eingeben" → `/join`. **The damaged code is never
  prefilled.** It is the part that is wrong, and prefilling it would need a query string.
- The **rate-limited state** has no retry button. A retry would itself be an attempt.
- **Sign-in:** beneath the card, *WG gründen* → `/register` on both tabs, and on the Bewohner:in
  tab, *Beitrittscode eingeben* → `/join`. Both use `next/link` with `.btn-link`.

### 9 · A3's document records the states it departs on

§6 writes a state into a screen's entry only *„wo es vom Standard abweicht"*. Three of this
change's four do depart, so `docs/screens/A-zugang.md` A3's *Abweichende Zustände* table gains:

- **Leer — kein Code**: the entry field (FR-2.27).
- **Fehler — Link nicht gültig**: extended by the hand-entry way back.
- **Keine Berechtigung — bei einem anderen Haushalt angemeldet**: explanation plus Abmelden,
  returning to the same invitation.

Laden follows §6's default, and A3's table deliberately gets no Laden row. A struck-through
register row in `docs/review-log.md` §Offene-Punkte-Register records the 2026-09-23 human decision
(its own route, UUID gap out of scope), in the shape of the last change's row. German prose; no
pointer into `openspec/` (Rule 7).

### 10 · A refusal at submit carries the same way forward as the page

Two refusals the page renders as states can also arrive on **submit**, after the form is already
on screen:
- `invalid_link`: EC-2.9, a link deleted mid-registration, or its last use spent by someone else
  (EC-2.1);
- `other_household`: the visitor signed in to another household in a second tab.

`JoinFormState` gains `refusal: "invalid_link" | "other_household" | null`, set by the exhaustive
`switch` in `joinHouseholdAction`. `join-form.tsx` renders, beneath the inline message:
- for `invalid_link`, the same „Beitrittscode von Hand eingeben" link to `/join`;
- for `other_household`, the same sign-out form, posting the hidden `code` to
  `signOutAndReturnAction`.

The page's state rendering and the form's inline rendering share one small component per way
forward (`join-ways-forward.tsx`), so the two paths cannot drift. This is CLAUDE.md's *sibling
entry* hazard applied to screens: a rule stated on the page that is missing on the submit is not
enforced.

`already_member` already redirects on both paths. `rate_limited` needs no action on either.

### 11 · The dev request log does not see `/join/` paths

`next.config.ts` gains:

```ts
logging: { incomingRequests: { ignore: [/^\/join\//] } }
```

It applies in development only. The docs say *"this option doesn't affect production builds"*.
It closes the dev half of the access-log gap constraint 5 names. Human decision, 2026-09-23.

- The **server-function log** stays on. After Decisions 1, 4 and 7, no action on this route
  receives a code, name, email or password anywhere but inside a `FormData`, which prints as `{}`.
  Turning it off would hide the next regression instead of preventing it. The walkthrough reads
  the dev terminal to prove the claim (tasks 8.2).
- The **production access log** remains the deployment obligation change 2 recorded.

## Invariants, and every path that reaches them

`openspec/config.yaml`'s design rule: for each invariant this change adds or relies on, every path
to the guarded state and where the rule is enforced on it.

**I1 · The code is in no query string and no log (G-A5), and nothing typed is in a log (G-B3).**

| Path | Carrier | Enforced by |
|---|---|---|
| Link GET `/join/<CODE>` | path | allowed by G-A5; dev request log ignores `/join/` (Decision 11); production access log is a deployment obligation |
| `/join` POST (`enterJoinCodeAction`) | body | returns `{ error }` only, so the previous state holds no input (Decisions 1, 4); no `console.*` (task 7.3) |
| Join submit (`joinHouseholdAction`) | body (hidden field) | state holds no typed value (Decision 4); `signup_failed`'s `console.error(err)` logs a `JoinError` whose message never contains the code (existing test, extended in 7.4) |
| Sign-out POST (`signOutAndReturnAction`) | body | only argument is `FormData`; no `console.*` |
| Redirects (both actions) | path | built only by `buildJoinUrl` from a well-formed code (I2) |
| Error boundary | none | no `console.*`, no `message`/`digest` (Decision 5, task 7.5) |
| Raw SQL / `SECURITY DEFINER` | n/a | no new SQL, no new function |

**I2 · A redirect built from request data goes only to a join path the app constructed.**
Enforced in both actions by `isWellFormedJoinCode` before `buildJoinUrl`. The alphabet makes a
well-formed code one path segment (Decision 3). No other redirect on this route takes request data:
`already_member` and the join success are constants.

**I3 · Signing out ends only the visitor's own session.** Enforced in `revokeSession` alone: the
`account_id` predicate in its `UPDATE` and its `PermissionDeniedError`. This is the repository
function, never the route (CLAUDE.md: *"Authorization lives in the repository function"*).
- **Sibling entry:** `signOutAction` calls the same function.
- **Raw SQL as `app_runtime`:** RLS isolates the household only, and this change adds no raw SQL.
- **Concurrent second request:** the `UPDATE` is conditional on `revoked_at IS NULL`, so a double
  click revokes once and the second call takes the "already revoked, own session" no-op.

**I4 · An attempt is recorded before any code lookup (AC-2.25). This change relies on it.**
The code is looked up on exactly two paths, the page GET and the join submit. Both are unchanged
and both record first. Neither new action looks anything up: the manual entry normalises and
redirects, and sign-out touches only sessions.

**I5 · Every refusal offers its way forward.** Enforced on both paths that produce refusals, the
page (Decision 2) and the submit (Decision 10), through one shared component.

**Read-then-write.** None is added. `revokeSession`'s fallback `SELECT` runs after a conditional
`UPDATE` that already decided, and only picks which no-op or error to report. Nothing is written
on the strength of it.

**Widening a public route's inputs (config rule 4).** `/join` is a new public input, so change 2's
narrowness argument has to be repeated against it. The argument (change 2 design Decision 3,
C-2.12) was: *the oracle is the lookup, and every lookup pays an FR-2.28 attempt before it
happens*. `/join` performs no lookup. A malformed string ends there, and a well-formed one is sent
to `/join/<CODE>`, where it pays the attempt like any link. Guessing through `/join` therefore costs
exactly what guessing through links costs, and the argument holds unchanged.
`signOutAndReturnAction` takes a code from the body and uses it only to build a redirect (I2),
never to look anything up.

## Risks / Trade-offs

- **[A throw from the submit loses typed values]** → Decision 5. Only unanticipated failures take
  this path. Every expected one is inline.
- **[The skeleton grows downward for neutral links]** → accepted. Nothing that was already visible
  moves. Reserving the neutral height instead would make every bound link shrink, which is the
  jump §6 forbids.
- **[React's reset may not pick up the new `draft` defaults]** → Decision 4's fallback (keyed
  remount rendering from `draft`). Walkthrough steps 8 and 9 decide it on a real browser.
- **[A future action on this route returns typed data in its state]** → the dev action log would
  print it. Tasks 7.3 and 7.4 assert the returned state contains no typed value, and the
  walkthrough reads the dev terminal.
- **[The error boundary's generic copy is less specific than the failure]** → accepted. Being
  specific means reading the error, which is the thing Decision 5 forbids.
- **[Manual entry could be used to probe code shapes]** → the shape is public (FR-2.26 prints it on
  every link). The format check discloses nothing about any link, and every well-formed guess still
  pays an FR-2.28 attempt on arrival.
- **[No automated render test for the four states]** → Decision 2 makes the decision testable. A
  recorded walkthrough of all states × both shapes at phone width covers the rendering.

## Migration Plan

None. No schema, no data, no environment variable. Rollback is reverting the commit.
