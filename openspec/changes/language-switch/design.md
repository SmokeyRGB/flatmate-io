## Context

See proposal.md (Why) for the motivation and the human's five decisions of 2026-10-07. The current
state that shapes the approach:

- **Strings.**
  - `src/ui/strings/index.ts` re-exports one table, `de` (`as const`). Its type, `De`, is the type
    of that literal.
  - About 81 files import it: 25 client components, plus server components, server actions,
    `loading.tsx` files and one module (`casting/application-notice.ts`).
  - The table holds about 58 entries that are functions (plurals, names interpolated).
  - Nothing ties `en.ts` to `de.ts`. Both end in a bare `as const`.
- **`account.locale`** exists (`identity/schema.ts`, `drizzle/0004`): `text NOT NULL DEFAULT 'de'`,
  no CHECK.
  - It is inventoried as ⚙️ in `data-inventory.yml`, and nothing reads or writes it.
  - `account` carries `household_id` under the `account_household_isolation` policy.
  - Three paths insert an account: `registerHousehold`, `claimResidentProfile` and `joinHousehold`
    (all in `identity/auth.ts`).
- **The root layout** (`src/app/layout.tsx`) hard-codes `<html lang="de">` and exports a static
  `metadata` with `de.document.description`.
  - `getCurrentSession()` (`identity/session-cookie.ts`) resolves the session through
    `resolveSessionContext`, which already joins a second table to return `rememberMe` and
    `householdSignInCode`.
  - The `(resident)` and `(org)` layouts each call it. `_frame/session-data.ts` memoises the
    frame's other reads with React `cache`.
- **The `(auth)` layout** is the shared shell of sign-in, register and join. It is a server
  component with no session.
- **Pages are already dynamic.** Every page is per-request through the session cookie, and no
  `use cache`, `unstable_cache` or `force-static` exists. A per-viewer language therefore adds no
  cross-viewer caching hazard. Next 16's i18n guide describes locale-prefixed routes. It does not
  fit, because the language here belongs to the person, not to the URL.

## Goals / Non-Goals

**Goals:**
- One request-scoped answer to "which language", used by the root layout, every server component
  and every server action.
- A type contract that makes a missing or differently-shaped English entry a build error.
- No extra database round trip on the layout path of a signed-in page.
- Existing tests keep passing unchanged where they assert through `de.*`.

**Non-Goals:**
- A third language, or translating the paste parser's German patterns (`03-PRD.md`'s note before
  §4.6 keeps that as a known limit).
- Translating text addressed outside the app (spec: *Text for people outside the app stays
  German*).
- Splitting the client bundle per language.
- Moving the language into the URL.
- An English counterpart to §8.6's binding vocabulary (proposal A1).

## Decisions

### D1. The tables: `Strings` is the widened shape of `de`, and both tables satisfy it

- `src/ui/strings/` gains a `Strings` type: a mapped type over `typeof de`.
  - String literals widen to `string`.
  - Functions keep their parameter list and return `string`.
  - Nested objects recurse.
- `en.ts` ends in `as const satisfies Strings`. `de.ts` keeps its bare `as const`: it cannot `satisfies` a type derived from its own `typeof` without a circular-reference error, and it is the reference anyway.
  - A missing key, an extra key or a different parameter list in `en` fails `tsc`.
  - The extra-key case relies on excess-property checking of the object literal.
- `Locale = "de" | "en"` and `LOCALES` live in a small file, `src/ui/strings/locales.ts`, with no
  imports. It stays client-safe, and identity can import it for validation without pulling in the
  tables. The tables, not the database, decide which languages exist. The database CHECK (D4)
  mirrors that list.
- `index.ts` keeps exporting `de` for tests and for the outbound-text exception (D7). It also
  exports `tables: Record<Locale, Strings>`.
- **Alternative rejected: deriving the contract from `typeof de` directly.** It fails, because the
  `as const` literal types of the German strings would then be the contract.
- **Alternative rejected: a runtime check only.** It catches drift too late. A unit test of key
  parity is added anyway (D10), so the guarantee survives if someone later loosens the `Strings`
  type.

### D2. One request-scoped resolver, memoised

