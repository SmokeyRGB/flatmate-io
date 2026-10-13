## Context

See proposal.md (Why). What is there today:

- **`getCandidateDetail`** (`src/modules/deliberation/repository.ts`) runs `readRoundTallyTx`, the
  scoreboard's core.
  - That core already reads every non-withdrawn `invite` vote of the round in one statement, the
    viewer's own included, and builds `countedValues`. The viewer is always in the counted set:
    the tally basis is null otherwise, and the read refuses `not_eligible`.
  - The detail returns neither the viewer's rating nor whether it may still change.
- **The writes.**
  - `castVote` and `withdrawVote` (F4 change 2) are the only writers of `vote`. Each takes:
    membership FOR SHARE, then the `vote_guard` chain (round, participation, profile, application,
    all FOR SHARE), then the vote row.
  - Their refusals are `VoteError` codes: `invalid_input`, `not_found`, `round_not_open`
    (+`roundStatus`), `not_eligible`, `not_votable`, `own_application`.
  - `castVoteAction` (`casting/screening/actions.ts`) wraps `castVote` for the pass and
    deliberately revalidates nothing (FR-4.4: the deck is fixed when the pass starts).
  - `withdrawVote` has no action.
- **Frames.** `CandidateDetailView` is one server component for both frames. It redirects to
  `/casting/screening` whenever anything awaits the viewer's vote (Q-2).
  - `CandidateDetailBody` is the pure client render.
  - `DetailSheet` (intercepted route) marks only `#casting-board` inert. `AppHeader`, which
    contains the bottom nav, sits outside that wrapper in `(resident)/layout.tsx`.
  - The full page (`SwipeToBoard`) has no Escape handling.
- **Invite precedent.** `inviteApplicationAction` revalidates `/casting` and
  `/casting/candidate/<id>`. The walkthrough of 2026-10-07 showed that this re-renders an open
  sheet and the board beneath it in place.
- **Tests.** Vitest runs in `node` with no DOM and no testing-library. Client behaviour is
  therefore tested through pure functions and `renderToStaticMarkup`
  (`tests/helpers/render-with-strings`).

## Goals / Non-Goals

**Goals:**
- Change and withdraw the own rating from D2 through the existing repository writers, with the
  card, board and Start in agreement afterwards.
- Make the whole frame inert behind the sheet, and handle Escape on the full page.

**Non-Goals:**
- **Digit-key shortcuts on the card.** Only the pass has them, so nothing can fire twice there.
- **A rating on a hidden card, or an "abstain" state.** Withdrawing means "decide again" (human,
  2026-10-13).
- **The "nach deiner Stimme geändert" marker, the sort toggle, the shared swipe tracker.** These
  belong to change 6.
- **Browsing between candidates on the card.** Folded in and then dropped by the human on
  2026-10-13 as a nice-to-have, before any browse code existed. Parked as an F5 follow-up.
- **Any change to `castVoteAction`, the deck or the redirect rule.**

## Decisions

### D1 · The detail read returns `own`, taken from the tally it already reads

`scored` and `unscored` gain `own: { rating: VoteValue | null; canChange: boolean }`. `hidden` and
`refused` do not change: the existing exact-keys test keeps `hidden` free of any vote-derived field
(V-4).

- `rating` is the viewer's entry in `tally.countedValues.get(applicationId)`, matched on
  `voterId === context.profileId`. It is the same statement and the same snapshot as the score, so
  it can never disagree with it.
- `canChange` is `rating !== null && round.status === "open" && (state === "new" || state === "screened")`.
  - It mirrors `vote_guard` steps 2 and 7.
  - Steps 3 and 4 (an active voter) are already implied, because the tally basis is non-null.
  - Steps 1, 5 and 6 (pairing, not own) are already implied, because the card was found at all.
- `canChange` is only a **hint for the UI**. `vote_guard` stays the one authority (D3). No second
  copy of the rule exists that could refuse a write the database allows: the UI only hides
  controls.
- `rating === null` on a visible card happens in two cases:
  - The candidate left the vote before the viewer rated it. The card says „Du hast nicht
    bewertet".
  - A race with the redirect, which cannot normally render. The card shows nothing about the own
    rating then.

  In neither case are there controls.
- **Alternative rejected:** a separate `getOwnRating` read. It would be a sibling read that has to
  repeat V-1/V-2/V-4 (the `getRoundForSession` vs `getRoundParticipants` hazard), and it could
  disagree with the score it sits beside.

### D2 · Two card actions in `src/app/(resident)/casting/candidate-actions.ts`

- **`changeRatingAction({ roundId, applicationId, value })`** calls `castVote`.
- **`withdrawRatingAction({ applicationId })`** calls `withdrawVote`.
- **Inputs.** Plain-object arguments, like `castVoteAction`, because the caller is a client
  transition and not a form post. The ids are checked as UUIDs before the session is read
  (`invite-actions.ts` precedent). The value is checked by `castVote` (`invalid_input`).
