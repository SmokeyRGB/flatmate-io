# Design

## Context

**Measured (2026-09-25, from the human's machine, EU → EU):**
- one plain query to `flatmate-io-dev` takes about 30 ms;
- one `withSessionContext` call with a single query takes about 190 ms, because it makes six
  sequential round trips (`BEGIN`, up to three `SET LOCAL`, the query, `COMMIT`);
- unauthenticated pages answer in 56–70 ms.

A signed-in page makes several such calls, which is where the reported 0.8–2 s comes from. This
change makes the wait visible (D1–D8) and cuts each call from six round trips to four (D9). Further
reductions, such as one transaction per page, are separate.

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
- the layouts block only on the session check the redirect needs;
- a check that holds F3/F4 to all of it.

**Non-Goals:**
- round-trip reductions beyond D9 (one transaction per page, `cache()` on `getCurrentSession`);
- success toasts for fire-and-forget actions;
- optimistic UI;
- a DOM test library.

## Decisions

### D1 — One `SubmitButton`, reading `useFormStatus` (revised after the pre-mortem)

`src/ui/submit-button.tsx` is a client component. Its props:
- `children`, the label text;
- an optional `icon`, the leading icon that today sits inside the label (`<UserMinus …/>`,
  `LogOut`, `Settings`);
- an optional `pendingLabel`;
- `className`, the existing `btn …` classes;
- the plain button props the forms use (`disabled`, `aria-*`).

It never takes `type`. It reads `useFormStatus()` from `react-dom`, so it works inside
**server-component** forms too, because the hook reads the nearest parent `<form>`. It also works
in forms whose `action` wraps `useActionState`'s dispatch (the join form). No submit button in the
tree carries `name`/`value`, so nothing is lost while pending.

**Pending state:**
- The button gets `aria-disabled="true"` and `aria-busy="true"`, plus a click guard: while
  pending, an `onClick` that calls `preventDefault()`. It does NOT get `disabled`, because disabling
  the focused button drops keyboard focus, and in `remove-member-form.tsx` that happens inside a
  modal `<dialog>` that stays open on error.
- The effective state is `pending || disabled`. A `disabled` prop, such as the type-to-confirm
  button, still sets real `disabled`, because that button isn't focused-and-submitting.
- **Announcement:** an always-rendered, visually hidden `<span role="status">` placed **next to**
  the button, not inside it. ARIA treats a button's children as presentational, so a live region
  inside it isn't reliably announced. A live region must also exist before its text changes. It
  holds `de.common.pending` only while pending, and is empty otherwise.

**No layout change, idle or pending:**
- Inside the button (which keeps `.btn`'s own inline-flex and centering, and its `w-full` where
  set), an inner `<span class="submit-stack">` is a one-cell grid holding two layers:
  - the idle layer: `icon` plus `children`;
  - the pending layer: the spinner plus (`pendingLabel ?? children`).
- Only `visibility` toggles, so the width is the larger layer's, in both states.
- There is no reserved spinner slot at idle: the spinner lives only in the pending layer.
- An icon-less `btn-link` button therefore looks exactly as it does today when idle.

**Forms that already use `useActionState`** keep their reducer. Their `pending ? … : …` label swap
moves into `pendingLabel`.

**Before hydration** a server-component form submits natively, without the pending look. The spec
scenario is qualified accordingly ("once the page is interactive").

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

### D4 — The layouts block less (revised after the pre-mortem: the claim is now honest)

Both layouts must still await `getCurrentSession()` before rendering. It reads `cookies()` and
makes one database round trip, and the redirect needs its answer. Per Next's docs, without Cache
Components (`next.config.ts` has none), runtime data in a layout blocks navigation until the layout
finishes. **So entering a route group still waits for that one call.** What D4 removes is the rest:
- **The session check and the redirects stay** in the layout.
- **The display reads** move into a separate async server component inside `<Suspense
  fallback={<HeaderSkeleton />}>`: identity, household and navigation access in `(resident)`, the
  identity label in `(org)`. That is roughly one more `withSessionContext` call off the blocking
  path.

The residual wait at group entry is covered by feedback where the click happened:
- after sign-in, the sign-in `SubmitButton` stays pending until the redirect lands;
- links that enter a group carry `LinkPendingHint` (D5).

Within a group, the layout is shared and not re-rendered, so a page's `loading.tsx` shows at once.
In a production build it's partially prefetched as well.

**Rejected:** making the layout synchronous, with the session check and redirect inside
`<Suspense><Gate>{children}</Gate></Suspense>`. That would unblock fully, but then the redirect
streams as an HTTP 200 plus a client redirect, and a household account would briefly see the
resident frame. That isn't worth it for about 190 ms.

Nothing about authorization moves. The header reads are display only (`getNavigationAccess`
decides visibility, never authorization), and every non-auth page runs its own `getCurrentSession`
plus redirect (all 13 checked in the pre-mortem). The `session-data.ts` memoisation still dedupes
the header's and B1's reads.

`BottomNav` needs no data and stays outside the boundary.

### D5 — Pending hint on links: `useLinkStatus` (revised: every link)

`src/ui/link-pending-hint.tsx` is a client component, rendered as a child of a `<Link>`. It calls
`useLinkStatus()` (from `next/link`, documented in this version) and shows a small inline spinner
in a fixed-size slot while `pending`, so nothing shifts. It works as a client child from server
components, in back-links and inside the `<details>` avatar menu.

**Every `<Link>` in `src/app/` gets one.** That includes the ones the first draft missed:
- the dashboard's primary, row, task and bridge links;
- every link on `organization/page.tsx`, including the ones into `(resident)`;
- the sign-in page's `/register` and `/join` links;
- `join-ways-forward.tsx`.

The links that enter a route group are exactly where D4's residual wait happens. A full-card link
places the hint at the end of its label line.

### D6 — The lint: `scripts/lint/pending-feedback.ts` (revised after the pre-mortem)

It follows the repo's other hand-written lints (plain TypeScript over file contents, no parser,
the stated honesty trade-off). Its checks are exported pure functions, with the file walk and exit
code kept separate.

