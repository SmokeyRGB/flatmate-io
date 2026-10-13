## Why

After the screening pass a resident can no longer change or withdraw a rating anywhere in the UI:
the pass only shows unrated cards, and F4 handed the job to the detail card. `docs/backlog/requirements/F4-requirements.md`
EC-4.12: *"Revising ratings after a pass belongs to D2 (F5); screen C1's decision of 2026-09-15 is
not to advertise it in the pass"*. F4 change 2 (`vote-withdrawal-and-audit`, #64) shipped the
repository half (`withdrawVote`, `castVote` classifying `vote.revised`). Its design names this
change for the UI: *"Any withdraw UI. That is F5 change 4, on D2."* This change adds that UI.

It serves:
- **FR-4.13**: *"A resident shall be able to change a previously given rating while the round is
  `open` and within the same voting stage."* Its V1.1 note says *"Before F5, changing a rating is
  reached by going back within a running pass."*
- **FR-4.14**: *"Withdrawing a rating shall be recorded as a withdrawal, not by removing the
  record."*
- **EC-5.10**: *"A resident changes a vote after seeing the result | Permitted."*
- **EC-5.12**: *"a vote is withdrawn and it falls below [quorum] | It moves back into the waiting
  section, and its rank and score stop being shown"*.
- **FR-5.16 V1.1**: *"a withdrawn vote does not count as having voted, so withdrawing hides the
  candidate again, F-8"*.

(The F5 plan listed "FR-5.9 (revise part)" here. FR-5.9 is "Quorum shall be display only", which
is a mis-citation, so it is not cited.)

## What Changes

- **The viewer's own rating on the detail card.** Scored and unscored candidates show "Deine
  Bewertung: …".
  - While the vote can still change (round `open`, application `new`/`screened`), the card offers:
    - the four ratings, through the screening pass's rating bar;
    - „Bewertung zurückziehen".
  - Otherwise it shows the rating read-only, with the reason (the round is paused, or the
    candidate has left the vote).
- **Changing a rating** writes through the existing `castVote`. The card, the scoreboard and Start
  then show the new state.
- **Withdrawing a rating** (human decision 2026-10-13):
  1. A confirm dialog says the rating is withdrawn and the viewer rates again.
  2. The rating is withdrawn through the existing `withdrawVote`.
  3. The viewer goes straight to the screening pass, where this candidate now waits.

  The rule "anything awaiting your vote sends you to the pass" (Q-2) stays unchanged. Withdrawing
  therefore means "decide again", never "abstain".
- **A refusal after a stale render.** The card may show controls while the vote was already closed
  elsewhere: invited by a moderator, round paused, viewer moved out. The action then returns a
  coded refusal, and the card re-renders in its current state with a short message. Nothing fails
  silently.
- **Accessibility gaps from PR #62** (human decision 2026-10-13 to fix them here):
  - While the sliding card is open, the whole frame behind it is inert, header and bottom nav
    included, not only the scoreboard.
  - On the full-page card, Escape leads to the scoreboard of its round, as the close control does.
- **Docs.** `docs/screens/D-casting-tab.md` D2 *Kernelemente* gains the own-rating line, citing
  EC-4.12.
- No migration, no new write path, no new read path. The detail read gains the own rating and
  whether it can still change, from the read it already makes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deliberation/candidate-detail`: new requirements:
  - the card shows the viewer's own rating;
  - it offers change and withdraw only while the vote is open;
  - a withdrawal leads to the pass;
  - a stale refusal re-renders the card.

  Modified: the slide-over requirement, which now makes the whole frame inert and adds Escape on
  the full page.

**Descoped (human, 2026-10-13):** browsing between candidates on the card (pull past the card's
end, ‹ › links, arrow keys) was folded in, then dropped as a nice-to-have before any browse code
was built. It is parked as an F5 follow-up.

## Impact

- **Repository.** `src/modules/deliberation/repository.ts`: `getCandidateDetail` returns the
  viewer's own rating and whether it can still change. It takes both from `readRoundTallyTx`,
  which it already runs. No new query, and visibility code unchanged.
- **Actions.** Two new server actions beside the detail view, one per write. Each revalidates
  `/casting`, `/casting/candidate/<id>` and `/dashboard`.
- **The pass.** `castVoteAction` stays
  untouched: it deliberately revalidates nothing, because FR-4.4 keeps the deck fixed.
- **UI.**
  - The card body (`candidate-detail-body.tsx`).
  - The rating bar moves out of `screening-deck.tsx` into its own file, because it now has two
    users.
  - `detail-sheet.tsx` (inert frame), `swipe-to-board.tsx` / the full page (Escape).
- **Tests.**
  - The detail integration test (own rating, `canChange`).
  - Two action tests in the `invite-action.test.ts` shape.
  - Card render unit tests.
  - The authorization matrix is unchanged: no repository mutator is added.
- **Guardrails touched.**
  - G-C (visibility): the detail payload gains only the viewer's own rating, never another
    voter's. A hidden candidate still carries no vote-derived field (V-4, AC-5.16).
  - G-D: no guarded test changes.
  - G-L: none.
- **Assumptions.**
  - The card registers no digit-key shortcuts. Only the pass has them, so nothing can fire twice.
  - The own rating appears only where the card is visible. A hidden card means the viewer holds no
    rating, so there is nothing to show.