- **Result.** `{ ok: true } | { ok: false; code: VoteErrorCode | "no_session" | "failed"; roundStatus? }`,
  codes only.
  - `ProfileRequiredError` maps to `not_eligible`.
  - Anything else logs only the error's class name and returns `failed` (G-D7).
- **Revalidation.**
  - **Change:** on `ok`, and on every `VoteError` refusal except `invalid_input`, the action
    revalidates `/casting`, `/casting/candidate/<applicationId>` and `/dashboard`. A refusal
    therefore re-renders the card in its current state (spec: stale refusal).
  - **Withdraw:** a refusal revalidates the same way. On `ok` the action revalidates only
    `/casting` and `/dashboard`, never the card the viewer is leaving, and then calls
    `redirect("/casting/screening", RedirectType.replace)`.
  - `failed` and `no_session` revalidate nothing: the state is unknown or unchanged.
- **Withdraw also succeeds when the vote is already withdrawn.** `withdrawVote` refuses
  `not_found` once the vote is withdrawn, for example from a second tab. The action then treats
  that `not_found` as success: the intent is met, and the candidate awaits the viewer (redirect
  as above).
- **Why not `castVoteAction`?** Adding revalidation there would reshuffle the deck mid-pass
  (FR-4.4). A flag on it would give one action two contracts. Two small actions are the honest
  split, and each gets its own action test (#58 lesson).
- **Why a server-side `redirect(…, replace)` for withdraw** (pre-mortem finding 1):
  - Revalidating the card after a withdrawal re-renders `CandidateDetailView`. Its "vote first"
    rule would then call `redirect()` inside the action's own response, and inside a server action
    `redirect` defaults to **push** (Next's redirect API reference).
  - A client `router.replace` on top of that would be a double navigation, and the push would
    leave a back-button trap: pass → card → redirect again.
  - So the action skips the card path on success and redirects with `RedirectType.replace`
    itself. Going back from the pass returns to the board.
  - The `@detail/[...rest]` catch-all renders nothing for `/casting/screening`, so the sheet
    closes.
- **The same rule can fire after a change** (accepted). If a new application starts awaiting the
  viewer while the card is open, revalidating the card after a change re-renders the view, which
  redirects to the pass with the default push. This is rare, it is exactly Q-2's rule, and back
  returns to the card, which redirects again only while something still awaits. It is documented,
  not engineered around.

### D3 · Enforcement paths: nothing new is written, so nothing new is enforced

The card adds no write path, only a second caller of the two existing writers. For the guarded
state (one `vote` row per application, voter and stage, and its value and `withdrawn_at`):

| Path | Where the rule holds |
|---|---|
| Card change / withdraw (new callers) | `castVote`/`withdrawVote`: profile + `vote` permission in TS, then `vote_guard` under lock |
| Pass (`castVoteAction`) | same functions, unchanged |
| Raw SQL as `app_runtime` | `vote_guard` trigger + own-profile RLS INSERT/UPDATE policies (0028) |
| Concurrent second request (two tabs, card + pass) | unique key (application, profile, stage) upsert. Same-voter concurrent misclassification of `cast` vs `revised` is the accepted ponytail ceiling of F4 change 2's design D2 |
| Invite / pause racing a change | `vote_guard` reads the application and round FOR SHARE; invite and pause take them FOR UPDATE. The loser is refused (`not_votable` / `round_not_open`) and the card re-renders (D2) |
| Delete application (F3 change 4, later) | locks the application first; documented lock order in 0028 |

**Every writer of the same state, pairwise:** the writers are `castVote` and `withdrawVote`. Both
lock the same chain in the same order and upsert the same row, so they serialize on the vote row
under the unique key. No new writer exists.

**Relationships the predicates join through:**
- The viewer's `voterId` matches `vote.resident_profile_id` under `membership_resident_pairing`
  (0020) and the one-membership-per-profile/account indexes (0021). D1 adds no new join.

### D4 · The rating bar moves to `src/app/(resident)/casting/rating-bar.tsx`

`RatingBar`, `RATING_CLASS` and `ICONS` move out of `screening-deck.tsx` unchanged, together with
one pure helper, `submittedRating(event): VoteValue | null`: the submitter parse the deck's
`onSubmit` does today. The deck and the card both import them.

- **Justification (SOLID/DRY).** There are two users now. Importing the deck module into the card
  would drag the deck's whole client bundle into every sheet.
- **No new abstraction:** it is a move plus one extracted pure function. Its test moves with it.

### D5 · The card's own-rating section is one client component, `OwnRating`, in `own-rating.tsx`

- **Rendering.**
  - The label „Deine Bewertung", then:
    - with `canChange`, the `RatingBar` with `selected = own.rating`, and a „Bewertung
      zurückziehen" button;
    - otherwise the rating as text, plus the reason (`round.status === "paused"` → paused; state
      left `new`/`screened` → final).
  - It is rendered for both `scored` and `unscored`, above „Einladen".
- **Message state.** Its message state lives in this one component, which renders in every
  `canChange` state. The message therefore survives the re-render that removes the controls.
- **Pure result logic.** The action results go through a pure `ratingOutcome(result)` →
  `{ message?: OutcomeMessage; signIn?: true }`. It is unit-tested in node, because there is no
  DOM environment. A withdraw that succeeds never returns: the action redirects.
  - `ok` → no message (the re-rendered rating is the feedback);
  - `not_votable` → final;
  - `round_not_open` → paused/closed;
  - `not_eligible` / `not_found` → no longer possible;
  - `failed` → could not save;
  - `no_session` → `/sign-in`.
- **Same value.** Selecting the rating already held sends no request (the server no-op exists
  anyway).
- **Withdraw confirmation.** A native `<dialog className="dialog">` opened with `showModal()`, the
  `InviteDialog` pattern. Its confirm control is a `SubmitButton` (`pending-feedback.ts`). The
  sheet's Escape handler already skips `dialog[open]`, which the #62 walkthrough fixed.

### D6 · Inert the frame, not just the board: `inertOutside(panel, keep)`

`DetailSheet`'s effect walks from the panel up to `document.body`. At each level it sets `inert`
on every sibling that does not contain the panel, except the elements in `keep` (the backdrop,
whose click closes the sheet). It returns a restore function that removes `inert` **only** from the
elements it set: a sibling that was already inert stays inert. It never inerts
`next-route-announcer` or an element with `aria-live`: Next's route announcer sits at body level
and is what announces a candidate swap (pre-mortem finding 4). Elements added to the body after the
effect runs, a toast for example, stay reachable. This is accepted: they are transient and outside
the card's focus order.

- This covers `AppHeader` (and the nav inside it), `#casting-board`, `HouseholdCodeMemory` and
  anything a later layout adds, without ids in `_frame/`.
- The function takes a minimal structural type (`parentElement`, `children`, `hasAttribute`,
  `setAttribute`, `removeAttribute`). It can then be tested in node against a fake tree. It lives
  in `src/ui/inert-outside.ts`, the second shared UI helper beside `swipe.ts`.
- **Alternative rejected:** ids on the header and the nav. That couples `_frame/` to one screen
  and misses any future sibling.

### D7 · Escape on the full page; one overlay guard for every key

`src/ui/card-keys.ts` holds the pure key rules for the card, so that `DetailSheet` and
`SwipeToBoard` share one guard:
- `overlayOpen(doc)`: `:popover-open, dialog[open]` exists.
- `escapeClosesCard(key, doc)`: `Escape`, and no overlay is open.

How the frames use it:
- `DetailSheet`'s existing handler uses `escapeClosesCard`, the same rule as today.
- `SwipeToBoard` registers a window keydown handler that calls `router.replace(href)` when it is
  true.

All three are unit-tested with a stub `doc.querySelector` (this was the #62 /code-review
follow-up). The module has no React, so tests can import it.

### D8 · Strings

New keys sit under `casting.detail` in `de.ts` with twins in `en.ts`:
- own-rating label;
- withdraw button;
- confirm heading, body and buttons;
- paused and final reasons;
- „Du hast nicht bewertet";
- the outcome messages.

Draft German copy, to be confirmed in the walkthrough:
- „Deine Bewertung"
- „Bewertung zurückziehen"
- Dialog: „Bewertung zurückziehen?" with „Deine Bewertung wird zurückgezogen, und du bewertest
  {name} neu." and the buttons „Zurückziehen" / „Abbrechen"
- „Die Abstimmung ist pausiert."
- „Die Abstimmung über {name} ist abgeschlossen. Deine Bewertung steht fest."
- Failures apologise in du-tone (memory: German UI error tone), for example „Sorry, das hat nicht
  geklappt. Deine Bewertung ist unverändert."

`strings-parity.test.ts` enforces the twins.

## Risks / Trade-offs

- [The card shows controls the database then refuses] → `canChange` is only a hint. The refusal is
  coded, revalidates, and the card re-renders with the reason. A test covers every refusal code in
  `ratingOutcome`.
- [The revalidation does not re-render an intercepted sheet] → The invite precedent shows it does.
  The walkthrough checks both frames anyway, and the full page after a reload.
- [A withdrawal on a round with `hideResultsUntilVoted` off] → The candidate stays visible
  elsewhere, but it awaits the vote, so the redirect still sends the viewer to the pass. This is
  consistent with Q-2.
- [`inertOutside` leaves something inert after an abnormal unmount] → The restore runs in the
  effect cleanup and touches only what it set. The test asserts that pre-existing `inert` survives.
- [An own rating in the payload leaks with authorship off] → It is the viewer's own vote only,
  never another's. The test asserts that `own.rating` equals the viewer's vote, and that a second
  viewer sees their own value, not the first viewer's.

## Migration Plan

No migration. The dev DB is untouched (it stays at `0036`). Tests write votes on the shared
`flatmate-io-dev`, so they use unique ids per run and teardown in `afterEach`.
