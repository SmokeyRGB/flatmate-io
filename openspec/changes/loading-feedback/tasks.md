# Tasks

Read `proposal.md`, `design.md` (D1–D9) and `specs/ui/pending-feedback/spec.md` first. Groups 1–6
are UI only. Group 7 changes one database helper (`src/db/session-context.ts`) and its G-C8 lint.
Group 8 changes guardrail and ADR wording by human decision. Nothing touches schema, repositories
or authorization; if a task seems to need that, stop and report.

Every user-facing string goes in `src/ui/strings/de.ts`. Next.js here differs from your training
data: read the `use-link-status` function page under `node_modules/next/dist/docs/`,
`…/03-file-conventions/loading.md` and `…/02-guides/forms.md` before using those APIs.

Every test task names its deliberate break. RUN each break, see the test fail, restore, and
report it.

## 1. Shared components (D1, D2, D3, D5, D8)

- [x] 1.1 `src/ui/submit-button.tsx` per D1:
      - props `children`, `icon?`, `pendingLabel?`, `className`, `disabled`, `aria-*`, and never
        `type`;
      - `useFormStatus`;
      - pending means `aria-disabled` + `aria-busy` + an `onClick` guard, not `disabled`;
      - a real `disabled` prop still disables;
      - an inner `.submit-stack` grid with the idle layer (icon + label) and the pending layer
        (spinner + `pendingLabel ?? label`), toggling only `visibility`;
      - an always-rendered, visually hidden `<span role="status">` beside the button (not inside
        it), holding `de.common.pending` only while pending.
- [x] 1.2 `src/ui/link-pending-hint.tsx` per D5: `useLinkStatus`, with a small spinner in a
      fixed-size slot.
- [x] 1.3 `src/ui/skeletons.tsx` per D3: `SkeletonHeading`, `SkeletonText`, `SkeletonCard`,
      `SkeletonList`, `SkeletonForm`, `HeaderSkeleton`. The container carries `aria-busy` and a
      visually hidden `de.common.loading`.
- [x] 1.4 `src/app/globals.css`:
      - `.spinner`, with rotation, and no animation under `prefers-reduced-motion: reduce` (still
        visible);
      - `.submit-stack` and its layers;
      - a visually-hidden utility, unless Tailwind's `sr-only` is already usable here (check).