**Scope:** all of `src/` (not only `src/app/`), except `src/ui/submit-button.tsx`, the one allowed
submit button.

**Before matching,** strip `//` line comments, `/* … */` and JSX `{/* … */}` comments: today
`(resident)/avatar-menu.tsx` has `` `<button>` `` in a comment.

1. **No plain submit button.**
   - Find every `<button` opening tag, reading up to its closing `>` across lines.
   - A tag is a finding if it has `type="submit"`, has **no** `type`, or has a **non-literal**
     `type={…}`.
   - `type="button"` and `type="reset"` pass.
2. **Every `page.tsx` under `src/app/` has a `loading.tsx` in the same directory** that imports
   from `@/ui/skeletons`. A `loading.tsx` returning `null` would satisfy a presence check while
   showing a blank screen, which the spec forbids.
   - An exemption map `{ path: reason }` lists the exceptions: initially only `src/app/page.tsx`
     (*"redirects only, renders nothing"*).
   - The sibling rule is stricter than Next requires (an ancestor `loading.tsx` also covers a
     page), and that is deliberate: the skeleton should be shaped like *this* page.

The lint prints each finding with a path and exits non-zero. It goes into `npm run verify`,
therefore CI, and into `CLAUDE.md`'s lint table.

**Unit test** `tests/unit/lint/pending-feedback.test.ts`, with in-memory fixtures:
- an explicit `type="submit"`;
- an untyped button;
- a multi-line tag with `type` on its second line;
- a non-literal `type`;
- `type="button"` (passes);
- a commented-out `<button>` (passes);
- a page with a skeleton `loading.tsx`;
- a page without a `loading.tsx`;
- a page whose `loading.tsx` imports no skeleton;
- the exempt page.

**Breaks, each run once:**
- only look for `type="submit"`: the untyped fixture must fail;
- read line by line: the multi-line fixture must fail;
- accept any ancestor `loading.tsx`: the missing-file fixture must fail;
- skip the comment stripping: the comment fixture must fail.

**Order:** the lint is written and run against the real tree **before** the forms and pages are
migrated. It must fail there, with a reported count, which proves it bites. It must pass after.

### D7 — Future changes

`openspec/config.yaml`'s tasks rules gain one line: *"A task that adds a screen names its
`loading.tsx` and skeleton shape; a task that adds a form uses `SubmitButton`. Enforced by
`scripts/lint/pending-feedback.ts`."* The lint enforces it; the rule makes planning expect it.

### D8 — Strings

