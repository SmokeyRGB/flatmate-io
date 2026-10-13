## ADDED Requirements

### Requirement: The detail shows the viewer's own rating

On a scored or an unscored candidate, the detail SHALL show the viewer's own current rating of that
candidate, named by its label. It SHALL show no other voter's rating beyond what the existing
distribution and authorship rules already allow. A candidate whose results are hidden from the
viewer SHALL still show no rating of any kind, the viewer's own included: the viewer holds none,
because a withdrawn rating does not count as holding one. Sources: `F4-requirements.md` EC-4.12
(„Revising ratings after a pass belongs to D2 (F5)"), FR-4.13, `F5-requirements.md` FR-5.16 V1.1.

#### Scenario: A rated candidate
- **WHEN** a viewer who rated a candidate „Finde gut" opens its detail
- **THEN** the detail shows „Finde gut" as the viewer's own rating

#### Scenario: A hidden candidate stays bare
- **WHEN** the round hides results until one has voted, and the viewer has withdrawn their rating of a candidate
- **THEN** that candidate's detail carries no rating, no score, no distribution and no count

### Requirement: The own rating can be changed or withdrawn only while the vote is open

The detail SHALL offer controls to change the own rating to any of the four ratings, and to
withdraw it, only while the database would accept that write: the round is `open` and the
application is `new` or `screened`. Being a voter of the round, and the application not being
the viewer's own, are already given by the detail being open at all.

When the round is paused, the detail SHALL show the own rating read-only and say that voting is
paused. When the application has left `new`/`screened`, it SHALL show the own rating read-only and
say that the rating is final.

Changing the rating SHALL record it as a revision of the same vote (FR-4.13). Selecting the rating
already held SHALL change nothing. After a change, the detail, the scoreboard and Start SHALL show
the new state. Sources: FR-4.13, EC-5.10 („Permitted"), `invarianten.md` via `vote_guard`.

#### Scenario: Changing a rating
- **WHEN** a viewer on the detail of an invitable candidate changes their rating from „Finde gut" to „Unbedingt"
- **THEN** the detail shows „Unbedingt" as their rating, and the scoreboard's score reflects it

#### Scenario: A paused round
- **WHEN** a viewer opens a candidate's detail while the round is paused
- **THEN** the own rating is shown with no change or withdraw control, and the detail says voting is paused

#### Scenario: An invited candidate
- **WHEN** a viewer opens the detail of a candidate who has been invited
- **THEN** the own rating is shown with no change or withdraw control, and the detail says the rating is final

### Requirement: Withdrawing a rating leads back to the screening pass

Withdrawing SHALL first ask the viewer to confirm. The confirmation SHALL say that the rating is
withdrawn and that the viewer rates this candidate again. On confirmation, the rating SHALL be
recorded as withdrawn, never erased (FR-4.14). The viewer SHALL then be taken to the screening pass,
where this candidate awaits their vote. The rule that anything awaiting the viewer's vote leads to
the pass (human decision Q-2) SHALL apply unchanged. Cancelling the confirmation SHALL change
nothing. Sources: FR-4.14, FR-5.16 V1.1 (F-8), EC-5.12, human decision 2026-10-13.

#### Scenario: Confirming a withdrawal
- **WHEN** a viewer withdraws their rating on a candidate's detail and confirms
- **THEN** the rating is recorded as withdrawn, and the viewer lands in the screening pass with that candidate waiting

#### Scenario: Cancelling a withdrawal
- **WHEN** the viewer cancels the confirmation
- **THEN** the rating stands and the detail stays open

#### Scenario: Escape in the confirmation
- **WHEN** the viewer presses Escape while the confirmation is open on the sliding card
- **THEN** the confirmation closes and the card stays open

#### Scenario: Below quorum after a withdrawal
- **WHEN** a withdrawal takes a scored candidate below quorum
- **THEN** another resident who has rated it sees it on the scoreboard as unscored, with no score shown

#### Scenario: Already withdrawn elsewhere
- **WHEN** the viewer confirms a withdrawal on a card whose rating they already withdrew in another tab
- **THEN** they land in the screening pass with that candidate waiting, as after a fresh withdrawal

#### Scenario: Back from the pass after a withdrawal
- **WHEN** the viewer withdraws on a card opened from the scoreboard, lands in the pass and navigates back
- **THEN** the scoreboard is shown, never the card

### Requirement: A change refused after the card was drawn re-renders the card

The detail is drawn from one read, so its controls can be out of date when the viewer acts. The
candidate may have been invited, the round paused, or the viewer may have moved out. When a change
or a withdrawal is refused for such a reason, the detail SHALL say so in one short sentence and
SHALL re-render in its current state, without the controls the state no longer allows. A refused
action SHALL never look like a success, and SHALL never reveal anything the current state hides.
Sources: `.claude/rules/implementation-hazards.md` (a guarded read and its sibling write), F4
`screening-pass` refusal handling.

#### Scenario: Invited while the card was open
- **WHEN** a moderator invites a candidate while a voter has its detail open, and the voter then changes their rating
- **THEN** the change is refused, the detail says the rating is final, and the card re-renders without controls

#### Scenario: A failure without a reason
- **WHEN** the change fails for a reason that is not a refusal (a lost connection)
- **THEN** the detail says it could not save, the old rating stands, and the controls stay

## MODIFIED Requirements

### Requirement: The detail is a card that slides over the scoreboard

When the viewer opens a candidate from the scoreboard, the detail SHALL appear as a card that
slides in from the right over the scoreboard, which stays rendered beneath it. Closing SHALL:
- slide the card out to the right;
- show the scoreboard as it was, at the same scroll position;
- work by the card's close control and by the browser's back navigation alike.

While the card is open, nothing behind it SHALL be reachable by keyboard focus, pointer or
assistive technology: neither the scoreboard nor the app's header nor its navigation. Escape SHALL
close the card, unless a popover or dialog inside the card is open; then Escape SHALL close only
that.

On a touch device the viewer SHALL also be able to close the card by swiping it to the right:
- the card SHALL follow the finger, with the scoreboard visible beneath it, as the screening pass
  shows its neighbouring card;
- releasing past the threshold SHALL close it;
- releasing short of the threshold SHALL return it to its place;
- the threshold and the flick rule SHALL be the same as the screening pass's swipe.

A vertical scroll inside the card SHALL never be taken for a swipe.

When the detail's address is opened directly (a reload, a shared link), it SHALL render as a
full page without the scoreboard beneath. Its close control, a swipe and Escape SHALL then lead to
the scoreboard of its round. Escape SHALL not do so while a popover or dialog on the page is open.
Under reduced motion the card SHALL appear and disappear without sliding.
Every visibility rule of this spec applies to the card exactly as to the full page, because both
are the same server read. Sources: human decision 2026-10-07 (slide-in card, swipe to close),
human decision 2026-10-13 (whole frame inert, Escape on the full page; PR #62 review),
P-2 (Geräteneutralität: the close control and back navigation work without a swipe),
`09-Design-System.md` (motion), `screens/D-casting-tab.md` D2.

#### Scenario: Opening slides in
- **WHEN** a viewer taps a row on the scoreboard
- **THEN** the card slides in from the right, and the scoreboard stays rendered beneath it

#### Scenario: Nothing behind the card is reachable
- **WHEN** the card is open and the viewer tabs through it
- **THEN** focus never reaches the scoreboard, the header or the navigation

#### Scenario: Closing slides out
- **WHEN** the viewer taps the close control or navigates back
- **THEN** the card slides out to the right, and the scoreboard is shown at the same position

#### Scenario: Swiping away
- **WHEN** a viewer on a phone drags the card to the right past the threshold and lets go
- **THEN** the scoreboard is visible beneath the card during the drag, and the card closes

#### Scenario: A short drag
- **WHEN** the viewer lets go short of the threshold, without a flick
- **THEN** the card returns to its place and stays open

#### Scenario: Scrolling the card
- **WHEN** the viewer scrolls the card vertically
- **THEN** the card does not move sideways and does not close

#### Scenario: A shared link
- **WHEN** the detail's address is opened directly
- **THEN** it renders as a full page, and closing it leads to the round's scoreboard

#### Scenario: Escape on the full page
- **WHEN** the viewer presses Escape on the full-page detail with no popover or dialog open
- **THEN** they are taken to the scoreboard of its round

#### Scenario: Reduced motion
- **WHEN** the device asks for reduced motion
- **THEN** the card opens and closes without sliding
