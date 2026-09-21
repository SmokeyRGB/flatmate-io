# Tasks

Every task names its files. Requirements are in `specs/ui/vocabulary/spec.md`; the "how" and its
rationale are in `design.md` — consult the numbered Decisions rather than re-deciding. Work the
groups in order: group 2 onward all depend on the table existing.

**Two rules that apply to every task below.** A German literal never goes into a component, an
action or a test — only into `src/ui/strings/de.ts`. And `screens/rahmenwerk.md` §8.6 wins over
your own wording wherever it has an entry.

## 1. The table

- [x] 1.1 Create `src/ui/strings/de.ts` (the `as const` table) and `src/ui/strings/index.ts`
      (re-export plus shared types), per `design.md` Decisions 1 and 9. English keys, German values
      (Decision 3). Verify `npx tsc --noEmit` passes and that a deliberately misspelled property
      read fails it.
- [x] 1.2 Seed the table with the cross-screen strings: navigation, the back link, the shared button
      labels, and the four screen-state texts that already exist. Verify by reading it — this file
      is reviewed as copy, not as a diff.
- [x] 1.3 Enter every `screens/rahmenwerk.md` §8.6 term **verbatim**, with a comment citing §8.6 so
      a later editor sees it is fixed, not chosen: `moved_out` → „Ausgezogen", U-27's hard removal
      → „Entfernen", `join_code` → „Einladungslink"/„Beitrittscode", invalidating a link →
      **„Löschen"**. Verify no synonym of „Löschen" appears anywhere in the table.

## 2. Error codes — `src/modules/identity/`

- [x] 2.1 Give `RegistrationError`, `ClaimError` and `SignInError` in
      `src/modules/identity/auth.ts` a `code` discriminant typed as a string-literal union, per
      `design.md` Decision 4, and update all twelve throw sites (`auth.ts:36,37,51,185,187,198,
      320,326,349,358,366,372`). Leave every `message` exactly as it is — it is developer-facing and
      goes to the log. Verify `npx tsc --noEmit`.
- [x] 2.2 Converge `SignInError("No such resident in this household")` (`auth.ts:349`) and
      `SignInError("Invalid credentials")` (`auth.ts:358`) on the single code `invalid_credentials`,
      per `design.md` Decision 5. **This is the change's one user-visible behaviour change**
      (`proposal.md` Assumption 6) — if the reviewer reversed it, skip this task and give them two
      codes instead. Verify by test 5.2.
- [x] 2.3 Do the same for `DisplayNameConfirmationMismatchError` and `PermissionDeniedError`
      (`src/modules/identity/repository.ts:404,178`) **only if** either is thrown with more than one
      distinct message; otherwise leave them and map by class. Verify by grepping their throw sites
      first and recording which way you went.
      **Recorded:** `DisplayNameConfirmationMismatchError` has exactly one throw site (`:447`, no
      interpolation) — left untouched, mapped by class. `PermissionDeniedError` has five throw
      sites with textually distinct messages, but every one that actually reaches a resident
      (`rounds/new/actions.ts`, `members/page.tsx`) resolves to the same "not allowed" outcome
      today — none is differentiated by the UI. Left uncoded and mapped by class to one generic
      key (`de.rounds.errors.permissionDenied`); the one spot that leaked the raw
      `Missing permission: …` text (`rounds/new/actions.ts:39`) now uses that key instead. Flagged
      in the implementation report as a judgment call.
- [x] 2.4 Leave `PayloadValidationError`, `RoomInUseByOpenRoundError`, `ProcedureLockedError`,
      `CannotChangeAdminRoleError`, `HouseholdAccountCannotVoteError` and the three transition error
      classes untouched *(corrected during apply: there are three, not four —
      InvalidResidentProfileTransitionError, InvalidRoomTransitionError, InvalidTransitionError)* — no screen displays them (`design.md` Decision 4, rejected alternative).
      Verify by grepping the seven `actions.ts` files for each name.
      **Finding:** `ProcedureLockedError` (`casting/repository.ts:490`) contradicts this premise —
      `settings/actions.ts:25` catches it via a generic `err instanceof Error` and returns
      `err.message` raw, which does reach the resident (with a raw round id and field names).
      Not given a code (kept in scope per this task); the actions.ts catch was changed to a
      generic translated key instead. Flagged in the implementation report — not resolved as a
      spec contradiction, only worked around locally.

## 3. Screens and actions — `(auth)`

- [x] 3.1 `src/app/(auth)/layout.tsx`, `sign-in/page.tsx`, `sign-in/sign-in-form.tsx`: every string
      to the table. Verify the rendered page shows no English.
- [x] 3.2 `src/app/(auth)/sign-in/actions.ts`: replace `return { error: err.message }` (`:37`) with
      an exhaustive switch on `err.code` mapping to keys. Verify a missed case fails `tsc`.
- [x] 3.3 `src/app/(auth)/register/page.tsx`, `register-form.tsx`, and `register/actions.ts` —
      including `:28,29` (the two field-required strings) and `:46,52`. The `sessionErr.message`
      pass-through at `:46` becomes the generic key of `design.md` Decision 6, and the original is
      logged. Verify the log still carries the Supabase text.