`de.ts` gains `common.pending` („Wird gesendet …") and `common.loading` („Wird geladen …", the
skeleton's hidden label, `aria-busy` on the skeleton container). Existing `submitPending` labels
are reused as `pendingLabel`s.

### D9 — The session context in one statement (G-C8, human approval 2026-09-25; revised after the pre-mortem)

**Today** `withSessionContext` (`src/db/session-context.ts`) runs, inside `db.transaction`, up to
three `SET LOCAL` statements: `app.account_id`, `app.household_id`, and `app.profile_id` when it is
set. Each is a round trip, with `sql.raw` interpolation guarded by `assertUuid`.

**New:** `session-context.ts` exports `applySessionContext(tx, context)`, which `withSessionContext`
calls. It runs one statement with bound parameters and aliased columns:

```
SELECT set_config('app.account_id', ${accountId}, true) AS account_id,
       set_config('app.household_id', ${householdId}, true) AS household_id
       [, set_config('app.profile_id', ${profileId}, true) AS profile_id]  -- only when set
```

**Equivalence to `SET LOCAL`,** checked in the pre-mortem:
- `set_config(…, true)` is scoped to the transaction, and a rolled-back savepoint reverts it;
- outside a transaction it would last only for its own implicit transaction, but it always runs
  inside `db.transaction`;
- an error aborts the transaction exactly as before;
- binding plain strings to text parameters is fine with `prepare: false`;
- omitting the profile call keeps today's behaviour (`''` versus NULL is handled by `nullif`,
  `drizzle/0018`);
- the returned row is discarded.

`assertUuid` stays as defence in depth. Round trips go from 6 to 4 (5 to 4 without a profile),
measured before and after (tasks 7.1/7.3).

**The lint** `scripts/lint/session-context.ts`, fixing the whole class (the pre-mortem showed the
existing rules could already be bypassed):
- **`set_config`** is matched case-insensitively, with optional quotes and whitespace:
  `/\b"?set_config"?\s*\(/i`.
  - `set-config-outside-session-context`: any match in `src/` outside `session-context.ts`;
  - `set-config-not-local`: any match anywhere, including `session-context.ts`, that is not closed
    with a literal `true` as its third argument **on the same line**. A multi-line call fails
    closed.
- **`SET`, fixing the existing rules:** `SET SESSION …`, `SET … TO …` and `SET LOCAL … TO …`
  become findings exactly like `SET … =`.
- **`drizzle/*.sql`** is also scanned for `set_config` with a non-`true` third argument. A
  SECURITY DEFINER function could otherwise set a session-wide value.

`tests/unit/lint/session-context.test.ts` gains a fixture per new pattern, and one break is run
per rule:
- drop the `/i` flag: the upper-case fixture must fail;
- accept `false`: the `false` fixture must fail;
- stop scanning outside `session-context.ts`: the outside fixture must fail;
- keep the old `SET` regex: the `SET SESSION`/`TO` fixtures must fail.

**The pool-leak test (G-D10), done so that it can actually fail.**
`tests/integration/raw-sql/session-context-set-config.test.ts`:
1. Open a dedicated `postgres` client with `max: 1`, as `pool-reuse.test.ts` does, and a
   transaction on it that calls **`applySessionContext`** (the real mechanism) for household A.
   Record `pg_backend_pid()` inside that transaction, then commit.
2. Then, outside any transaction on the same client, read `current_setting('app.household_id',
   true)` and `pg_backend_pid()`. Supavisor's transaction mode may hand out a different server
   connection, so retry, up to 20 times, until the pid matches. No match means the test fails as
   **inconclusive**; it never passes by luck.
3. Assert that the value is empty or null.
4. In `afterEach`, `RESET app.household_id` on that pinned connection, so a failed or broken run
   never leaves the shared dev database dirty.
5. **Break:** `true → false` inside `applySessionContext`, run this file ALONE (never alongside CI
   or the guarded `pool-reuse.test.ts`), see it fail, restore, and confirm with a follow-up run
   that no stray setting remains.

`pool-reuse.test.ts` (`[GUARDED]`, G-D10) stays byte-identical. Adding the new file to G-D10's
`testFiles` in `test/guarded.manifest.json` is **human-gated**: the applier proposes it with the
break evidence, and the human confirms.

**The docs sweep.** Statements naming `SET LOCAL` as the mechanism get the equivalent form added
(German, verbatim quotes untouched, no citation into `openspec/`):
- `GUARDRAILS.md` G-C8: the *Regel*, its heading, and its row in the status table;
- `backlog/requirements/F0-requirements.md` AC-0.7, with a *(precision 2026-09-25)* note;
- `adr/0004-…md:66`: a precision note in the confirmed-tier ADR, which records the human
  decision and is not new wording chosen by the applier;
- `domain/invarianten.md` §5.5: the sample SQL shows the `set_config` form;
- `adr/0006-…md:141` and `domain/identity.md:133`: "(oder gleichwertig `set_config(…, true)`)".

The explanations of *why* the value must be transaction-local stay as they are: the G-C8
*Begründung*, the ADR-004 pooling pitfall, and R-0.3.

A `review-log.md` register entry records the human decision. The commit message names it.
Afterwards, `node tools/check-refs.ts`.

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
