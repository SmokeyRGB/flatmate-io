# Tasks

Read `proposal.md`, `design.md` (D1–D9) and `specs/ui/pending-feedback/spec.md` first. Groups 1–6
are UI only. Group 7 changes one database helper (`src/db/session-context.ts`), its G-C8 lint and
the G-C8 guardrail text. Nothing else touches schema, repositories or authorization. If a task seems
to need that, stop and report. Every user-facing string goes in `src/ui/strings/de.ts`. Next.js here differs from
your training data: read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-link-status.md`,
`…/03-file-conventions/loading.md` and `…/02-guides/forms.md` before using those APIs.

## 1. Shared components (D1, D2, D3, D5, D8)

- [ ] 1.1 `src/ui/submit-button.tsx` per D1: `useFormStatus`, disabled while pending,
      `aria-busy`, `Loader2` in a reserved slot, idle and pending labels stacked in one grid cell
      (width = the larger), and a visually hidden `role="status"` text. It never accepts `type`.
- [ ] 1.2 `src/ui/link-pending-hint.tsx` per D5: `useLinkStatus`, a small spinner in a
      fixed-size slot.
- [ ] 1.3 `src/ui/skeletons.tsx` per D3: `SkeletonHeading`, `SkeletonText`, `SkeletonCard`,
      `SkeletonList`, `SkeletonForm`, plus `HeaderSkeleton` for D4. The container sets
      `aria-busy` and carries a visually hidden `de.common.loading`.
- [ ] 1.4 `src/app/globals.css`:
      - `.spinner` (rotation, `prefers-reduced-motion: reduce` → no animation, still visible);
      - the grid-stack classes for D1;
      - a `.sr-only` utility, if the project does not already have one (check Tailwind first).
- [ ] 1.5 `src/ui/strings/de.ts`: `common.pending`, `common.loading` (D8).

## 2. Every submit button uses `SubmitButton` (D1)

- [ ] 2.1 Replace every submit button (explicit `type="submit"`, or `<button>` without `type`
      inside a form) in:
      - `(auth)/join/join-code-form.tsx`, `(auth)/join/[code]/join-form.tsx`,
        `(auth)/join/[code]/join-ways-forward.tsx`, `(auth)/join/[code]/reset-form.tsx`;
      - `(auth)/register/register-form.tsx`, `(auth)/sign-in/sign-in-form.tsx` (the two tab
        buttons are `type="button"`: check them);
      - `(org)/layout.tsx`;
      - `(org)/members/delete-join-code-form.tsx`, `(org)/members/page.tsx` (9),
        `(org)/members/remove-member-form.tsx`;
      - `(org)/rooms/page.tsx` (4);
      - `(org)/rounds/new/round-form.tsx`, `(org)/rounds/[id]/page.tsx` (check it);
      - `(org)/settings/settings-form.tsx`;
      - `(resident)/account/email-form.tsx`, `(resident)/account/password-form.tsx`,
        `(resident)/account/page.tsx`;
      - `(resident)/avatar-menu.tsx`.

      Forms with `useActionState` move their `pending ? a : b` label into `pendingLabel`.
      Buttons that are NOT submit buttons get an explicit `type="button"`.
- [ ] 2.2 Keep every button's existing classes, icons and label. Only the pending look is added.

## 3. The layouts stop blocking (D4)

- [ ] 3.1 `src/app/(resident)/layout.tsx`: keep `getCurrentSession()` and both `redirect`s. Move
      the identity, household and navigation-access reads plus `AvatarMenu` into a new async
      server component, `src/app/(resident)/resident-header.tsx`, rendered inside `<Suspense
      fallback={<HeaderSkeleton />}>`. `BottomNav` stays outside the boundary.
- [ ] 3.2 `src/app/(org)/layout.tsx`: the same, with `src/app/(org)/org-header.tsx` for the
      identity label. The sign-out form stays usable (inside or outside the boundary: pick the
      one that keeps it visible at once, and say which).
- [ ] 3.3 Confirm that no authorization moved: every page still calls its own guards. List the
      pages you checked in the report.

## 4. A `loading.tsx` for every page (D3)

- [ ] 4.1 New `loading.tsx`, each composed from `src/ui/skeletons.tsx` in the page's own
      container classes and content shape:
      - `(auth)/join`, `(auth)/register`, `(auth)/sign-in`;
      - `(org)/members`, `(org)/organization`, `(org)/rooms`, `(org)/rounds/new`,
        `(org)/rounds/[id]`, `(org)/settings`;
      - `(resident)/who-lives-here`.

      Read each page first, so the skeleton matches what it renders.

## 5. Pending hint on navigation links (D5)

- [ ] 5.1 Add `<LinkPendingHint />` inside the `<Link>`s of `(resident)/bottom-nav.tsx`,
      `(resident)/avatar-menu.tsx`, and every `className="back-link"` link in `src/app/`.

## 6. The lint (D6, D7)

- [ ] 6.1 `scripts/lint/pending-feedback.ts` per D6. The two checks are exported pure functions
      (content in, findings out), and the file walk and exit code are kept separate. Exemption map:
      `src/app/page.tsx` → "redirects only, renders nothing".
- [ ] 6.2 `tests/unit/lint/pending-feedback.test.ts`, with fixtures for:
      - an explicit `type="submit"` (finding);
      - an untyped `<button>` (finding);
      - a multi-line tag with `type="submit"` on the second line (finding);
      - `type="button"` (pass);
      - a page directory with and without `loading.tsx`;
      - the exempt page.

      Deliberate break: make the untyped-button case pass (e.g. only look for `type="submit"`),
      and the test must fail. RUN it and report.
- [ ] 6.3 Add the lint to `package.json` `verify` (after the other `scripts/lint` entries) and run
      it on the real tree. It must pass after groups 2 and 4. Before group 2 it must fail on the
      real tree: run it once before migrating and report the findings count, which proves it
      bites.
- [ ] 6.4 `CLAUDE.md`: add the lint to the table under Commands ("The six custom lints …").
      Correct the count to what the table then holds, and mention `sql-statements.ts` is a shared
      helper, not a lint, if the text implies otherwise.
- [ ] 6.5 `openspec/config.yaml` `rules.tasks`: add D7's line as a quoted string. Run
      `openspec doctor`, and check with a YAML parse that `rules.tasks` is still a list of strings.

## 7. The session context in one statement (D9, G-C8)

- [ ] 7.1 Measure BEFORE any change: a scratch script (not committed, delete it afterwards) runs a
      plain `select 1` and `withSessionContext` with one `select 1`, 3 times each, against
      `flatmate-io-dev` with `.env.local`. Report the numbers.
- [ ] 7.2 `src/db/session-context.ts`: replace the three `SET LOCAL` statements with the one
      `SELECT set_config(…, true)` statement of D9. Use bound parameters (the drizzle `sql`
      template), not `sql.raw`. Put each `set_config(...)` on its own line. Omit the profile call
      when `profileId` is null, and keep `assertUuid`. Update the file's doc comment (it explains
      why `SET LOCAL` needed interpolation, which is no longer true).
- [ ] 7.3 Measure AFTER with the same script. Report before and after.
- [ ] 7.4 `scripts/lint/session-context.ts`: add `set-config-outside-session-context` and
      `set-config-not-local` (D9). `tests/unit/lint/session-context.test.ts`: fixtures for both
      rules, plus the existing ones still passing. Break: make `set-config-not-local` accept
      `false`, and a fixture must fail. RUN it and report.
- [ ] 7.5 `tests/integration/raw-sql/session-context-set-config.test.ts` per D9 (the same-connection
      technique of `pool-reuse.test.ts`). Break: `true` → `false` in `session-context.ts`, and the
      test must fail. RUN it, restore, and report. Do NOT edit `pool-reuse.test.ts` (guarded).
- [ ] 7.6 `docs/GUARDRAILS.md` G-C8 *Regel*: amend the wording per D9, in German, keeping the
      *Begründung* untouched. Add a `docs/review-log.md` §Offene-Punkte-Register entry for the
      human decision (2026-09-25), following the register's format. Update `CLAUDE.md`'s lint
      table row for `session-context.ts`. Run `node tools/check-refs.ts`, which must report 0
      findings.
- [ ] 7.7 Run the FULL integration suite once after 7.2. Every repository call goes through the
      changed function. Pause about 5 minutes before the run, because of the Supabase `/token`
      rate limit. Report failures by kind: a 429 that surfaces as invalid_credentials/signup_failed
      and passes on a re-run after a pause is not a regression.

## 8. Verify

- [ ] 8.1 Gate:
      - `npx eslint . --ignore-pattern ".claude/**"`;
      - `npx next typegen && npx tsc --noEmit`;
      - every `scripts/lint/*.ts` lint, including the new one;
      - `node tools/check-refs.ts`;
      - `npx vitest run tests/unit`.

      The integration suite is unaffected (no server logic changes). Run
      `tests/integration/policy/navigation-access.test.ts` and `start-overview.test.ts` once
      anyway, since the layouts changed.
- [ ] 8.2 `npm run build` must succeed. Next may report Suspense/streaming issues only at build
      time.
- [ ] 8.3 Stop and report. The browser walkthrough is Opus's and the human's: `next dev` and
      `npm run build && npm start`; light, dark, 375 px and reduced motion; a slow action on the
      members screen; entering `(resident)` after sign-in, and `(org)` from Start.
