# Design

## Context

**Measured (2026-09-25, from the human's machine, EU → EU):**
- one plain query to `flatmate-io-dev` takes about 30 ms;
- one `withSessionContext` call with a single query takes about 190 ms, because it makes six
  sequential round trips (`BEGIN`, up to three `SET LOCAL`, the query, `COMMIT`);
- unauthenticated pages answer in 56–70 ms.

A signed-in page makes several such calls, which is where the reported 0.8–2 s comes from. Reducing
those calls is a separate change. This one makes the wait visible.

**Observed in the code:**
- **Forms.** 12 form components use `useActionState` and swap their button label while pending.
  About 18 submit buttons, most of them in server components (`(org)/members/page.tsx` has 9,
  `(org)/rooms/page.tsx` 4, the sign-out forms), have no pending state at all.
- **Pages.** 10 of 16 `page.tsx` files have no `loading.tsx`:
  - `(auth)`: `join`, `register`, `sign-in`;
  - `(org)`: `members`, `organization`, `rooms`, `rounds/new`, `rounds/[id]`, `settings`;
  - `(resident)`: `who-lives-here`;
  - plus `src/app/page.tsx`, which only redirects.
- **Layouts block navigation.** `(resident)/layout.tsx` awaits `getCurrentSession()` plus three
  reads (identity, household, navigation access), and `(org)/layout.tsx` awaits the session plus
  `getIdentityLabel`, before either renders anything. Next.js's own docs
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`) say: *"If
  the layout accesses uncached or runtime data (e.g. `cookies()`, …), `loading.js` will not show a
  fallback for it … Navigation blocks until the layout finishes rendering."* So entering a route
  group (after sign-in, or from Start to the organisation surface) shows nothing for the whole
  layout time, whatever `loading.tsx` exists below it.
- **Development differs from production.** `next dev` does not prefetch, so a `loading.tsx` shell
  can't be ready in advance there. In a production build, dynamic routes with a `loading.tsx` are
  partially prefetched and navigate instantly (the same docs, "Linking and Navigating").
- **Testing.** Vitest runs with `environment: "node"`, and there is no DOM testing library.

## Goals / Non-Goals

**Goals:**
- visible feedback within one frame of every click that submits a form or navigates;
- a skeleton for every screen;
- the layouts no longer block the skeletons;
- a check that holds F3/F4 to all of it.

**Non-Goals:**
- fewer round trips per request (separate change, touches G-C8);
- success toasts for fire-and-forget actions;
- optimistic UI;
- a DOM test library.

## Decisions

### D1 — One `SubmitButton`, reading `useFormStatus`

`src/ui/submit-button.tsx` is a client component. It takes `children` (the label), an optional
`pendingLabel`, `className` (the existing `btn …` classes), and the plain button props the forms
use today (`disabled`, `aria-*`). It never takes `type`.

It reads `useFormStatus()` from `react-dom`, so it works inside **server-component** forms too:
the hook reads the nearest parent `<form>`. That is what lets the 18 buttons without state get one
without turning their pages into client components. The Next.js forms guide shows the same pattern.

While pending it:
- sets `disabled`, which blocks a double submission (spec);
- sets `aria-busy="true"`;
- renders `Loader2` from lucide-react with `aria-hidden`, plus a visually hidden live text
  (`de.common.pending`, „Wird gesendet …") inside a `role="status"` span, so screen readers hear
  the change.

**No layout jump:**
- The button stacks its idle label and its pending label (`pendingLabel ?? children`) in one CSS
  grid cell, and only toggles `visibility`. Its width is therefore the larger of the two, before
  and after.
- The spinner takes the place of the button's leading icon, or sits in a fixed-width slot before
  the label when the button has no icon. The slot is reserved in both states.

**Forms that already use `useActionState`** keep their reducer. Their `pending ? … : …` label swap
moves into `SubmitButton`'s `pendingLabel`, so there is one implementation of the pending look.
`useFormStatus` and `useActionState`'s `pending` describe the same submission.

### D2 — Motion

`.spinner` spins with a CSS animation. Under `@media (prefers-reduced-motion: reduce)`, the
animation is `none` and the icon stays. This is the same pattern as `.skeleton` and `.toast` in
`globals.css`.

### D3 — Skeletons from shared shapes

`src/ui/skeletons.tsx` exports a few server-safe shapes built from the existing `.skeleton` class
(`--color-muted`, `09-Design-System.md`):
- `SkeletonHeading`;
- `SkeletonText`;
- `SkeletonCard` (with N lines);
- `SkeletonList` (N rows);
- `SkeletonForm` (N fields and a button).

Each new `loading.tsx` composes the shape of its page: members is a heading plus a list plus a
card, rooms a heading plus a list, a form page a heading plus a form. It uses the page's own
container classes, so the switch from skeleton to content doesn't jump. The existing five
`loading.tsx` files stay as they are.

### D4 — The layouts stop blocking

In both `(resident)/layout.tsx` and `(org)/layout.tsx`:
- **The session check stays blocking,** because the redirect needs it: `getCurrentSession()` and
  the `redirect`.
- **The display reads move into a separate async server component** inside `<Suspense
  fallback={<HeaderSkeleton />}>`: `ResidentHeader` (identity, household and navigation access, for
  the avatar menu), and `OrgHeader` (the identity label).

The shell (`<header>` frame, `<main>` with the page's `loading.tsx`) streams without waiting for
them. Nothing about authorization moves: the header reads are display only (`getNavigationAccess`
decides visibility, never authorization, per `ui/resident-frame`), and every page still does its
own checks. The `session-data.ts` memoisation stays and still dedupes the header's and B1's reads
within a request.

The `BottomNav` needs no data and stays outside the boundary, so the navigation is usable while
the header loads.

### D5 — Pending hint on links: `useLinkStatus`

`src/ui/link-pending-hint.tsx` is a client component rendered as a child of a `<Link>`. It calls
`useLinkStatus()` (from `next/link`, documented in this version) and shows a small inline spinner
in a fixed-size slot while `pending`, so there's no layout shift. It goes on:
- the bottom-bar and header-link items (`bottom-nav.tsx`);
- the avatar-menu links (`avatar-menu.tsx`);
- the back-links (`.back-link`).

Next's docs recommend `useLinkStatus` exactly for dynamic routes when prefetching is off or
unfinished, which is always the case in `next dev`.

### D6 — The lint: `scripts/lint/pending-feedback.ts`

It follows the repo's other hand-written lints (plain TypeScript over file contents, no parser,
the stated honesty trade-off), and has two checks:
1. **No plain submit button in `src/app/`.**
   - Find every `<button` opening tag, reading up to its closing `>` across lines: several tags
     span lines, e.g. `sign-in-form.tsx`, `remove-member-form.tsx`.
   - A tag is a finding if it has `type="submit"`, or has no `type` attribute at all (a `<button>`
     without a type submits its form).
   - `type="button"` and `type="reset"` pass.
   - `src/ui/` is not scanned: `submit-button.tsx` is the one allowed submit button, and
     `password-input.tsx`/`success-toast.tsx` already use `type="button"`.
2. **Every `page.tsx` under `src/app/` has a `loading.tsx` in the same directory.** An exemption
   map `{ path: reason }` lists the exceptions; initially only `src/app/page.tsx` (*"redirects
   only, renders nothing"*).

The lint prints each finding with a path and exits non-zero. It is added to `npm run verify` and
therefore to CI, and to `CLAUDE.md`'s lint table. A unit test (`tests/unit/lint/pending-feedback.test.ts`)
runs its two check functions against in-memory fixtures:
- a typed button;
- an untyped button;
- a multi-line tag;
- a `type="button"`;
- a page with and without its loading file;
- an exempt page.

So the lint's logic must be exported as pure functions, with the file-walking kept separate.

### D7 — Future changes

`openspec/config.yaml`'s tasks rules gain one line: *"A task that adds a screen names its
`loading.tsx` and skeleton shape; a task that adds a form uses `SubmitButton`. Enforced by
`scripts/lint/pending-feedback.ts`."* The lint enforces it; the rule makes planning expect it.

### D8 — Strings

`de.ts` gains `common.pending` („Wird gesendet …") and `common.loading` („Wird geladen …", the
skeleton's hidden label, `aria-busy` on the skeleton container). Existing `submitPending` labels
are reused as `pendingLabel`s.

### D9 — The session context in one statement (G-C8, human approval 2026-09-25)

**Today** `withSessionContext` (`src/db/session-context.ts`) runs, inside `db.transaction`: `SET
LOCAL app.account_id = '…'`, `SET LOCAL app.household_id = '…'`, and, when `profileId` is set,
`SET LOCAL app.profile_id = '…'`. Each is a round trip. `SET LOCAL` accepts no bind parameters,
hence the `assertUuid` checks and the `sql.raw` interpolation.

**New:** one statement, with bound parameters:

```
SELECT set_config('app.account_id', ${accountId}, true),
       set_config('app.household_id', ${householdId}, true)
       [, set_config('app.profile_id', ${profileId}, true)]   -- only when profileId is set
```

Why this is the same thing:
- `set_config(name, value, is_local => true)` is documented by Postgres as equivalent to `SET
  LOCAL`: the value ends with the current transaction.
- It runs inside the same `db.transaction`.
- Omitting the third call when `profileId` is null keeps today's behaviour exactly. The profile
  setting stays unset in that transaction, which the policies already handle with
  `nullif(current_setting('app.profile_id', true), '')` (`drizzle/0018`).

Bound parameters replace the string interpolation, which is an improvement. `assertUuid` stays as
defence in depth.

Round trips per call go from 6 to 4, or from 5 to 4 when the profile is null. Measure before and
after with the same probe as in the Context section: a plain query, then `withSessionContext` with
one query, 3 runs each. Report both.

**The lint** `scripts/lint/session-context.ts` gains two rules, next to the existing
`bare-set` and `set-local-outside-session-context`:
- `set-config-outside-session-context`: any `set_config(` in `src/` outside
  `src/db/session-context.ts`;
- `set-config-not-local`: a `set_config(` call whose third argument is not literally `true`,
  anywhere in `src/`, including `session-context.ts`.

Like the existing rules it is line-based. The statement in `session-context.ts` is therefore
written with each `set_config(...)` on one line, so the check sees its third argument. Its unit
test `tests/unit/lint/session-context.test.ts` gains fixtures for both rules.

**The guardrail text.** `docs/GUARDRAILS.md` G-C8's *Regel* reads *„ausschließlich per `SET
LOCAL` innerhalb einer offenen Transaktion"*. It is amended to name `set_config(…, true)` as the
equivalent transaction-local form, and to state that the session-wide form (`is_local = false`) is
forbidden exactly like `SET` without `LOCAL`. The *Begründung* is untouched. A register entry in
`docs/review-log.md` §Offene-Punkte-Register records the human decision of 2026-09-25. German,
quotes verbatim, and `node tools/check-refs.ts` afterwards. `CLAUDE.md`'s lint table row for
`session-context.ts` is updated to match.

**Tests:**
- `tests/integration/raw-sql/pool-reuse.test.ts` (G-D10, `[GUARDED]`, `implemented`) stays exactly
  as it is and must stay green.
- A new sibling, `tests/integration/raw-sql/session-context-set-config.test.ts`, proves the new
  mechanism doesn't leak. Using the same same-connection technique as `pool-reuse.test.ts`, it
  runs `withSessionContext` for household A, then on the same connection outside any transaction
  reads `current_setting('app.household_id', true)`. That must be empty or null, not A.
- Break: change `true` to `false` in `session-context.ts`, and the test must fail (the setting
  then sticks to the connection). Run it, then restore.
- The whole integration suite runs through `withSessionContext`, so it is the regression check.
  It runs once in full after this.

## Risks / Trade-offs

- **Dev and production behave differently** (prefetch). The walkthrough checks both `next dev`
  and `npm run build && npm start`.
- **The header skeleton appears briefly** on entering a route group. That is the intended trade:
  the frame shows at once instead of the whole screen waiting.
- **The lint's regex approach can miss exotic JSX,** e.g. a spread `{...props}` carrying `type`.
  The repo has none today. The same trade-off is stated in the other lints.
- **`useFormStatus` only sees its own parent form.** A `SubmitButton` outside a `<form>` would
  never show pending. Rendering it outside a form is a misuse; D6's check 1 doesn't catch it, but
  the walkthrough does.

## Migration Plan

None (UI only). Roll back by reverting.

## Open Questions

None.
