## 1. Docs

- [x] 1.1 `docs/screens/D-casting-tab.md` D2 *Kernelemente*: add one German line. While voting on
  the candidate is open (Runde offen, Bewerbung `new`/`screened`), the person can change or
  withdraw their own rating on D2. Withdrawing asks for confirmation and leads into the
  Durchlauf (C1). Cite `F4-requirements.md` EC-4.12 and the human decision of 2026-10-13. Never
  point into `openspec/` (Rule 7). Run `node tools/check-refs.ts`.

## 2. Read: the own rating on the detail (design D1)

- [x] 2.1 `src/modules/deliberation/repository.ts`:
  - Add `own: { rating: VoteValue | null; canChange: boolean }` to the `scored` and `unscored`
    members of `CandidateDetail`. `hidden` and `refused` stay unchanged.
  - Fill it in `getCandidateDetail` from `tally.countedValues.get(applicationId)` (the entry whose
    `voterId === context.profileId`).
  - Set `canChange` per D1, with a comment that it mirrors `vote_guard` steps 2/7 as a UI hint
    only. No new query.
- [x] 2.2 `tests/integration/deliberation/candidate-detail.test.ts`. Unique ids per run,
  teardown in `afterEach`. Cases:
  - (a) A scored candidate where two viewers hold **different** ratings: each sees their own value
    as `own.rating`.
  - (b) An unscored candidate: the same.
  - (c) Round paused: `canChange` is false and the rating is still present.
  - (d) An invited candidate the viewer rated: `canChange` false, `rating` present.
  - (e) An invited candidate the viewer never rated: `rating` null, `canChange` false.
  - (e2) `hideResultsUntilVoted` off, a `new` candidate the viewer has not rated (read directly
    through the repository, not the view): `rating` null, `canChange` false.
  - (f) `hideResultsUntilVoted` on, the viewer withdraws through `withdrawVote`: the detail is
    `hidden`, and its exact-keys assertion still passes (no `own`).

  Deliberate breaks, each seen failing:
  - take `rating` from the first counted vote instead of the viewer's (fails a);
  - drop the status check in `canChange` (fails c);
  - drop the state check (fails d);
  - drop the `rating !== null` clause (fails e2).

## 3. Rating bar moved (design D4)

- [x] 3.1 Create `src/app/(resident)/casting/rating-bar.tsx`:
  - move `RatingBar`, `RATING_CLASS` and `ICONS` there unchanged from
    `src/app/(resident)/casting/screening/screening-deck.tsx`;
  - add the pure `submittedRating(event): VoteValue | null` (the submitter parse from the deck's
    `onSubmit`);
  - update the deck to import both and keep its behaviour identical.
- [x] 3.2 Point `tests/unit/screening/screening-deck.test.ts`'s RatingBar cases at the new
  module, and add a `submittedRating` unit case: a known value, an unknown value, no submitter.
  Break: return the raw submitter value without the `VOTE_VALUES` check. The unknown-value case
  must fail.

## 4. Card actions (design D2)

- [x] 4.1 Create `src/app/(resident)/casting/candidate-actions.ts` (`"use server"`) with
  `changeRatingAction({ roundId, applicationId, value })` and
  `withdrawRatingAction({ applicationId })`:
  - check the ids as UUIDs before `getCurrentSession`;
  - map the results per D2;
  - **change:** revalidate `/casting`, `/casting/candidate/<applicationId>` and `/dashboard` on
    `ok` and on every `VoteError` except `invalid_input`;
  - **withdraw:** treat `ok` and `VoteError("not_found")` as success. Revalidate `/casting` and
    `/dashboard` only, then `redirect("/casting/screening", RedirectType.replace)`, outside any
    try/catch. Other refusals revalidate like a change;
  - on anything else, log only the class name.

  Read `node_modules/next/dist/docs/` on `revalidatePath` and `redirect` in server actions first.
- [x] 4.2 Create `tests/unit/casting/candidate-actions.test.ts`, in the `invite-action.test.ts`
  shape, with the repository and `next/cache` mocked. Cases:
  - only the ids and the value reach the repository, and the session context comes from
    `getCurrentSession`;
  - malformed or non-string ids return `not_found` before the session or the repository is
    called;
  - `no_session`;
  - every `VoteError` code is passed through, with `roundStatus` kept;
  - `ProfileRequiredError` → `not_eligible`;
  - an unknown error → `failed`, with only the class name logged;
  - change: the three paths are revalidated on `ok` and on refusals, none on `failed`,
    `no_session` and `invalid_input`;
  - withdraw `ok` and withdraw `not_found`: `/casting` and `/dashboard` revalidated, the card
    path **not**, and `redirect` called with `("/casting/screening", "replace")`. Mock
    `next/navigation`'s `redirect` to throw, as Next does.

  Breaks, each seen failing:
  - drop the `/dashboard` revalidation;
  - revalidate on `failed`;
  - read the session before the UUID check;
  - redirect without the replace type;
  - treat withdraw `not_found` as a refusal.