`src/ui/strings/request.ts` (`server-only`) exports two memoised functions:

- `getRequestLocale()`, wrapped in React `cache`:
  1. a live session's account locale,
  2. else a valid `flatmate_locale` cookie,
  3. else `preferredLocale(Accept-Language)`,
  4. else `"de"`.
- `getStrings()`, also `cache`d, returns `tables[await getRequestLocale()]`.

How each kind of caller uses it:

- Server components and server actions call `const t = await getStrings()` inside the function body, **before** any `withSessionContext`. `getStrings()` may resolve the session, which opens its own `withSessionContext`, so calling it inside another one's callback throws `NestedSessionContextError` (implementation-hazards.md, one pooled connection per call chain). Repository code never calls it; a module that needs text takes `t` as a parameter.
- Module-level `const t = de.x` constants move inside the function: one per request, not one per
  process.
- `preferredLocale(header)` is a pure function in the same directory. It parses q-values, matches
  by primary subtag (`en-GB` matches `en`), and returns whichever of `de`/`en` ranks higher, or
  `"de"` if neither appears.

**Session read: no extra round trip on the layout path.**

- `resolveSessionContext` adds `account.locale` to its select (one more join, same query), and
  `ReadSession` gains `locale`. The join carries its own household predicate:
  `account.id = session.account_id AND account.household_id = session.household_id`. With no foreign keys, the pairing is otherwise unenforced (implementation-hazards.md).
- A React-`cache`d `getRenderSession()` in `session-cookie.ts` wraps `getCurrentSession()`. The
  root layout (through `getRequestLocale`) and the `(resident)` and `(org)` layouts use it. The
  three layouts of one render then share one resolution, where today two of them run one each.
- Pages and actions keep calling the uncached `getCurrentSession()`. That avoids any question of a
  cached session surviving a cookie change inside an action.
- **Alternative rejected: the cookie as the only runtime source**, with the database as mirrored
  storage. It would cost no query, but a choice made on one device would not reach a device already
  signed in until it signs in again. The spec says the choice follows the account.

### D3. Client components: a provider in the root layout

- `src/ui/strings/provider.tsx` (`"use client"`) exports `StringsProvider({ locale, children })`
  and `useStrings()`. It imports both tables and passes `tables[locale]` through context.
- The root layout renders `<StringsProvider locale={await getRequestLocale()}>`, so every client
  component, `error.tsx` boundaries included, sits beneath it.
- The 25 client files replace their module-level `de` import with `const t = useStrings()` inside
  the component.
- A non-component helper in a client file that reads `de` takes `t` as a parameter instead.
- **Alternative rejected: the server passing the chosen table as a prop.** The 58 function-valued
  entries cannot cross the server→client boundary. Rewriting them as templates is a larger change
  than this one.
- **Cost accepted:** the client bundle carries both tables, about 35 KB of source each before
  minification.

### D4. Storage: a CHECK on the existing column, in one migration

- One migration, numbered after F5's `0035`:
  `ALTER TABLE account DROP CONSTRAINT IF EXISTS account_locale_check; ALTER TABLE account ADD
  CONSTRAINT account_locale_check CHECK (locale IN ('de','en'));`.
  - The drop-then-add form makes it re-runnable, per `migration-shape`'s intent.
  - `schema.ts` declares the same `check()`, so the drizzle snapshot agrees.
- **Statement order against live constraints:**
  - Every existing row is `'de'`, because no path has ever written anything else, so the ADD
    validates.
  - No enum is involved, so the own-file rule for enum values does not apply.
  - Old branches on the shared dev database only ever write the default, so tightening needs no
    expand/contract split.
- No new column, so the data inventory, `cleanup-inventory` and `undoRegisterHousehold` are
  unaffected.

### D5. The setter: `setOwnLocale(context, locale)`, self-service

`identity/repository.ts` gains `setOwnLocale(context: SessionContext, locale: Locale)`:

- It refuses a value outside `LOCALES` with a typed error.
- It runs `UPDATE account SET locale = $1 WHERE id = context.accountId AND household_id =
  context.householdId` inside `withSessionContext`.
- It takes no account id parameter, so a caller cannot name another account.
- It throws if zero rows matched (a stale context).

