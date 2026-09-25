# Proposal

## Why

A manual test after PR #23 (human, 2026-09-25) found that a click takes 0.8–2 s before anything
visibly happens: navigating to another screen, or submitting a form. The human's words: *„When an
action takes time because it needs verification, there should be visual feedback it is loading (e.g.
button becomes loading ring, …)"*.

Some of the time is expected: every signed-in page makes several database round trips to
`flatmate-io-dev`, measured at about 190 ms per `withSessionContext` call. That cost has its own,
separate follow-up. What is not acceptable is that nothing shows it is happening:
- about 18 submit buttons have no pending state at all: the members screen (9), rooms (4), the
  sign-out buttons, and link deletion;
- the 12 forms that do have one only swap their label text;
- 10 of 16 pages have no `loading.tsx`, so a navigation to them blocks with the old screen still
  shown.

The docs already require a loading state for every screen:
- `docs/screens/rahmenwerk.md` §6 names **Laden** as one of four mandatory states: *„Skeleton in
  der Form des erwarteten Inhalts. Nie Vollbild-Spinner, nie Layoutsprung"*.
- **G-N6** (*„Jeder Bildschirm führt die vier Pflichtzustände"*) holds it to every screen.
- `docs/09-Design-System.md` "Feedback states": *„Loading uses skeleton placeholders shaped like
  the real content"*.

The human wants this done **now** because F3 and F4 add many screens and forms. So the change
builds the pieces once, and adds a check that makes every later change use them.

## What Changes

- **One shared submit button** (`src/ui/submit-button.tsx`). While its form is submitting, it:
  - shows a small spinner inside the button;
  - is disabled, which also prevents a double submit;
  - sets `aria-busy`;
  - announces the pending state to screen readers;
  - keeps its width, so nothing jumps.

  Every submit button in `src/app/` uses it. A spinner inside a button is not the *„Vollbild-Spinner"*
  §6 forbids.
- **A `loading.tsx` for every page that lacks one**, built from shared skeleton shapes
  (`src/ui/skeletons.tsx`) in the form of the page's content.
- **The two route-group layouts stop blocking.** Today `(resident)/layout.tsx` and
  `(org)/layout.tsx` await the session plus several display reads before rendering anything.
  Next.js then can't show any `loading.tsx` while a navigation enters the group (its own docs:
  *"Navigation blocks until the layout finishes rendering"*). The session check needed for the
  redirect stays. The display reads (name, household, menu rights) move into a header rendered
  inside a `<Suspense>` boundary, with a header skeleton.
- **A pending hint on navigation links** (bottom bar, header links, profile menu, back-links), using
  Next.js's `useLinkStatus`. It covers the moment between the click and the new route's skeleton.
- **A new lint, `scripts/lint/pending-feedback.ts`,** in `npm run verify`. It fails when:
  - a `<button>` in `src/app/` is a submit button (explicitly or by default) instead of the shared
    one;
  - a `page.tsx` has no `loading.tsx` beside it, unless it is on the lint's short exemption list,
    each entry with its stated reason.
- **Docs for later changes:**
  - `CLAUDE.md` names the lint in its table;
  - `openspec/config.yaml` gains a tasks rule, so an F3/F4 plan names the loading state and the
    shared button for every new screen and form.

- **Fewer round trips per database call (human approval 2026-09-25).** `withSessionContext`
  currently sets the RLS context with up to three separate `SET LOCAL` statements, three round
  trips before the actual query.
  - They become **one** `SELECT set_config(…, true), …` with bound parameters. `set_config` with
    `is_local = true` is exactly `SET LOCAL`: it ends with the transaction.
  - A call then takes four round trips instead of six (BEGIN, context, query, COMMIT), about 190 →
    125 ms measured from the human's machine.
  - The G-C8 lint (`scripts/lint/session-context.ts`) learns `set_config`. Today it doesn't
    recognise it at all, so a session-wide `set_config(…, false)` anywhere in `src/` would pass
    unnoticed. It allows `set_config` only in `src/db/session-context.ts` and only with
    `is_local = true`.
  - `docs/GUARDRAILS.md` G-C8 says *„ausschließlich per `SET LOCAL`"*. Its wording is amended to
    name the equivalent `set_config(…, true)`, with a register entry for the human decision.

**Out of scope, on purpose:**
- further round-trip reductions: one transaction per page, and `cache()` around
  `getCurrentSession` (layout and page each resolve the session today). They are separate
  follow-ups;
- a success toast for the fire-and-forget actions (the page's own refresh is their feedback);
- optimistic UI.

## Capabilities

### New Capabilities
- `ui/pending-feedback`: what the resident and the organising person see while a screen loads, a
  form submits, or a navigation is pending, and the check that holds every screen and form to it.

### Modified Capabilities
None.

## Guardrails touched

- **G-N6:** the loading state gets built for every existing page, and its presence becomes
  mechanically checked, from 🟢 per-screen review to a lint for the Laden state.
- **G-C8:** the mechanism that sets the RLS session context changes from `SET LOCAL` statements
  to one transaction-local `set_config` call. The guarantee is unchanged: the context ends with the
  transaction, and it is set only inside `withSessionContext`. Its enforcement gets stricter, since
  the lint now also recognises `set_config`. The rule text in `docs/GUARDRAILS.md` is amended by
  human decision (2026-09-25).
- **G-D10** (no context leak through the connection pool, `implemented`) must stay green
  unchanged, and gets a sibling test through `withSessionContext` itself.
- G-C authorization, G-D otherwise and G-L are not touched: no authorization or query-shape
  changes.

## Assumptions

1. **The spinner lives in the button, never over the page.** §6 forbids a full-screen spinner and
   layout jumps. A button that keeps its width and shows a small icon does neither.
2. **No DOM test library is added.** Vitest runs in `node` here, and choosing a component-testing
   library is a tooling decision of its own. The components are checked in the browser walkthrough
   (light, dark, 375 px, reduced motion). The lint gets unit tests.
3. **Exemptions from the loading rule are few and named.** Only `src/app/page.tsx`, which only
   redirects. Every other page, including the `(auth)` pages, is dynamic (it reads cookies), so it
   gets a skeleton.
4. **Reduced motion:** under `prefers-reduced-motion` the spinner doesn't spin, but it stays
   visible, so the pending state is still shown.

## Impact

- **New:** `src/ui/submit-button.tsx`, `src/ui/link-pending-hint.tsx`, `src/ui/skeletons.tsx`,
  `scripts/lint/pending-feedback.ts` plus its unit test, and 10 `loading.tsx` files.
- **Changed:**
  - every form component with a submit button in `src/app/`;
  - the navigation components (`bottom-nav.tsx`, `avatar-menu.tsx`, the header links, back-links);
  - `src/app/globals.css`;
  - `src/ui/strings/de.ts`;
  - `package.json` (`verify`);
  - `CLAUDE.md` (lint table);
  - `openspec/config.yaml` (one tasks rule).
- **No** schema, migration, RLS or repository change.