## 5. Own-rating UI (design D5, D8)

- [x] 5.1 Create `src/app/(resident)/casting/own-rating.tsx` (client):
  - the `OwnRating` component per D5;
  - the exported pure `ratingOutcome(result)` (D5);
  - the withdraw confirmation as a native `<dialog className="dialog">` with `showModal()` and a
    `SubmitButton` confirm;
  - selecting the held rating sends nothing.
- [x] 5.2 `src/app/(resident)/casting/candidate-detail-body.tsx`: render `<OwnRating>` in the
  `scored` and `unscored` branches, above the invite control. `hidden` and `refused` stay
  unchanged.
- [x] 5.3 `src/ui/strings/de.ts` + `src/ui/strings/en.ts`: the D8 keys under `casting.detail`, as
  twins. The German copy follows D8's draft, in apologising du-tone.
- [x] 5.4 `tests/unit/casting/own-rating.test.ts`:
  - `ratingOutcome` for every result code.
  - Markup via `renderWithStrings`:
    - with `canChange`: four rating buttons, the held one `aria-pressed="true"`, and the withdraw
      button;
    - paused: the rating text plus the paused reason, no buttons;
    - invited: the rating text plus the final reason, no buttons;
    - `rating: null`: "nicht bewertet", no buttons.

  Breaks, each seen failing:
  - render the controls regardless of `canChange`;
  - map `not_votable` to the generic failure.
- [x] 5.5 `tests/unit/casting/candidate-detail-view.test.ts`: add `own` to the scored and unscored
  fixtures, and assert that the hidden markup contains no own-rating label. Break: render
  `OwnRating` in the hidden branch. That case must fail. Extend the file's mocks:
  `@/modules/deliberation/repository` gains `VoteError`, `castVote` and `withdrawVote`;
  `next/navigation` gains `replace`, `refresh` and `useParams`; and the new
  `candidate-actions` module is mocked.

## 6. Frame accessibility (design D6, D7)

- [x] 6.1 Create `src/ui/inert-outside.ts`, exporting
  `inertOutside(panel, keep): () => void` per D6 over a minimal structural element type. In
  `src/app/(resident)/casting/detail-sheet.tsx`, replace the `#casting-board` marking with it,
  keeping the backdrop. Never inert `next-route-announcer` or an `[aria-live]` element. Update the comment in `src/app/(resident)/casting/layout.tsx` that says
  only the board is marked.
- [x] 6.2 Create `tests/unit/ui/inert-outside.test.ts` with a fake tree: body → [header(nav),
  main → [board, slot → [backdrop, panel]], memory, next-route-announcer].
  - Header, board and memory become inert; the panel, its ancestors, the backdrop and the
    announcer do not.
  - The restore removes exactly what was set: an element that was inert before stays inert.

  Breaks, each seen failing:
  - mark only the panel's direct siblings;
  - restore by removing `inert` from every sibling;
  - inert the announcer too.
- [x] 6.3 Create `src/ui/card-keys.ts` with `overlayOpen(doc)` and `escapeClosesCard(key, doc)`
  (D7), with no React import. `detail-sheet.tsx` uses `escapeClosesCard` in its handler.
  `src/app/(resident)/casting/swipe-to-board.tsx` adds a window keydown handler that calls
  `router.replace(href)` when it is true.
- [x] 6.4 Create `tests/unit/ui/card-keys.test.ts`:
  - Escape with no open popover or dialog → true;
  - with `dialog[open]` → false;
  - with `:popover-open` → false;
  - another key → false.

  Break: drop the `dialog[open]` selector. The dialog case must fail.

## 7. Verify and walkthrough

- [x] 7.1 Run `npm run verify` (eslint, tsc, the guardrail lints, check-refs, vitest against
  `flatmate-io-dev`) and fix until green. `pending-feedback.ts` must pass: the confirm uses
  `SubmitButton`, and no new `page.tsx` is added.
- [ ] 7.2 (Partly done, 2026-10-13: the human confirmed changing and withdrawing a rating; the human chose to archive with the remaining checks open: Tab trap, Escape on the full page, back from the pass, stale refusal.) Browser walkthrough on localhost, as a demo resident (seed credentials, never a real
  password). It is done by the reviewer (Opus), not the applier. Check:
  - change a rating on the sheet: the card, the board score and the Start banner agree;
  - the same check on the full page;
  - withdraw → confirm → the pass, with this card waiting; back → the board, never the card;
  - with a second session (another resident): a withdrawal below quorum shows the row as unscored;
  - cancel, and Escape in the confirm dialog: the sheet stays open;
  - Tab never leaves the sheet (header and nav unreachable);
  - Escape on the full page → the board of the round;
  - a stale refusal: invite the candidate as a moderator in a second tab, then change the rating
    in the first.
