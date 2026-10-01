# WP09 · UI refactors: capture-form split, one Berlin date formatter, invite-link origin

> One-line: paste into a fresh Cursor Agent session; read `audit/cursor/README.md` first.

## 1. Goal

Findings #21 (warm-up refactor), the date part of #20, and #35 of `audit/technical-debt.md`:

- **#21** `capture-form.tsx` (507 lines, two modes switched on `FormMode.kind`, a test-only `initial` prop) becomes shared form fields plus thin `CaptureForm` and `EditForm` wrappers. Pure refactor under existing tests.
- **#20 (date part only)** One `src/ui/format.ts` formats dates in `Europe/Berlin`. The members page stops formatting in the server's zone (fix: an off-by-one-day on a UTC host).
- **#35** Invite links are built from an `APP_ORIGIN` environment variable, not from the request `Host` header (the link carries a bearer code). Host is a development-only fallback.

## 2. Branch, dependencies, conflicts

- Branch from current `main` **after change 2b is merged**: `refactor/wp09-ui-refactors`. One PR, three independent commit groups (A: #21, B: #20 date, C: #35); if the PR grows, ship #21 alone first.
- **Must not run in parallel with WP08** (both touch `src/app/(org)/` action/page files and `src/ui/strings/de.ts`). Rebase onto WP08 if it landed first.
- **Reserved for 2b (finished before this starts, do not re-plan):** role checks, `isAdmin` / `canAct` / `leadWithJoinCode`, `getResidentList`, `getNavigationAccess`, permission constants, and the role branching of `members/page.tsx` (rendering by `isAdmin` / `m.role`, lines ~169-414 before 2b). The **grouping into Maps, the `MemberRow` / `JoinCodeCard` extraction and a `members-view.ts` belong to 2b**, not to this package. #20's date helper and #35's origin only touch the places named below; wherever 2b moved them, follow them (`grep -n "formatGermanDate\|headers()\|buildJoinUrl" src/app`).
- #35 changes `buildJoinUrl` in `src/modules/identity/repository.ts`; WP12 later splits that file. Edit only that one function and its callers.

## 3. Read first

1. `audit/cursor/README.md`, `CLAUDE.md`, `.claude/rules/implementation-hazards.md` (the "anything keyed on request data: ask who can set it" paragraph is the reason for #35), `.claude/rules/guardrail-lints.md`.
2. `audit/technical-debt.md` findings #20, #21, #35.
3. `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/headers.md` (async `headers()` in this version) and the Server/Client Components page under `01-getting-started/` before moving `"use client"` boundaries.
4. Tests that pin #21: `tests/unit/casting/capture-page.test.ts` (renders with `renderToStaticMarkup`; it is the only test that imports `capture-form`), `third-party-notice.test.ts`, `capture-action.test.ts`, `update-action.test.ts`, `capture-steps.test.ts`, `application-notice.test.ts`.
5. Date precedent: `tests/unit/start/dashboard-view.test.ts` ("names the Berlin calendar day, not the server's").

## 4. Current state (verified 2026-10-01 on main @ 3401c94, before 2b)

**capture-form.tsx** (`src/app/(org)/rounds/[id]/applications/new/`, 507 lines, `"use client"`):
- Exports `CaptureForm`, the type `FormMode` (`{kind:"capture"}` or `{kind:"edit"; applicationId; baseline; stored; capturedAt; deadlinePassed}`) and `errorTextsFor(kind)`.
- Switches on `mode.kind` in ~12 places: `edit` constant, `errorTextsFor`, `stepMode`, which action `useActionState` binds (`updateApplicationAction` from `../[applicationId]/edit/actions` versus `captureApplicationAction`), initial values of 8 `useState`s, hidden inputs `applicationId`/`baseline`, intro text, save/pending labels, notice `dateLabel`, `deadlinePassed`.
- The prop `initial?: { step?, thirdParty?, extraRows? }` is documented "Only for the render tests".
- State: `step`, `message`, `name`, `age`, `contacts`, `rows`, `nextKey`, `thirdParty`, `shown`, `seenState` plus `useActionState` and `useTransition`. A render-phase "adjust state when a value changes" block (lines ~145-152) turns a server refusal into `shown` and jumps to the step holding the field.
- Call sites: `new/page.tsx:84` (`roundId`, `household`, `dateLabel`) and `[applicationId]/edit/page.tsx:90` (adds `mode={{kind:"edit",...}}`). `edit/actions.ts` imports `CaptureFormState` (type) from `new/actions.ts`.
- Pure logic already lives in `capture-steps.ts` (122 lines, tested by `capture-steps.test.ts`).

**What the existing tests actually cover (all via `renderToStaticMarkup`, i.e. first render only; no jsdom, no Testing Library in `package.json`):**
- Capture: the page guard states; step 1/2/3 markup, `data_subject` / `third_party` hidden value, hidden carry of earlier steps, every control's name+label vs the Art. 9 blocklist (`capture-page.test.ts`).
- Edit (`describe("the correction form: O3 in edit mode")`, ~lines 257-390): starts on the message pre-filled; step 2 pre-filled with `Änderungen speichern`; `errorTextsFor("edit")` texts never say "erfass"; `baseline` + `applicationId` hidden inputs; switching to a third party shows the notice step with the date counted from `capturedAt` (passed and still-open variants); an already-third-party application goes straight to save.
- **Gaps (not covered today), to pin first:**
  1. A server refusal displayed: `shown` rendering via `fieldError(field)` and `generalError`, in **both** modes with their different texts (`errorTextsFor`), and the jump to the step holding the field (`stepForField`).
  2. `contact_kind_taken` (clash index) and `too_long` + `field: "contact"` (too-long index) inline messages; the "stored as" hint under a non-empty contact.
  3. The 90 % counters: `messageNear` style, `nameNear` hint.
  4. The limits: "add contact" absent at `MAX_CONTACTS`, "add attribute" absent at `APPLICATION_LIMITS.attributesMax`, attribute rows pre-filled from `stored.attributes` in edit mode, `extraRows` seed in capture mode.
  5. Edit mode with `stored.contacts = []` renders one empty contact input.
  6. Not coverable by static rendering, so they move verbatim and are listed as accepted risk in the PR: click handlers (`goTo`, add/remove contact and attribute rows), `onSubmit` + `startTransition`, the `typeof window !== "undefined"` branch of the capture `dateLabel`, pending labels. `decideSubmit` / step logic is covered in `capture-steps.test.ts`.

**Dates (#20).**
- `members/page.tsx:34` `formatGermanDate(date)` = `toLocaleDateString("de-DE", { day:"numeric", month:"numeric", year:"numeric" })` with **no `timeZone`**, used for `deletedOn` / `expiredOn` / `validUntil` (lines 53, 55, 59). Output looks like `1.7.2026`.
- `(resident)/dashboard/dashboard-view.ts:48` has its own `formatGermanDate`, `month: "long"`, `timeZone: "Europe/Berlin"` (`"14. Oktober 2026"`), pinned by `dashboard-view.test.ts`.
- `modules/casting/application-notice.ts:62-107` is a third, different thing: `BERLIN` `Intl.DateTimeFormat`, `calendarDateOf`, `oneMonthAfter`, and `formatDateDe(CalendarDate)` giving `TT.MM.JJJJ`. It works on calendar dates, not instants, is part of a domain module, and has its own tests.
- No `src/ui/format.ts` exists.

**Invite URL (#35).**
- `members/page.tsx:179`: `const host = (await headers()).get("host")`, comment "never an env var"; passed to `renderJoinCodeCard(…, host, …)` and `buildJoinUrl(host, code)` at lines 73, 423, 448.
- `identity/repository.ts:979`: `buildJoinUrl(host: string | null, code)` returns `https://${host}/join/${code}` or the relative `/join/${code}` when host is null. It is always `https`, even for `localhost`.
- Tests: `tests/unit/identity/join-code-never-in-query-or-log.test.ts` asserts `buildJoinUrl("example.test", code)` and `buildJoinUrl(null, code)`; `authorization-matrix.test.ts:149` lists it as a pure helper.
- `.env.example` has no app-origin variable. There is no `vercel.json` and no deployment doc in the repo; the app runs on Vercel per ADR-006, so production configuration lives in the Vercel dashboard. `.github/workflows/ci.yml` needs no change (the variable is optional).

## 5. Package-specific hazards

1. **Refactor rule (README 3).** Phase A tests pass against today's code and must be seen failing under a deliberate break before any move. The existing assertions stay untouched; only a render helper or import path may change (say so in the commit body).
2. **Client/server boundary.** New files that call hooks start with `"use client"`. `edit-form.tsx` imports a server action into a client component, as `capture-form.tsx` does today; do not import actions into the shared fields file (pass the action as a prop) so the fields file has no cycle through `edit/actions.ts` → `new/actions.ts`.
3. **Hydration.** Keep the notice `dateLabel` logic exactly as is (`typeof window === "undefined"` fallback, edit counts from `capturedAt`, never from now: EC-3.5).
4. **Art. 9 blocklist (G-F3).** `capture-page.test.ts` enumerates every control and label; the split must not rename a field or label. `data-inventory` is unaffected (no schema change).
5. **`#20` is a behaviour fix, not a pure refactor.** The members text changes only when the server zone differs from Berlin and the instant is near midnight; everything else must be byte-identical. Pin first, then fix.
6. **`#35` is a security fix on a bearer-credential link.** Treat `APP_ORIGIN` as configuration, validate it, and never log its value. An invalid or missing value in production must **fail loudly**: throw a coded `AppOriginNotConfiguredError` that the `(org)` error boundary renders (WP08). It must never fall back to the Host header, and never silently to a relative link, since a relative invite link cannot be shared and nobody would notice. (Reviewer decision 2026-10-01, overriding this package's first draft.)
7. Do not run `next dev` leaving `.env.local` changes in the commit; `.env.local` is local only.
8. 2b may already have renamed or moved things in `members/`. Re-read before editing; if the structure differs materially from section 4, stop (README 9).

## 6. Plan

### Phase A — characterization / failing tests

- **A1 (#21)** `tests/unit/casting/capture-form-characterization.test.ts` (`test(casting): pin the capture/correction form's refusal rendering`). Same technique as `capture-page.test.ts`. To reach states that need a server answer without a DOM, `vi.mock("react", async (orig) => ({ ...(await orig()), useActionState: (...) => [mockState, vi.fn()] }))` so the first render receives `{ status: "error", code, field }`; React applies the render-phase `setSeenState`/`setShown` during `renderToStaticMarkup`. Cover gaps 1-5 of section 4, each in capture **and** edit mode where the text differs (assert via `errorTextsFor`/`de`, never a German literal). Prove it can fail (e.g. swap `e[shown.code]` for `CAPTURE_ERRORS[...]` and see the edit case go red), revert.
  - If this mock approach cannot reach a branch, say so in the report. Adding `jsdom` + `@testing-library/react` is a human decision (new dev dependencies); do not add them yourself.
- **A2 (#20)** `tests/unit/ui/format.test.ts` is written in step B2 first (it needs the new module), but write the **members-page pin now**: extract nothing; instead, in the same file add a `describe` that calls the page's date text through the smallest seam that exists after 2b (the `joinCodeStatusLabel` or its successor, exported only if 2b already exports it; otherwise skip and rely on B2's unit test plus a source check). Record in the PR which seam you used.
- **A3 (#35)** `tests/unit/identity/join-code-never-in-query-or-log.test.ts` already pins the path-segment shape; leave it. The new `app-origin` tests are written red-first in step C1.

### Phase B — change (numbered steps = commits; `npm run verify` green before and after each)

**Group A: #21**

1. `refactor(casting): extract the application form's fields into a shared component`
   - New `.../applications/new/application-form-fields.tsx` (`"use client"`): `ApplicationFormFields` holds all current state, JSX and handlers. Props: `{ roundId, household, dateLabel, action, mode: FormMode, seed?: FormSeed }`. `action` has the type `(prev: CaptureFormState, formData: FormData) => Promise<CaptureFormState>`; it is passed to `useActionState`. `FormSeed` = today's `initial` shape, renamed and documented as "starting state; the wrappers never pass it, tests do".
   - Move `FormMode`, `errorTextsFor`, `FORM_ID` etc. into it (or a small `form-mode.ts` if types alone are cleaner). Keep exported names the tests import; re-export from `capture-form.tsx` if needed so import paths in tests need not change in this step.
   - Mode-specific derivations stay in one place at the top of the component (`edit`, `stepMode`, `e`, labels). Do not split the JSX into more components than the three steps need (YAGNI): the optional extra step-level components (`MessageStep`, `DetailsStep`) are allowed only if the diff stays a pure move; skip them otherwise.
2. `refactor(casting): thin CaptureForm and EditForm wrappers`
   - `capture-form.tsx` keeps `CaptureForm({ roundId, household, dateLabel })` → `<ApplicationFormFields mode={{kind:"capture"}} action={captureApplicationAction} … />`.
   - New `.../[applicationId]/edit/edit-form.tsx`: `EditForm({ roundId, household, dateLabel, edit })` → `<ApplicationFormFields mode={{kind:"edit", ...edit}} action={updateApplicationAction} … />`. Update `edit/page.tsx` to use it (props unchanged in value).
   - The `initial` prop disappears from the wrappers. Update `capture-page.test.ts` helpers `renderStep`/`renderEdit` to render `ApplicationFormFields` with `seed`; **assertions untouched**, listed in the commit body. A1 renders the wrappers or the fields component, whichever reaches the branch.
   - Check: `rg "capture-form" src tests` shows only `new/page.tsx`, tests, and imports you intended.

**Group B: #20 date**

3. `fix(ui): format dates in the household's time zone` (red-first)
   - Test first, `tests/unit/ui/format.test.ts` against the not-yet-existing module (red = module missing, then red on assertion once stubbed): `formatBerlinDate(d, "numeric")` and `(d, "long")`. Boundary cases independent of the host zone: `2026-06-30T22:30:00Z` (00:30 CEST on 1 July) → `1.7.2026` / `1. Juli 2026`; `2026-12-31T23:30:00Z` (00:30 CET on 1 January) → `1.1.2027`; `2026-03-29T00:30:00Z` (01:30 CET before the spring change); `2026-10-25T22:30:00Z` (00:30 CEST on the night of the autumn change). Include a mid-day instant that is identical in every zone.
   - Show the defect: run the same instant through the old formatter under `TZ=UTC npx vitest run …` (Git Bash: `TZ=UTC npx vitest run tests/unit/ui/format.test.ts`) and confirm `30.6.2026`; the new function must be zone-independent, so run the new test under both `TZ=UTC` and `TZ=America/Los_Angeles`.
   - Implement `src/ui/format.ts`: `export const HOUSEHOLD_TIME_ZONE = "Europe/Berlin"` and `formatBerlinDate(date: Date, style: "numeric" | "long"): string` using `toLocaleDateString("de-DE", {...style options, timeZone})` with exactly the option sets the two private helpers use today.
   - Replace both private `formatGermanDate`s (members page or its 2b successor; `dashboard-view.ts`) with calls. `dashboard-view.test.ts` must pass unchanged. Delete the local helpers.
   - **Decision recorded, not coded:** `application-notice.ts` keeps its own `BERLIN` formatter and `formatDateDe(CalendarDate)`. It is a domain module (it may not import from `src/ui`), operates on calendar dates, and prints another format. State this in the PR; do not merge them.
   - Behaviour change for the PR text: members-page link dates are now Berlin dates on any server.

**Group C: #35 invite origin**

4. `fix(identity): build invite links from APP_ORIGIN` (red-first)
   - Tests first, `tests/unit/start/app-origin.test.ts` for a pure `resolveAppOrigin({ env, hostHeader })` in new `src/app/app-origin.ts` (beside `landing.ts`; it reads no globals, so it is testable): `APP_ORIGIN="https://flatmate.example"` → that origin; with path/trailing slash/query (`https://x.example/foo/?a=1`) → `https://x.example`; `http://` in production → null; credentials (`https://u:p@x.example`) → null; garbage → null; unset or invalid + `NODE_ENV=production` → **throws `AppOriginNotConfiguredError` even when a Host header is given** (this is the security fix: assert it fails against a Host-based implementation); unset + `NODE_ENV=development` + host `localhost:3000` → `https://localhost:3000` (today's behaviour); unset + development + no host → null. `console.error` is called at most once with a fixed string containing neither the variable's value nor any header.
   - Implement `resolveAppOrigin`; the members page calls it with `process.env` and `(await headers()).get("host")`. Change `buildJoinUrl(origin: string | null, code)` to `origin ? `${origin}/join/${code}` : `/join/${code}``. Update the two assertions in `join-code-never-in-query-or-log.test.ts` for the new parameter (`"https://example.test"` in place of `"example.test"`); the invariants they pin (path segment, no `?`, no `code=`) are unchanged; list this test edit in the commit body. `buildJoinUrl(null, normalised)` callers in `join/actions.ts` and `join/[code]/actions.ts` pass `null` and need no change.
   - Fix the stale comment at the old line ~176 ("never an env var").
5. `docs(env): document APP_ORIGIN`
   - `.env.example`: add after the `JOIN_ATTEMPT_TRUSTED_IP_HEADER` block, in the file's style: `# Public origin of this deployment, used to build the invite links on /members (a link is a bearer credential, so it is never derived from the request Host header). Required in production: https only, e.g. https://flatmate.example. Local development: http://localhost:3000. If unset in production the members page fails with a configuration error.` with `# APP_ORIGIN="https://[YOUR-DOMAIN]"`.
   - `CLAUDE.md` / `docs/` are not edited (docs are a handover boundary). If `openspec/specs/identity/**` states the Host rule, update it in the same commit (grep `Host\|host` first).

### Phase C — follow-through

- `npm run verify` green. `node tools/check-refs.ts` is unaffected (no `docs/` edit); run it only if you touched `docs/`.
- Manual check (`npm run dev`, set `APP_ORIGIN="http://localhost:3000"` in `.env.local`, not committed): `/members` shows `http://localhost:3000/join/…`; unset it in development and see today's `https://localhost:3000/...` fallback; capture a new application and correct one (all three steps, third-party switch, refusal states) to compare visually before/after the split.
- 🛑 HUMAN: set `APP_ORIGIN` for the **production** (and, if wanted, preview) environment in the Vercel dashboard before merging to `main`'s deploy, otherwise the production members page fails with `AppOriginNotConfiguredError`. No value is committed. Say exactly which environments need it.
- 🛑 HUMAN: decide the open points in section 8.
- Paste the hand-back report into the PR.

## 7. Acceptance criteria

- [ ] A1 added, seen failing under a deliberate break; the existing capture/edit tests pass with assertions unchanged (only render helpers/imports edited, listed in the commit body).
- [ ] `capture-form.tsx` is a thin wrapper; `edit-form.tsx` exists; `initial` is gone from both wrappers; no file in the form has more than one mode switch on `mode.kind` outside the top-of-component derivations.
- [ ] `src/ui/format.ts` exists with Berlin-zone tests passing under `TZ=UTC` and a non-Berlin zone; no `toLocaleDateString("de-DE"` without `timeZone` remains in `src/app`; `dashboard-view.test.ts` unchanged and green.
- [ ] `resolveAppOrigin` tests include "production, no `APP_ORIGIN`, Host present → null" and were seen failing before the change; the members page contains no `headers()`-derived origin outside the dev fallback.
- [ ] `buildJoinUrl` still never places the code in a query string; `.env.example` documents `APP_ORIGIN`.
- [ ] No 2b-reserved logic touched; no new dev dependencies; `npm run verify` green after every commit; hand-back lists each manual check.

## 8. Out of scope & stop conditions

Out of scope: grouping/`members-view.ts`/`MemberRow`/`JoinCodeCard` (2b); role branching; merging `application-notice.ts`'s date helpers into `format.ts`; changing `buildJoinUrl`'s `https` for loopback hosts (set `APP_ORIGIN=http://localhost:3000` locally instead); a startup assertion for `APP_ORIGIN` (compare WP06/WP02's production assertions; mention as a candidate); adding a DOM test stack; page-level session redirects (WP08).

Stop and report if: 2b has not merged or has restructured `members/` beyond what section 4 assumes; the `useActionState` mock cannot reach the refusal branches and the fix would need an untested restructure; `capture-page.test.ts` needs more than render-helper edits; a guarded (G-D) test would change.

Open human decisions: (1) add `jsdom` + Testing Library to pin the interactive handlers (otherwise accepted risk); (2) keep the `seed` prop on the shared fields component, or replace it with a test-only wrapper; (3) production/preview behaviour when `APP_ORIGIN` is unset: relative link (planned) versus a visible warning on the members page or a startup failure.

## 9. Hand-back report (template)

```
WP09 hand-back
Branch / PR:
Commits (one line each, step number):
Characterization tests added (file, branches pinned, how each was seen failing):
Gaps from section 4 that stayed unpinned (accepted risk):
Test edits in existing files (file, lines, why they are not weakenings):
Red-first evidence: format.test.ts (TZ=UTC run), app-origin.test.ts (Host-based implementation fails):
Seam used for the members-page date pin:
npm run verify: <n> files, <n> tests passed / <n> failed; lints: <ok/fail>
Behaviour changes (intended): Berlin dates on /members; invite links from APP_ORIGIN (production without it -> AppOriginNotConfiguredError)
Manual checks done:
Vercel env var set (human): <environments>
Open questions / follow-ups for 2b, WP12 (buildJoinUrl move), WP06 (startup assertion):
```