- [x] 1.5 `src/ui/strings/de.ts`: `common.pending` („Wird gesendet …") and `common.loading`
      („Wird geladen …").

## 2. The lint first, so it can prove it bites (D6)

- [x] 2.1 `scripts/lint/pending-feedback.ts` per D6:
      - exported pure check functions, with the file walk and exit code kept separate;
      - scope is all of `src/` except `src/ui/submit-button.tsx`;
      - comments are stripped before matching;
      - buttons: a finding for `type="submit"`, a missing `type`, or a non-literal `type`, read
        across lines;
      - pages: each `page.tsx` needs a sibling `loading.tsx` that imports `@/ui/skeletons`;
      - exemption map: `src/app/page.tsx` → "redirects only, renders nothing".
- [x] 2.2 `tests/unit/lint/pending-feedback.test.ts` with D6's fixtures. Run D6's four breaks, one
      at a time:
      - only look for `type="submit"`;
      - read line by line;
      - accept any ancestor `loading.tsx`;
      - skip the comment stripping.

      Each must fail its fixture. Report all four.
- [x] 2.3 Run the lint on the real tree NOW, before groups 3 and 5. It must fail; report the
      number of findings and a sample. Then add it to `package.json` `verify`, after the other
      `scripts/lint` entries. `verify` stays red until groups 3 and 5 are done, which is expected.

## 3. Every submit button uses `SubmitButton` (D1)

- [x] 3.1 Replace every submit button (explicit `type="submit"`, or an untyped `<button>` inside a
      form) in:
      - `(auth)/join/join-code-form.tsx`, `(auth)/join/[code]/join-form.tsx`,
        `(auth)/join/[code]/join-ways-forward.tsx`, `(auth)/join/[code]/reset-form.tsx`;
      - `(auth)/register/register-form.tsx`, `(auth)/sign-in/sign-in-form.tsx`;
      - `(org)/layout.tsx`;
      - `(org)/members/delete-join-code-form.tsx`, `(org)/members/page.tsx`,
        `(org)/members/remove-member-form.tsx`;
      - `(org)/rooms/page.tsx`;
      - `(org)/rounds/new/round-form.tsx`, `(org)/rounds/[id]/page.tsx`;
      - `(org)/settings/settings-form.tsx`;
      - `(resident)/account/email-form.tsx`, `(resident)/account/password-form.tsx`,
        `(resident)/account/page.tsx`;
      - `(resident)/avatar-menu.tsx`.

      Pass leading icons through `icon`. Move the `useActionState` forms' `pending ? a : b` label
      into `pendingLabel`. Buttons that are not submit buttons (tabs, toggles, dialog openers) get
      an explicit `type="button"`.
- [x] 3.2 Keep every button's classes, icon and label. At idle nothing may look different: no
      reserved slot, the same width, the same alignment, including `w-full` buttons. Check the
      type-to-confirm button in `remove-member-form.tsx`: it stays really `disabled` until the
      name matches, and becomes pending on submit.

## 4. The layouts block less (D4)

- [x] 4.1 `src/app/(resident)/layout.tsx`: keep `getCurrentSession()` and both `redirect`s. Move
      the identity, household and navigation-access reads plus `AvatarMenu` into a new async
      server component, `src/app/(resident)/resident-header.tsx`, inside `<Suspense
      fallback={<HeaderSkeleton />}>`. `BottomNav` stays outside the boundary.
- [x] 4.2 `src/app/(org)/layout.tsx`: the same, with `src/app/(org)/org-header.tsx` for the
      identity label. The sign-out form stays outside the boundary, so it is usable at once.
- [x] 4.3 Confirm that no authorization moved: every page still calls its own guards. List the
      pages you checked.

## 5. A `loading.tsx` for every page (D3)

- [x] 5.1 A new `loading.tsx` from `src/ui/skeletons.tsx` in each of:
      - `(auth)/join`, `(auth)/register`, `(auth)/sign-in`;
      - `(org)/members`, `(org)/organization`, `(org)/rooms`, `(org)/rounds/new`,
        `(org)/rounds/[id]`, `(org)/settings`;
      - `(resident)/who-lives-here`.

      Read each page first, and use its own container classes and content shape.
- [x] 5.2 The lint from group 2 now passes on the real tree. Report it.

## 6. Pending hint on every link (D5)

- [x] 6.1 Add `<LinkPendingHint />` inside EVERY `<Link>` in `src/app/`. Among them:
      - `(resident)/bottom-nav.tsx` and `(resident)/avatar-menu.tsx`;
      - every `.back-link`;
      - the dashboard's primary, row, task and bridge links (`(resident)/dashboard/page.tsx`);
      - all of `(org)/organization/page.tsx`;
      - the sign-in page's `/register` and `/join` links;
      - `join-ways-forward.tsx`.

      Report the count, and grep afterwards that no `<Link` in `src/app/` lacks one, listing any
      you deliberately left out, with the reason.

## 7. The session context in one statement (D9, G-C8)

- [x] 7.1 Measure BEFORE any change. A scratch script, not committed (delete it afterwards), runs
      a plain `select 1` and `withSessionContext` with one `select 1`, 3 times each, against
      `flatmate-io-dev` with `.env.local`. Report the numbers.
- [x] 7.2 `src/db/session-context.ts` per D9:
      - export `applySessionContext(tx, context)`, which runs the one aliased `SELECT
        set_config(…, true)` statement (first with bound parameters; switched to values inlined behind `assertUuid`
        after measurement, see design D9 "Measured during the apply");
      - each `set_config(...)` on its own line;
      - the profile call omitted when it is null;
      - `assertUuid` kept;
      - `withSessionContext` calls it;
      - the doc comment updated.
- [x] 7.3 Measure AFTER with the same script. Report before and after.
- [x] 7.4 `scripts/lint/session-context.ts` per D9:
      - the `set_config` regex (case-insensitive, optional quotes and whitespace);
      - `set-config-outside-session-context`;
      - `set-config-not-local`, where anything other than a literal `true` third argument on the
        same line is a finding;
      - `SET SESSION`, `SET … TO` and `SET LOCAL … TO` in the old rules;
      - `drizzle/*.sql` scanned for non-local `set_config`.

      `tests/unit/lint/session-context.test.ts` gets a fixture per pattern, and the existing ones
      must still pass. Run D9's four breaks:
      - drop `/i`;
      - accept `false`;
      - stop scanning outside the helper;
      - keep the old `SET` regex.

      Report all four. The real tree must still pass.
- [x] 7.5 `tests/integration/raw-sql/session-context-set-config.test.ts` per D9:
      - a dedicated `max: 1` client;
      - `applySessionContext` in a transaction, recording `pg_backend_pid()`;
      - read outside a transaction, retrying (max 20) until the pid matches; no match fails as
        inconclusive;
      - assert empty or null;
      - `RESET app.household_id` in `afterEach`.

      Break: `true → false` in `applySessionContext`. Run THIS FILE ALONE, see it fail, restore,
      then run it again to confirm no stray setting remains. Do NOT edit `pool-reuse.test.ts`.
- [x] 7.6 **Human-gated, do not do it yourself:** *(Confirmed by the human 2026-09-25; Opus added the entry.)* in the report, PROPOSE adding the new file to
      G-D10's `testFiles` in `test/guarded.manifest.json`, citing the break evidence. The human
      confirms, and Opus makes the edit.

## 8. Docs and config (D7, D9)

- [x] 8.1 The docs sweep of D9, in German, with verbatim quotes untouched and no citation into
      `openspec/` (Rule 7):
      - `docs/GUARDRAILS.md` G-C8 *Regel*, its heading and its status-table row;
      - `docs/backlog/requirements/F0-requirements.md` AC-0.7, with a *(precision 2026-09-25)*
        note;
      - `docs/adr/0004-autorisierung-policy-und-rls.md` (line ~66), with a precision note
        recording the human decision;
      - `docs/domain/invarianten.md` §5.5, with the sample SQL in the `set_config` form;
      - `docs/adr/0006-stack-nextjs-postgres-drizzle.md` (line ~141) and
        `docs/domain/identity.md` (line ~133): „(oder gleichwertig `set_config(…, true)`)".

      Leave the *why* explanations (G-C8 *Begründung*, ADR-004's pooling pitfall, R-0.3) as they
      are.
- [x] 8.2 `docs/review-log.md` §Offene-Punkte-Register: one entry for the human decision of
      2026-09-25, following the register's format. Then `node tools/check-refs.ts`, which must
      report 0 findings.
- [x] 8.3 `CLAUDE.md`:
      - add `pending-feedback.ts` to the lint table under Commands;
      - update the `session-context.ts` row (it now also covers `set_config`, `SET SESSION`/`TO`
        and `drizzle/*.sql`);
      - correct the count ("six custom lints") to what the table holds.
- [x] 8.4 `openspec/config.yaml` `rules.tasks`: add D7's line as a quoted string. Then
      `openspec doctor`, and a YAML parse confirming `rules.tasks` is still a list of strings.

## 9. Verify

- [x] 9.1 Gate:
      - `npx eslint . --ignore-pattern ".claude/**"`;
      - `npx next typegen && npx tsc --noEmit`;
      - every `scripts/lint/*.ts` lint, including the new one;
      - `node tools/check-refs.ts`;
      - `npx vitest run tests/unit`.
- [x] 9.2 The FULL integration suite, once. Every repository call goes through the changed
      `withSessionContext`. Pause about 5 minutes first (the Supabase `/token` rate limit). Report
      failures by kind: a 429 that surfaces as invalid_credentials/signup_failed and passes on a
      re-run after a pause is not a regression.
- [x] 9.3 `npm run build` must succeed. Next may report Suspense/streaming problems only at build
      time.
- [ ] 9.4 Stop and report. The browser walkthrough is Opus's and the human's:
      - `next dev` and `npm run build && npm start`;
      - light, dark, 375 px, reduced motion;
      - a slow action on the members screen;
      - the removal dialog from the keyboard;
      - entering `(resident)` after sign-in, and `(org)` from Start.
