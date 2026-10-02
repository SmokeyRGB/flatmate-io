# deliberation/screening-pass Specification

## Purpose
The screening pass (screen C1): an eligible resident works through a round's applications that
await their vote, one card at a time, giving each one of four ratings whose frozen weights can be
looked up on the screen. Sources: `docs/backlog/requirements/F4-requirements.md` (V1.1),
`docs/screens/C-beteiligung.md` C1, `docs/03-PRD.md` §4.1.4.
## Requirements
### Requirement: The deck holds exactly what awaits the resident's vote

For an open round in which the resident has an active participation with the right to vote, the
deck SHALL be exactly the round's applications in `new` or `screened` that are not linked to the
resident's own profile and that the resident has not yet rated at the `invite` stage (a withdrawn
vote counts as not rated). The own application SHALL be excluded by the read itself, before data
reaches the client. The deck SHALL be ordered oldest first, the same for every resident. Sources:
FR-4.1, FR-4.2, FR-4.3, F-1 (V1.1), Q-7.

#### Scenario: Five open applications
- **WHEN** an open round holds five applications in `new`/`screened`, none the resident's own and
  none rated by them
- **THEN** the deck is exactly those five, oldest first (AC-4.1)

#### Scenario: Own application requested directly
- **WHEN** the read behind the pass is invoked directly for a resident whose own application is in
  the round
- **THEN** that application is not returned (AC-4.3)

#### Scenario: Already rated
- **WHEN** the resident has rated two of five applications in an earlier pass
- **THEN** a new pass holds the other three

#### Scenario: Other states
- **WHEN** the round also holds applications in `invited`, `rejected_by_household` or any later
  state
- **THEN** none of them is in the deck

### Requirement: Only an eligible resident gets a deck

The pass SHALL be refused, and no application data returned, for a session without a resident
profile, a resident with no active participation in the round, a participation without the right
to vote, a resident profile that is not active, and a round that is not `open` (the refusal names
the state). A household member who does not take part in the round SHALL be shown nothing about
the round. Sources: FR-4.15, EC-4.3 (V1.1, F-9), V-2 (`domain/invarianten.md` §5), human decision
Q-1.

#### Scenario: Not a participant
- **WHEN** a resident without a participation in the round opens the pass for it
- **THEN** it is refused and no card, count or title of that round is shown

#### Scenario: Participation without vote
- **WHEN** a resident whose participation has `can_vote` false opens the pass
- **THEN** it is refused and no card is returned

#### Scenario: Round not open
- **WHEN** the pass is opened for a round that is `paused`
- **THEN** it is refused with a message naming the paused state

### Requirement: The deck is fixed when the pass starts

The composition of a running pass SHALL NOT change when applications are captured during it. A
pass started later SHALL include them. Starting the screen again starts a new pass. Sources:
FR-4.4, AC-4.4, AC-4.5.

#### Scenario: A sixth application arrives
- **WHEN** a moderator captures a sixth application while the resident is on card 2 of five
- **THEN** the running pass still holds five cards, and the next pass includes the sixth

### Requirement: A card shows the applicant, never their contact

Each card SHALL show the applicant's name, age if captured, their message if captured, and their
captured attributes, and SHALL NOT show or receive email, phone or other contact details. A card
SHALL NOT show other residents' votes, a points budget, a counter of favourites, or any hint or
warning about the resident's ratings. Sources: FR-4.7 (V1.1, F-5), human decision Q-2 (Art. 5(1)(c)),
F-19, EC-4.8, EC-4.9, C-4.11.

#### Scenario: A card with contact details captured
- **WHEN** an application with email and phone details is existing
- **THEN** neither contact detail is on the screen nor in the data sent to the client during screening

#### Scenario: Every rating is "Unbedingt"
- **WHEN** a resident rates every card `definitely`
- **THEN** no prompt, warning or favourites step appears (AC-4.19)

### Requirement: Four ratings in a fixed order, told apart without colour

Each card SHALL offer exactly four ratings, in this order: `no` „Nein", `rather_not` „Eher nicht",
`good` „Finde gut", `definitely` „Unbedingt". Each SHALL carry a symbol and a text label, so that no
level is distinguished by colour alone. The buttons SHALL show no point numbers. „Unbedingt" SHALL
be the favourite; no separate favourite step exists. The ratings SHALL be operable by keyboard.
The buttons SHALL be side by side in a single row at the bottom of the screen on mobile.
They SHALL be colour-coded as a scale from red („Nein") to green („Unbedingt"), in addition to,
never instead of, symbol and label, with readable contrast in every state (human decision
2026-09-30).
Sources: FR-4.8, AC-4.7 (V1.1, F-12), FR-4.16, F-17, PRD §4.1.4, human decision Q-3.

#### Scenario: Enumerating the options
- **WHEN** a card's rating options are enumerated
- **THEN** exactly four exist, in the order above, each with symbol and label and without a number

### Requirement: The round's frozen weights are one tap away

A small „(?)" control on the pass SHALL open an explanation of the weights of each rating
taken from the round's frozen rules, and the sentence that the step between „Eher nicht" and
„Finde gut" is the large one. The weights SHALL come from the round's snapshot taken at opening,
never from the household's current settings. When the frozen weights are missing or malformed,
the pass SHALL be refused instead of falling back to defaults. Sources: FR-4.9, FR-4.10, AC-4.8
(V1.1, F-11), AC-4.9, EC-4.11, C-4.3, C-4.4, P-3.