**Every path to the guarded state (one account's language changes only by its owner):**

- **This function.** Keyed on `context.accountId`, which comes from the authenticated session (the
  sibling-entry rule in implementation-hazards.md).
- **Account creation.** The three insert paths set the value once, for the account being created
  (D6).
- **Raw SQL as `app_runtime`.**
  - RLS confines a writer to their own household. Within it, a resident could set a housemate's
    language. This is the ADR-004 layering ("zweifach erzwungen heißt nicht identisch zweimal"):
    within-household ownership is application-level for every table.
  - The value grants nothing and decides no permission, so the cost is an annoyance, not an
    escalation. The CHECK still holds on this path.
  - Recorded as accepted rather than adding a per-row trigger. The privilege-write-boundary rule
    does not apply, because the column grants no privilege.
- **SECURITY DEFINER functions.** None writes `account.locale`, and none is added.
- **A concurrent request.**
  - There is no read-then-write: the UPDATE is one statement and two switches race to last-write-
    wins, which is the person's own latest choice.
  - Other writers of the same `account` row (`changeResidentPassword`, `redeemPasswordReset`, the
    email change) take the row lock `FOR UPDATE`. This UPDATE takes the same row lock for one
    statement in its own transaction, and holds no other lock, so it cannot form a cycle with them.

**Authorization matrix:** listed in `NOT_APPLICABLE_IDENTITY` as *"self-service, own account
only, keyed on context.accountId; the value grants nothing"*. It is tested in its own integration
test (D10).

### D6. Account creation inherits the request's language

- `registerHousehold`, `joinHousehold` and `claimResidentProfile` gain a `locale: Locale` parameter
  and write it in their `insert(account)`.
- Their actions pass `await getRequestLocale()`. On these screens there is no session, so that is
  the cookie or the browser preference: exactly what the screen was displayed in.
- `createNonResidentModerator` creates an account for someone else and keeps the default `'de'`.
  That person switches for themselves.
- The demo seed keeps the default.
- **Alternative rejected: copying the cookie into the account on first sign-in.** It would let a
  device override an account (spec: the account decides).

### D7. Outbound text stays German, by name

- `invite-text.ts`, and any copy-to-clipboard text that leaves the app (to be confirmed per file in
  task 3.1; known so far: the invite text and the join-link copy buttons' message, if it carries
  one), keep importing `de` directly.
- Each such file has a comment citing the vocabulary spec's *Text for people outside the app stays
  German*. The screen text around them uses `useStrings()`/`getStrings()` like everywhere else.
- A unit test asserts that the invite text is German when the request locale is English.

### D8. The toggle: one server action, two entry points

`src/app/_frame/language-actions.ts` exports `switchLanguage(formData)`:

1. It validates `locale` against `LOCALES`.
2. If `getCurrentSession()` returns a session, it calls `setOwnLocale(context, locale)`.
3. In every case it sets the `flatmate_locale` cookie (HttpOnly, SameSite=Lax, one year), so the
   device's pre-account screens remember the last choice (proposal A3).
4. It calls `revalidatePath("/", "layout")`, because a soft navigation does not re-render the root
   layout.

The control is a form with a hidden `locale` field and the shared `SubmitButton` (pending-feedback
lint). It offers the other language by its own name, „Deutsch" or "English" (proposal A2). The keys
are identical in both tables. It appears in two places:

- the shared `AvatarMenu`, for both surfaces and every role;
- the `(auth)` layout, above the content.

No cookie is set until the form is submitted (spec: nothing stored until the visitor chooses).

### D9. Language-dependent rendering beyond the tables

- The root layout becomes `async`: `<html lang={locale}>`, and `generateMetadata` reads
  `t.document.description`. The title stays the product name.
- The two `toLocaleDateString("de-DE")` sites take the locale: `members-view.tsx:32` and
  `dashboard-view.ts:65`. A `de` → `de-DE` / `en` → `en-GB` map lives beside `LOCALES`, so dates
  read day-first in both languages.
- `application-notice.ts`'s `Intl.DateTimeFormat("en-CA")` is a date-key trick, not display.
  It is untouched.
- **`loading.tsx` files that display text** (`members/loading.tsx` and the three auth ones) render
  that text through a small client component using `useStrings()`. An `await getStrings()` there
  would make a Suspense fallback wait on the session query it exists to hide.

### D10. Tests

- **Key parity** (unit): walks both tables and compares key paths and `function.length`, as belt
  and braces to D1.
- **`preferredLocale`** (unit): q-value ordering, subtags, absent header, neither language present.
- **`setOwnLocale`** (integration, real dev database):
  - Changes only the caller's account, and a housemate's stays unchanged.
  - Refuses `"fr"` with its error code.
  - The CHECK refuses `'fr'` written by raw SQL as `app_runtime`, asserted by the constraint name
    `account_locale_check`.
- **Account creation** (integration): `joinHousehold` with `"en"` stores `en`; `registerHousehold`
  with `"de"` stores `de`.
- **Resolver** (unit, with `next/headers` mocked): session beats cookie, cookie beats header,
  header beats default, and an invalid cookie is ignored.
- **Outbound text** (unit): the invite text stays German under an English request.
- **Existing tests:**
  - `tests/setup.ts` mocks `@/ui/strings/request` to German by default. Pages rendered directly in
    unit tests then never reach `cookies()` outside a request.
  - The resolver's own test uses `vi.importActual`.
  - Tests that render client components through the provider-free path get a `renderWithStrings`
    helper. The alternative, a default German context value, would silently pass a missing
    provider in production, so the provider has no default and `useStrings()` throws outside it.
- Each new test is seen failing against a deliberate break before it counts.

### D11. Docs, recorded with the human's decision in the same commit

- **`03-PRD.md`:** the language row and the note before §4.6 say v0.1 offers German and English
  per account, citing the 2026-10-07 decision. The paste-parser limit stays.
- **ADR-006:** a further Ergänzung, dated 2026-10-07. The Bestätigt status is untouched: the stack
  decision is unchanged, and only the "kein Auftrag" sentence is superseded by the human's
  decision.
- **`screens/rahmenwerk.md`:**
  - §8.6's Architekturhinweis records that `en` now exists and that §8.6 binds the German table.
  - The avatar-menu entry gains a language row.
- **`screens/A-zugang.md`:** the pre-account toggle.
- **`SPEC-INDEX.md`:** the language row names the UI language choice and its source.
- **`review-log.md`:** a closed entry recording the decision, plus a parked one: "no binding
  English vocabulary (A1)".

None of these cites `openspec/` (Rule 7), and `check-refs.ts` runs after.

## Risks / Trade-offs

- **[F5 `candidate-detail` collides]** on the migration number, on `de.ts`/`en.ts` and on four
  client components. → This change is applied only after F5 merges (human, 2026-10-07). Its first
  task rebases onto main and re-diffs the tables.
- **[en.ts lags de.ts]** → D1 makes `tsc` list every gap. The human's translation is copied from
  the main checkout, which already carries F5's 22 keys.
- **[The wide sweep (~81 files) hides a missed import]** → after the sweep, a grep for `{ de }`
  imports in `src/` must return only the outbound-text files of D7, and D7's list is the allowlist.
  A lint is not added: the type contract and the grep cover it for a one-off sweep. If a later
  change reintroduces direct imports, that is the moment for a lint.
- **[A cached session read in layouts goes stale]** → `cache` is per render. Actions keep the
  uncached read (D2).
- **[English copy invents role terms]** that drift from §8.6's German distinctions (Ausgezogen vs
  Entfernen, Löschen vs Widerrufen). → Review `en.ts` as copy in this change: one English word per
  §8.6 entry, kept distinct where German keeps them distinct.
- **[The client bundle carries both tables]** → accepted for v0.1 (D3).

## Migration Plan

- The agent writes the CHECK migration. It contains no `DROP COLUMN` or `SECURITY DEFINER`, so the
  harness does not refuse it.
- It is applied to `flatmate-io-dev` once F5's `0035` is applied there.
- Rollback: `ALTER TABLE account DROP CONSTRAINT account_locale_check`. Code that still writes only
  `de`/`en` is unaffected.
- Production stays at `0012` until the end of v0.1, as for every change.
