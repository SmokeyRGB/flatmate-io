# Tasks

Every task names its files. Requirements are in `specs/ui/vocabulary/spec.md`; the "how" and its
rationale are in `design.md` — consult the numbered Decisions rather than re-deciding. Work the
groups in order: group 2 onward all depend on the table existing.

**Two rules that apply to every task below.** A German literal never goes into a component, an
action or a test — only into `src/ui/strings/de.ts`. And `screens/rahmenwerk.md` §8.6 wins over
your own wording wherever it has an entry.

## 1. The table

- [ ] 1.1 Create `src/ui/strings/de.ts` (the `as const` table) and `src/ui/strings/index.ts`
      (re-export plus shared types), per `design.md` Decisions 1 and 9. English keys, German values
      (Decision 3). Verify `npx tsc --noEmit` passes and that a deliberately misspelled property
      read fails it.
- [ ] 1.2 Seed the table with the cross-screen strings: navigation, the back link, the shared button
      labels, and the four screen-state texts that already exist. Verify by reading it — this file
      is reviewed as copy, not as a diff.
- [ ] 1.3 Enter every `screens/rahmenwerk.md` §8.6 term **verbatim**, with a comment citing §8.6 so
      a later editor sees it is fixed, not chosen: `moved_out` → „Ausgezogen", U-27's hard removal
      → „Entfernen", `join_code` → „Einladungslink"/„Beitrittscode", invalidating a link →
      **„Löschen"**. Verify no synonym of „Löschen" appears anywhere in the table.

## 2. Error codes — `src/modules/identity/`

- [ ] 2.1 Give `RegistrationError`, `ClaimError` and `SignInError` in
      `src/modules/identity/auth.ts` a `code` discriminant typed as a string-literal union, per
      `design.md` Decision 4, and update all twelve throw sites (`auth.ts:36,37,51,185,187,198,
      320,326,349,358,366,372`). Leave every `message` exactly as it is — it is developer-facing and
      goes to the log. Verify `npx tsc --noEmit`.
- [ ] 2.2 Converge `SignInError("No such resident in this household")` (`auth.ts:349`) and
      `SignInError("Invalid credentials")` (`auth.ts:358`) on the single code `invalid_credentials`,
      per `design.md` Decision 5. **This is the change's one user-visible behaviour change**
      (`proposal.md` Assumption 6) — if the reviewer reversed it, skip this task and give them two
      codes instead. Verify by test 5.2.
- [ ] 2.3 Do the same for `DisplayNameConfirmationMismatchError` and `PermissionDeniedError`
      (`src/modules/identity/repository.ts:404,178`) **only if** either is thrown with more than one
      distinct message; otherwise leave them and map by class. Verify by grepping their throw sites
      first and recording which way you went.
- [ ] 2.4 Leave `PayloadValidationError`, `RoomInUseByOpenRoundError`, `ProcedureLockedError`,
      `CannotChangeAdminRoleError`, `HouseholdAccountCannotVoteError` and the four transition error
      classes untouched — no screen displays them (`design.md` Decision 4, rejected alternative).
      Verify by grepping the seven `actions.ts` files for each name.

## 3. Screens and actions — `(auth)`

- [ ] 3.1 `src/app/(auth)/layout.tsx`, `sign-in/page.tsx`, `sign-in/sign-in-form.tsx`: every string
      to the table. Verify the rendered page shows no English.
- [ ] 3.2 `src/app/(auth)/sign-in/actions.ts`: replace `return { error: err.message }` (`:37`) with
      an exhaustive switch on `err.code` mapping to keys. Verify a missed case fails `tsc`.
- [ ] 3.3 `src/app/(auth)/register/page.tsx`, `register-form.tsx`, and `register/actions.ts` —
      including `:28,29` (the two field-required strings) and `:46,52`. The `sessionErr.message`
      pass-through at `:46` becomes the generic key of `design.md` Decision 6, and the original is
      logged. Verify the log still carries the Supabase text.
- [ ] 3.4 `src/app/(auth)/claim/page.tsx`, `claim-form.tsx`, and `claim/actions.ts` — `:33,41,47`
      are plain strings; `:64,70` are the pass-throughs. `` `ResidentProfile not found: ${id}` ``
      must not reach the screen in any form (`spec.md`, "No model term reaches a resident
      untranslated"). Verify by triggering that path and reading what the form shows.

## 4. Screens and actions — `(org)`

- [ ] 4.1 `src/app/(org)/layout.tsx` and `dashboard/page.tsx`. Verify no English renders.
- [ ] 4.2 `src/app/(org)/members/page.tsx`, `remove-member-form.tsx`, `actions.ts` (`:53,62`). This
      screen carries the §8.6 terms — „Ausgezogen" for the reversible removal and „Entfernen" for
      U-27's permanent one — and they must stay distinguishable, which is the whole point of U-27.
      Verify both labels appear and differ.
- [ ] 4.3 `src/app/(org)/rooms/page.tsx` and `rooms/actions.ts`. Verify no English renders.
- [ ] 4.4 `src/app/(org)/rounds/new/page.tsx`, `round-form.tsx`, `rounds/new/actions.ts`, and
      `rounds/[id]/page.tsx`. Verify no English renders.
- [ ] 4.5 `src/app/(org)/settings/page.tsx`, `settings-form.tsx`, `settings/actions.ts`. Verify no
      English renders.
- [ ] 4.6 `src/app/(org)/who-lives-here/page.tsx` — screen B5, U-30's reduced resident view. Verify
      no English renders.
- [ ] 4.7 `src/app/page.tsx`. Verify no English renders.

## 5. Document language and tests

- [ ] 5.1 `src/app/layout.tsx`: `lang="en"` → `lang="de"` (`:24`), and translate
      `metadata.description` (`:18`). `metadata.title` stays "Flatmate.io" (`proposal.md`
      Assumption 5). Verify the served HTML carries `lang="de"`.
- [ ] 5.2 `tests/unit/casting/new-round-page-permission-guard.test.ts:44`: assert through
      `src/ui/strings`, never a German literal (`design.md` Decision 8). Verify the test fails if
      the table's value changes and passes if only the key is renamed with it.
- [ ] 5.3 Add a test asserting that sign-in returns the same error for an unknown display name and
      for a wrong password (`design.md` Decision 5). This is the enumeration fix; without a test it
      regresses the first time someone "improves" the message. Skip only if 2.2 was skipped.

## 6. The sweep and the gate

- [ ] 6.1 Grep every `.tsx` and `actions.ts` under `src/app/` for surviving user-facing literals —
      JSX text nodes, `placeholder=`, `aria-label=`, `title=`, `alt=`, and `error:` values. This is
      the check that the migration was complete rather than mostly complete. Verify the only
      remaining literals are `className` values and other non-user-facing attributes.
- [ ] 6.2 Read the whole of `src/ui/strings/de.ts` once as prose: `du` throughout, „Bewohner:innen"
      colon form, no model term left untranslated, nothing that presents a limit as security
      (C-2.5). Verify by reading, not by grep — this is the copy review the change exists to make
      possible.
- [ ] 6.3 Confirm `test/guarded.manifest.json` is byte-identical to `main` — no G-D invariant is
      involved (`proposal.md` — Impact). Verify with
      `git diff --stat main -- test/guarded.manifest.json` showing no change.
- [ ] 6.4 Run `npm run verify` — eslint, the four lints in `scripts/lint/`, `tools/check-refs.ts`
      and the full vitest suite against `flatmate-io-dev`. Green is the gate.
