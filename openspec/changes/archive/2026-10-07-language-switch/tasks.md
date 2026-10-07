## 0. Preconditions (do not start before these hold)

- [x] 0.1 Check that F5 `candidate-detail` is merged into `main` (human decision 2026-10-07: this change lands after it). If it is not merged yet, stop and report. Otherwise rebase `feat/language-switch` onto `origin/main`.
- [x] 0.2 Refresh `src/ui/strings/en.ts` from the main checkout (`C:/Users/Sammy/Documents/DigitaleLeute School/flatmate-io/src/ui/strings/en.ts`, the human's translation, untracked there) into this worktree. Never delete or edit the main checkout's copy. Then list the key-path diff against the rebased `de.ts` in both directions and report it before translating anything.
- [x] 0.3 Take the next free migration number after the highest file in `drizzle/` (expected `0036`) and record it in this file. **Done 2026-10-07 by the planner: rebased onto `167e68e`, `en.ts` refreshed, number is `0036`.** The applier still runs the 0.2 diff and reports it.

## 1. Tables and type contract (D1)

- [x] 1.1 Add `src/ui/strings/locales.ts` with no imports: `LOCALES = ["de","en"] as const`, `type Locale`, `isLocale(value): value is Locale`, and the date-locale map `{ de: "de-DE", en: "en-GB" }` (D9).
- [x] 1.2 Add the `Strings` mapped type in `src/ui/strings/index.ts`: string literals widen to `string`, functions keep their parameters and return `string`, objects recurse. Export `tables: Record<Locale, Strings>`, and keep the `de` export.
- [x] 1.3 End `src/ui/strings/en.ts` with `as const satisfies Strings` and start tracking it in git. Leave `de.ts`'s bare `as const`: a `satisfies` against a type derived from its own `typeof` is circular (D1). Grep for uses of the `De` type and literal-typed reads of `de` that would break under the widened `Strings`, and report them.
- [x] 1.4 Run `npx tsc --noEmit`. Close every gap it reports in `en.ts` with an English translation. Add a `language` group to both tables with identical endonyms („Deutsch", "English") and a toggle label per language. Review `en.ts` as copy against `docs/screens/rahmenwerk.md` §8.6: one English word per §8.6 entry, kept distinct where German keeps them distinct (Ausgezogen ≠ Entfernen, Löschen never "revoke"). Keep the du-like, apologising error tone ("Sorry, …"). Report the terms you chose for the §8.6 entries.
- [x] 1.5 Add `tests/unit/ui/strings-parity.test.ts`: walk `de` and `en`, and assert identical key paths and identical `function.length` for function entries. Deliberate break: delete one nested key from `en` (with a `// @ts-expect-error`) and see the test fail.

## 2. Request-scoped resolver (D2, D3)

- [x] 2.1 Add `preferredLocale(header: string | null): Locale` in `src/ui/strings/accept-language.ts` (pure). Test it in `tests/unit/ui/accept-language.test.ts`: q-ordering (`de;q=0.5, en;q=0.9` → en), subtags (`en-GB` → en), absent header → de, neither present (`fr`) → de, malformed input → de. Deliberate break: ignore q-values and see the ordering case fail.
- [x] 2.2 Extend `resolveSessionContext` in `src/modules/identity/repository.ts` to join `account` (on `account.id = session.account_id AND account.household_id = session.household_id`, D2) and return `locale` (validated with `isLocale`, falling back to `de`). Add `locale` to `ReadSession` in `src/modules/identity/session-cookie.ts`. Add a React-`cache`d `getRenderSession()` beside `getCurrentSession()` there, and update the matrix entry text for `resolveSessionContext` in `tests/integration/policy/authorization-matrix.test.ts` (it now also returns the account's locale).
- [x] 2.3 Add `src/ui/strings/request.ts` (`import "server-only"`) with `cache`d `getRequestLocale()` (in order: session → `flatmate_locale` cookie if `isLocale` → `preferredLocale(Accept-Language)` → `de`) and `getStrings()`. Test it in `tests/unit/ui/request-locale.test.ts`, mocking `next/headers` and `getRenderSession`: session beats cookie, cookie beats header, header beats default, invalid cookie ignored. Deliberate break: swap the session and cookie order and see the first case fail.
- [x] 2.4 Add `src/ui/strings/provider.tsx` (`"use client"`): `StringsProvider({ locale, children })` and `useStrings()`. The context has no default, so `useStrings()` throws outside a provider. Add `tests/helpers/render-with-strings.tsx` (renders inside the provider, `de` by default).
- [x] 2.5 In `tests/setup.ts`, mock `@/ui/strings/request` to German by default (`getRequestLocale → "de"`, `getStrings → de`), with a comment citing design D10. The resolver test uses `vi.importActual`.

## 3. The sweep (D2, D3, D7, D9)

- [x] 3.1 Before editing, classify every file that imports from `@/ui/strings` (`grep -rln 'from "@/ui/strings"' src`) as one of:
  - **server component**
  - **server action**
  - **client component**
  - **loading.tsx**
  - **module**
  - **outbound text (D7)**

  Confirm the outbound set by reading what each copy or clipboard path emits. Known outbound so far: `src/app/(org)/rounds/[id]/applications/invite-text.ts`. Check `src/app/(org)/members/join-code-copy-buttons.tsx` and any other copy-to-clipboard path. Record the final outbound allowlist in this file.
- [x] 3.2 `src/app/layout.tsx`:
  - Make it `async`, with `<html lang={await getRequestLocale()}>`.
  - Replace the static `metadata` with `generateMetadata` reading `t.document.description`. The title stays "Flatmate.io".
  - Wrap `children` in `<StringsProvider locale={…}>`.

  In `src/app/(resident)/layout.tsx` and `src/app/(org)/layout.tsx`, switch to `getRenderSession()`.
- [x] 3.3 Server components and server actions: replace the `de` import with `const t = await getStrings()` inside each function, called **before** any `withSessionContext` and never inside a transaction callback (D2: nested sessions throw `NestedSessionContextError`). Move every module-level `const t = de.x` into the function that uses it. Touch only files from the 3.1 list.
- [x] 3.4 Client components (25 files, including `src/app/_frame/avatar-menu.tsx`, the `(auth)` forms, `src/ui/{password-input,submit-button,success-toast}.tsx` and the `error.tsx` boundaries): replace the module-level `de` import with `const t = useStrings()` inside the component. Non-component helpers take `t` as a parameter.
- [x] 3.5 `loading.tsx` files that display text (`src/app/(org)/members/loading.tsx`, `src/app/(auth)/{sign-in,register,join}/loading.tsx`, and any other that 3.1 found): move the text into a small client component using `useStrings()`. Keep the `@/ui/skeletons` import the pending-feedback lint requires.
- [x] 3.6 (no-op: `application-notice.ts` never imported `de`, only its header comment names `de.ts`) `src/modules/casting/application-notice.ts`: take `t: Strings` as a parameter from its caller instead of importing `de`. Leave its `Intl.DateTimeFormat("en-CA")` date-key trick untouched.
- [x] 3.7 Dates: `src/app/(org)/members/members-view.tsx:32` and `src/app/(resident)/dashboard/dashboard-view.ts:65` take the locale and use the map from 1.1 instead of `"de-DE"`.
- [x] 3.8 Outbound files from 3.1 keep `import { de }`, each with a one-line comment citing the vocabulary spec's "Text for people outside the app stays German". Add `tests/unit/casting/invite-text-language.test.ts`: with the request mocked to `en`, the invite text equals the German text. Deliberate break: route it through `getStrings()` and see the test fail.
- [x] 3.9 Run the gate grep: `grep -rn 'import { de' src` must list only the outbound allowlist and `src/ui/strings/*`. Fix every other hit.
- [x] 3.10 Update existing unit tests that render client components to use `renderWithStrings`. Their assertions keep going through `de.*`. Don't change any assertion's meaning.

**Outbound allowlist (3.1, final):** `src/app/(org)/rounds/[id]/applications/invite-text.ts` and
`src/app/(org)/rounds/[id]/applications/notice.tsx` (the suggested Art. 13 / Art. 14 notice texts the household
copies to the applicant, `NoticeTextPanel`). `join-code-copy-buttons.tsx` copies only the link and the code, no
words, so it is not outbound.

## 4. Storage and setter (D4, D5, D6)

- [x] 4.1 Add `check("account_locale_check", sql\`${t.locale} in ('de','en')\`)` to `account` in `src/modules/identity/schema.ts`. Generate the migration `drizzle/<n>_account_locale_check.sql` (number from 0.3) with `DROP CONSTRAINT IF EXISTS account_locale_check` before the `ADD CONSTRAINT`, plus its snapshot and journal entry. Run `scripts/lint/migration-shape.ts`.
- [x] 4.2 Apply the migration to `flatmate-io-dev` the same way the previous changes did. Then verify in the catalog that `pg_constraint` has `account_locale_check` on `account` with the expected definition. If it does not, stop and report. Never infer that it is merely pending.
- [x] 4.3 Add `setOwnLocale(context, locale)` in `src/modules/identity/repository.ts`, per D5:
  - `isLocale` guard with a typed error code (`invalid_locale`);
  - the UPDATE keyed on `context.accountId` and `context.householdId`;
  - a throw on zero rows (`no_account`);
  - no account-id parameter.

  Add it to `NOT_APPLICABLE_IDENTITY` in `tests/integration/policy/authorization-matrix.test.ts` with the D5 reason text.
- [x] 4.4 Add `tests/integration/identity/set-own-locale.test.ts` (real dev database, cleanup in `afterEach`):
  - (a) a resident sets `en`: their `account.locale` is `en`, and a housemate's and the household account's stay `de`;
  - (b) `"fr"` is refused with `invalid_locale` and nothing changes;
  - (c) raw SQL as `app_runtime` setting `'fr'` is refused by the constraint named `account_locale_check`, asserted by name and with a positive control writing `'en'`;
  - (d) the household-account session sets its own account only.

  Deliberate breaks:
  - drop the `accountId` predicate (as a temporary edit) and see (a) fail;
  - remove the guard and see (b) fail with a different code.
- [x] 4.5 Add `locale: Locale` to `registerHousehold`, `joinHousehold` and `claimResidentProfile` in `src/modules/identity/auth.ts`, written in their `insert(account)`. Leave `createNonResidentModerator` on the default (D6). Pass `await getRequestLocale()` from `src/app/(auth)/register/actions.ts`, `src/app/(auth)/join/actions.ts`, `src/app/(auth)/join/[code]/` actions, and the claim caller. Update every test and `scripts/seed-demo-household.ts` call site to pass `"de"`.
- [x] 4.6 Add `tests/integration/identity/account-locale-on-create.test.ts`: `joinHousehold(…, "en")` stores `en`; `registerHousehold(…, "de")` stores `de`; `claimResidentProfile(…, "en")` stores `en`. Deliberate break: drop `locale` from one insert and see that case fail.

## 5. The toggle (D8)

- [x] 5.1 Add `src/app/_frame/language-actions.ts` (`"use server"`) with `switchLanguage(formData)`:
  1. `isLocale` guard;
  2. if `getCurrentSession()` returns a session, `setOwnLocale(context, locale)`;
  3. always set the `flatmate_locale` cookie (HttpOnly, SameSite=Lax, `secure` in production, `path: "/"`, one year);
  4. `revalidatePath("/", "layout")`.
- [x] 5.2 Add `src/app/_frame/language-toggle.tsx` (`"use client"`): a form with a hidden `locale` set to the other language and the shared `SubmitButton` labelled with that language's endonym. Mount it in `src/app/_frame/avatar-menu.tsx` (both surfaces) and in `src/app/(auth)/layout.tsx` above the content.
- [x] 5.3 Add `tests/unit/ui/switch-language-action.test.ts`, mocking `next/headers`, the session and `setOwnLocale`:
  - with a session it calls `setOwnLocale` with the session's context and sets the cookie;
  - without one it sets only the cookie;
  - an invalid value does neither.

  Deliberate break: skip the session branch and see the first case fail.

## 6. Docs (human decision 2026-10-07, same commit as the code)

- [x] 6.1 `docs/03-PRD.md`: the **Sprache** row and the note before §4.6 now say German and English are selectable per account, decided by the human on 2026-10-07 for the English pitch. Keep the paste-parser limit sentence. Write in German.
- [x] 6.2 `docs/adr/0006-stack-nextjs-postgres-drizzle.md`: a new „Ergänzung 2026-10-07" recording that the second table now exists and that the earlier „kein Auftrag" is superseded by the human's decision. Leave the status line untouched.
- [x] 6.3 `docs/screens/rahmenwerk.md`: in the §8.6 Architekturhinweis, record that `en` exists and that §8.6 binds the German table; add the language row to the avatar-menu description. `docs/screens/A-zugang.md`: the pre-account toggle on sign-in, register and join.
- [x] 6.4 `docs/SPEC-INDEX.md`: extend the **Sprache** row with the UI language choice and its authoritative source (PRD language row). `docs/review-log.md` §Offene-Punkte-Register: one closed entry for the decision, and one parked entry: "no binding English vocabulary counterpart to §8.6".
- [x] 6.5 Run `node tools/check-refs.ts` and fix every finding. Confirm no `docs/` file cites `openspec/` (Rule 7).

## 7. Verify

- [x] 7.1 Run `npm run verify` and get it green: eslint, tsc, the nine guardrail lints, check-refs and vitest against `flatmate-io-dev`.
- [x] 7.2 Run `npm run build` and confirm no route errors on `cookies()`/`headers()` in the root layout.
- [x] 7.3 Preview walk-through (`preview_start`):
  - an English-preferring browser opens `/join/<code>` and sees English;
  - toggle the sign-in screen to German and back;
  - register in English and land in English;
  - sign in as two residents of the seeded household in two tabs or profiles, set one to English, and confirm the other stays German;
  - `<html lang>` follows;
  - the copied invite text is German under English.

  Screenshot proof.