#### Scenario: Looking up the weights
- **WHEN** the resident taps „(?)"
- **THEN** a explanation pop-over opens explaining the weights of the four options.

#### Scenario: Settings changed after opening
- **WHEN** the household's weight for `good` is changed to 4 through the audited override while the
  round is open
- **THEN** the pass still shows 3 for „Finde gut" (AC-4.9)

#### Scenario: Malformed snapshot
- **WHEN** the round's frozen weights lack a key or hold a non-numeric value
- **THEN** the pass is refused with a message, and no card is shown

### Requirement: Rating records at once and moves on

Tapping a rating SHALL record it immediately, without a submit step for the pass. While it is being
recorded, the tapped button SHALL show that it is working and further taps SHALL be ignored. Once
recorded, the pass SHALL move to the next card. A round that is no longer open, or a voter no
longer eligible, SHALL end the pass with a message naming the reason. An application that no
longer exists, has left the voting stage meanwhile, or turns out to be the resident's own SHALL be
dropped from the remaining deck without ending the pass, because it can never be rated. Any other
failure SHALL leave the card in place with a calm message that nothing was lost. While a rating is
being recorded, the pass SHALL NOT move. Sources: FR-4.12, FR-4.5 (the hook; deletion itself is F3
change 4), EC-4.4, EC-4.5, `ui/pending-feedback`, `docs/09-Design-System.md` feedback states.

#### Scenario: A tap
- **WHEN** the resident taps „Finde gut" on card 3 of 8
- **THEN** the vote is recorded and card 4 of 8 is shown

#### Scenario: The round was paused meanwhile
- **WHEN** the resident taps a rating after the round was paused
- **THEN** the vote is refused, the message names the paused state, and earlier votes stand

#### Scenario: A card left the voting stage mid-pass
- **WHEN** a moderator moves card 4 to `invited` while the resident is on it, and the resident taps
  a rating
- **THEN** card 4 leaves the deck, the next card is shown, and the pass can still complete

### Requirement: Going back and forward, never past an unrated card

The resident SHALL be able to go back to any earlier card of the running pass, see their rating
there as selected, and change it (FR-4.13). Forward SHALL be possible only from a rated card, so
no card can be skipped. On a touch screen, a mostly horizontal swipe on the card SHALL move back
(right) or forward (left); a swipe SHALL never rate. A visible back control SHALL exist on every
device: a small chevron on mobile, „Zurück" on desktop, plus the ← and → keys. The pass SHALL NOT
advertise that ratings can be revised. Sources: FR-4.13, AC-4.12, C-4.8, S-09, WCAG 2.5.1, human
decisions Q-5 and its addendum, `screens/C-beteiligung.md` C1 decision 2026-09-15.

#### Scenario: Back and change
- **WHEN** the resident on card 4 goes back to card 3 and taps „Nein"
- **THEN** their vote on card 3 is `no` and card 4 is shown again

#### Scenario: Forward past an unrated card
- **WHEN** the resident swipes left or presses → on a card they have not rated
- **THEN** the card stays

#### Scenario: Vertical scrolling of a long message
- **WHEN** the resident drags mostly vertically over a card with a long message
- **THEN** the message scrolls and the card does not move

### Requirement: The pass shows its progress

The pass SHALL show the current position and the deck's total as a progress bar at the top of
the screen with the text „n von N", both readable by assistive technology. Sources: FR-4.6,
AC-4.16.

#### Scenario: Third of five
- **WHEN** the resident is on the third of five cards
- **THEN** a visual bar on the top shows the process being on 3 out of 5

### Requirement: The deck moves like a deck, and fixed controls never move

Moving forward SHALL slide the current card off and bring the next up from beneath; moving back
SHALL reverse it; while dragging, the card SHALL follow the finger. With reduced motion requested,
the change SHALL be a crossfade. The rating buttons and the progress SHALL never move. Source:
`docs/09-Design-System.md` feedback states; human decision Q-5 addendum.

#### Scenario: The next card is already there
- **WHEN** the current card slides off, forward or back, or is being dragged
- **THEN** the card being revealed beneath is already shown with its content, never as an empty
  placeholder (human decision 2026-09-30)

#### Scenario: The card fills the screen
- **WHEN** a card is shown on a phone
- **THEN** it fills the height between the progress bar and the rating buttons, and a long message
  scrolls inside it

#### Scenario: Reduced motion
- **WHEN** the device requests reduced motion and the resident moves to the next card
- **THEN** the cards crossfade without sliding

### Requirement: Completion leads somewhere and nothing waits

After the last card is rated, the pass SHALL lead to the Casting tab, which shows the ranking's
place (D1) and never an empty surface. Opening the pass with nothing awaiting the resident SHALL
state „Nichts wartet auf dich" rather than show an error — also when the round's only application
is the resident's own. Reopening after completion SHALL show that state; revising after completion
belongs to D2 (F5). Sources: FR-4.17, FR-4.18, AC-4.17, AC-4.18, EC-4.1, EC-4.2, EC-4.12 (V1.1,
F-7), human decisions Q-5 and Q-6.

#### Scenario: The last card
- **WHEN** the resident rates the final card
- **THEN** the Casting tab is shown with the heading „Rangliste"

#### Scenario: Reopening
- **WHEN** the resident opens the pass again after completing it
- **THEN** „Nichts wartet auf dich" is shown

#### Scenario: Only the own application
- **WHEN** the round's only application is linked to the resident's own profile
- **THEN** „Nichts wartet auf dich" is shown, not an error