- [x] 3.4 `src/app/(auth)/claim/page.tsx`, `claim-form.tsx`, and `claim/actions.ts` — `:33,41,47`
      are plain strings; `:64,70` are the pass-throughs. `` `ResidentProfile not found: ${id}` ``
      must not reach the screen in any form (`spec.md`, "No model term reaches a resident
      untranslated"). Verify by triggering that path and reading what the form shows.

## 4. Screens and actions — `(org)`

- [x] 4.1 `src/app/(org)/layout.tsx` and `dashboard/page.tsx`. Verify no English renders.
      Also refactored `identity/repository.ts`'s `getIdentityLabel` to return structured data
      instead of a composed English string (it previously built `"{name} (administration)"` /
      `"Household administration"` / `"Resident"` inline) — not named in tasks.md, but the literal
      lived in the repository layer and rendered in this layout; see the implementation report.
- [x] 4.2 `src/app/(org)/members/page.tsx`, `remove-member-form.tsx`, `actions.ts` (`:53,62`). This
      screen carries the §8.6 terms — „Ausgezogen" for the reversible removal and „Entfernen" for
      U-27's permanent one — and they must stay distinguishable, which is the whole point of U-27.
      Verify both labels appear and differ.
- [x] 4.3 `src/app/(org)/rooms/page.tsx` and `rooms/actions.ts`. Verify no English renders.
      `rooms/actions.ts` had no user-facing literals to begin with. Also translated the room-status
      badge/`<select>` options (`r.status`, an enum value rendered directly) via a new
      `de.status.room` map — not a literal in the source, but English text a resident reads
      nonetheless (spec.md "No English remains in front of the resident"); not named in tasks.md,
      flagged in the implementation report.
- [x] 4.4 `src/app/(org)/rounds/new/page.tsx`, `round-form.tsx`, `rounds/new/actions.ts`, and
      `rounds/[id]/page.tsx`. Verify no English renders.
      Also gave `casting/repository.ts`'s `RoundOpenPreconditionError` a code discriminant (see
      task 2.4's note) and translated the round-status badge via `de.status.round` (same reasoning
      as 4.3's room-status map). Dropped the literal `(FR-1.22)`/`(FR-1.21)` requirement-id
      parentheticals from the two screens that rendered them verbatim to a resident
      (`rounds/[id]/page.tsx`, `settings/settings-form.tsx`) — spec jargon in front of a resident,
      per §12; flagged in the implementation report as a copy improvement made while translating,
      not requested by any task.
- [x] 4.5 `src/app/(org)/settings/page.tsx`, `settings-form.tsx`, `settings/actions.ts`. Verify no
      English renders. Also fixed `settings/actions.ts`'s generic `err.message` pass-through (see
      task 2.4's finding on `ProcedureLockedError`) — mapped to a generic key, original logged.
- [x] 4.6 `src/app/(org)/who-lives-here/page.tsx` — screen B5, U-30's reduced resident view. Verify
      no English renders.
- [x] 4.7 `src/app/page.tsx`. Verify no English renders. This route has no rendered text (an
      unconditional redirect) — nothing to translate.

## 5. Document language and tests

- [x] 5.1 `src/app/layout.tsx`: `lang="en"` → `lang="de"` (`:24`), and translate
      `metadata.description` (`:18`). `metadata.title` stays "Flatmate.io" (`proposal.md`
      Assumption 5). Verify the served HTML carries `lang="de"`.
- [x] 5.2 `tests/unit/casting/new-round-page-permission-guard.test.ts:44`: assert through
      `src/ui/strings`, never a German literal (`design.md` Decision 8). Verify the test fails if
      the table's value changes and passes if only the key is renamed with it.
- [x] 5.3 Add a test asserting that sign-in returns the same error for an unknown display name and
      for a wrong password (`design.md` Decision 5). This is the enumeration fix; without a test it
      regresses the first time someone "improves" the message. Skip only if 2.2 was skipped.
      New file: `tests/unit/identity/sign-in-enumeration.test.ts`.

## 6. The sweep and the gate

- [x] 6.1 Grep every `.tsx` and `actions.ts` under `src/app/` for surviving user-facing literals —
      JSX text nodes, `placeholder=`, `aria-label=`, `title=`, `alt=`, and `error:` values. This is
      the check that the migration was complete rather than mostly complete. Verify the only
      remaining literals are `className` values and other non-user-facing attributes.
      Also swept for two things grep alone wouldn't catch: enum values rendered directly (room and
      round status, `{r.status}`/`{round.status}` — not literals in the source, but English text a
      resident reads) and leftover `&quot;`/`&#x27;` HTML-entity remnants from the old English
      copy — none found.
- [x] 6.2 Read the whole of `src/ui/strings/de.ts` once as prose: `du` throughout, „Bewohner:innen"
      colon form, no model term left untranslated, nothing that presents a limit as security
      (C-2.5). Verify by reading, not by grep — this is the copy review the change exists to make
      possible.
- [x] 6.3 Confirm `test/guarded.manifest.json` is byte-identical to `main` — no G-D invariant is
      involved (`proposal.md` — Impact). Verify with
      `git diff --stat main -- test/guarded.manifest.json` showing no change.
- [x] 6.4 Run `npm run verify` — eslint, the four lints in `scripts/lint/`, `tools/check-refs.ts`
      and the full vitest suite against `flatmate-io-dev`. Green is the gate.
