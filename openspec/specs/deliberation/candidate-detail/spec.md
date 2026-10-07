# deliberation/candidate-detail Specification

## Purpose
The candidate detail (screen D2): one application of the viewer's round, opened from the
scoreboard. It shows how that candidate's score came about (distribution, arithmetic,
participation) under the same visibility rules as the scoreboard. When the household opted in, it
also shows who cast which vote.
## Requirements
### Requirement: The detail re-reads everything under the scoreboard's rules

The candidate detail SHALL take nothing from the scoreboard's response. It SHALL read the
application, its votes and the round's frozen rules again, on the server. It SHALL apply the same
participant rule (V-2), own-application rule (V-1, FR-5.29/5.30), counted-voter rule and
hidden-results rule (V-4) as the scoreboard, so that the detail and the scoreboard always agree on:
- whether a candidate is visible;
- its score;
- its vote count;
- whether it has reached quorum.

Only a viewer holding the stored `vote` permission SHALL be served. Sources: FR-5.5, FR-5.29,
FR-5.30, `screens/D-casting-tab.md` D2 (*„übernimmt nichts ungeprüft aus D1"*), human decision Q-9.

#### Scenario: Same numbers as the scoreboard
- **WHEN** a viewer opens the detail of a candidate the scoreboard shows with 55 points from 4 votes
- **THEN** the detail shows 55 points from 4 votes

#### Scenario: The round's rules are broken
- **WHEN** the round's frozen rules cannot be read
- **THEN** the detail is refused with the same message as the scoreboard, and nothing about the
  candidate is shown

### Requirement: One refusal for every candidate the viewer may not open

The detail SHALL refuse with one and the same answer, which names nothing about the application,
when the requested application:
- is the viewer's own (linked to the viewer's profile);
- does not exist, or the id is malformed;
- belongs to another household;
- belongs to a round in which the viewer is not an active, voting participant;
- is in a state the scoreboard does not hold (spec `deliberation/ranking`, „Which applications the
  scoreboard holds").

An application out of the running (`rejected_by_household`, `declined_by_applicant`,
`withdrawn`) SHALL open like any other, with its full card: its results are visible, because no
vote can be cast on it any more (human decision 2026-10-07, full card). A round that is not `open` or `paused` SHALL be refused as the scoreboard refuses it.
Sources: FR-5.29, FR-5.30, human decisions Q-9, Q-4 (as amended 2026-10-07), EC-4.3.

#### Scenario: Own application
- **WHEN** a resident opens the detail address of the application linked to their own profile
- **THEN** they get the same refusal as for an id that does not exist, regardless of the round's
  state, the application's state, the hide setting and the authorship setting

#### Scenario: A rejected application opens
- **WHEN** a participant opens the detail of an application in `rejected_by_household`
- **THEN** its detail is shown with its state, and with its results whether or not the participant
  voted on it

#### Scenario: A state the scoreboard does not hold
- **WHEN** a participant opens the detail of an application in `offer_made`
- **THEN** they get the same refusal as for an id that does not exist

#### Scenario: Not a participant
- **WHEN** a resident who takes no part in the round opens the detail of one of its applications
- **THEN** they get the same refusal

#### Scenario: Another household
- **WHEN** a resident opens the detail address of another household's application
- **THEN** they get the same refusal

### Requirement: A candidate whose results are hidden shows only how to vote

When the viewer's results for a candidate are hidden (V-4), the detail SHALL show only:
- the applicant's name and state;
- the explanation that results appear after their own vote;
- the way to vote.

It SHALL carry no score, no count, no distribution, no participation figure and no name of a voter.
Sources: `screens/D-casting-tab.md` D2 (state „Eigene Stimme zu diesem Kandidaten fehlt"), PRD
§4.1.6, AC-5.16.

#### Scenario: Not yet voted
- **WHEN** hiding is on and a viewer opens the detail of a `new` candidate they have not voted on
- **THEN** the detail names the candidate and its state, explains that results appear after their
  own vote, offers the way to vote, and carries no vote-derived value

### Requirement: What a candidate at quorum shows

For a visible candidate with a score, the detail SHALL show:
1. The application's card content (name, age, message, attributes), with no contact detail and no
   collection source.
2. Its state.
3. The ring with its score, and „aus {n} Stimmen".
4. The distribution: the count of counted votes per rating, as a bar in the four rating colours,
   in addition to the score and never instead of it.
5. The distribution's text equivalent, naming every rating with its count, so that a screen reader
   gets all of it (for example „1× Nein, 0× Eher nicht, 1× Finde gut, 2× Unbedingt").

The bar's segments, the text and any per-rating names SHALL run in the order of the voting buttons,
from „Nein" on the left to „Unbedingt" on the right (human, 2026-10-07).
6. The participation „{n} von {denominator} haben abgestimmt". Both numbers are counted voters, so
   the denominator is the round's current voters, without former members.

Sources: FR-5.20, FR-5.21, FR-5.22, AC-5.20, Q-5, Q-10, PRD §4.1.6.

#### Scenario: Distribution beside the score
- **WHEN** a candidate has two „Unbedingt", one „Finde gut" and one „Nein" from current voters
- **THEN** the detail shows its score, a bar split 1/0/1/2 from „Nein" on the left to „Unbedingt"
  on the right, and the text „1× Nein, 0× Eher nicht, 1× Finde gut, 2× Unbedingt"

#### Scenario: Participation per application
- **WHEN** the round has 7 current voters and 5 of them voted on this candidate
- **THEN** the detail shows „5 von 7 haben abgestimmt"

#### Scenario: No contacts
- **WHEN** an application has an email address and a phone number
- **THEN** neither appears on the detail, nor in what the server sends for it

### Requirement: What a candidate below quorum shows

For a visible candidate without a score, the detail SHALL show its card content and state, the
notice of how many votes are still needed with the real threshold, and „{n} von {denominator} haben
abgestimmt". It SHALL show no ring, no distribution and no rating of any vote. A score from too few
votes is never shown, and neither is the trend it would come from. Sources: FR-5.10 (V1.1),
AC-5.9, AC-5.20 (*„Given a candidate at quorum"*), human decision 2026-10-07.

#### Scenario: One vote, two needed
- **WHEN** a visible candidate has 1 counted vote and 2 are needed
- **THEN** the detail shows that 2 votes are needed and 1 has been cast, „1 von {denominator}
  haben abgestimmt", and no ring, bar or rating

### Requirement: The arithmetic is inspectable on the detail

A „(?)" control on a scored candidate's detail SHALL open, without leaving the screen:
- the round's frozen weight of each rating;
- the number of counted votes;
- the calculation for this candidate: the weights of its counted votes summed, divided by their
  number, divided by the highest weight, times 100, and rounded x.5 up.

The shown result SHALL be exactly the score the ring shows. Where the mean is not a terminating
decimal, the intermediate value SHALL be marked as rounded (≈), and the final score SHALL still be
the exact result of the scoring rule. Sources: FR-5.5, AC-5.6, P-3, `rechenmodelle.md` §8.1.

#### Scenario: Worked arithmetic
- **WHEN** the frozen weights are Nein 0, Eher nicht 1, Finde gut 3, Unbedingt 5, and the
  candidate's counted votes are Nein, Finde gut, Finde gut and Unbedingt
- **THEN** the „(?)" shows „(0 + 3 + 3 + 5) ÷ 4 = 2,75 → 2,75 ÷ 5 × 100 = 55", and the ring shows 55

#### Scenario: A mean that does not terminate
- **WHEN** the counted weights are 3, 3 and 5 out of a highest weight of 5
- **THEN** the mean is shown as „≈ 3,67", and the final number is the ring's score, 73

### Requirement: Votes of former residents are named as removed, never counted

When votes on the candidate were cast by people who are no longer current voters of the round
(moved out, removed, or otherwise not counted), the detail SHALL say „{x} Stimmen entfernt, weil
sie von ehemaligen Bewohnenden stammen". Those votes SHALL appear in no score, count, distribution
or list of names. Without such votes the note SHALL not appear. The note SHALL appear only where
results are visible. Sources: human decisions Q-6 and R-4, FR-5.19 (V1.1).

#### Scenario: A voter moved out
- **WHEN** a candidate has 4 votes, and one of the voters has since moved out
- **THEN** the detail shows the score from 3 votes and „1 Stimme entfernt, weil sie von ehemaligen
  Bewohnenden stammt"

#### Scenario: Back again
- **WHEN** that resident is reactivated
- **THEN** the vote counts again and the note disappears

### Requirement: Voter names appear only when the round's frozen setting allows it

Whether the detail names voters SHALL follow the round's frozen `revealVoteAuthorship`, never the
household's current setting. When the frozen value is off, what the server sends for the detail
SHALL carry no voter identity of any kind, neither ids nor names. When it is on:
- a scored candidate's detail SHALL show, beside the distribution, each counted vote's rating
  together with the voter's display name;
- an unscored candidate's detail SHALL list the display names of the current voters who have voted
  on it, without any rating.

Names SHALL come only from counted votes. A former resident's vote is never named. A hidden
candidate never names anyone. The viewer's own application stays refused whatever the setting
(FR-5.29 takes precedence). The subject-access export is a separate rule and is not touched by the
setting (G-D6). Sources: FR-5.21a, AC-5.21a, human decisions R-1 and 2026-10-07,
`screens/D-casting-tab.md` D2.

#### Scenario: Setting off
- **WHEN** the round's frozen value is off
- **THEN** the detail shows the distribution without names, and the server's response for it holds
  no voter id and no voter name

#### Scenario: Setting on, at quorum
- **WHEN** the round's frozen value is on and Kim voted „Unbedingt" on a scored candidate
- **THEN** the detail shows „Unbedingt" with Kim's name beside the distribution

#### Scenario: Setting on, below quorum
- **WHEN** the round's frozen value is on and Kim and Sam voted on an unscored candidate
- **THEN** the detail lists Kim and Sam as having voted, and shows neither rating

#### Scenario: Setting on, own application
- **WHEN** the round's frozen value is on and a resident opens their own application's detail
- **THEN** they get the refusal for an application that does not exist

#### Scenario: Setting changed after opening
- **WHEN** a round opened with the setting off, and the household turns it on afterwards
- **THEN** that round's details still show no names

#### Scenario: A former resident's vote
- **WHEN** the setting is on and a voter has moved out
- **THEN** that voter's name and rating appear nowhere on the detail

### Requirement: The detail is reached from the scoreboard and leads back to it

Every scored and unscored row of the scoreboard SHALL open that candidate's detail, in „Score", in
„Eingeladen" and in the group of applications out of the running. Rows under „Verdeckt" SHALL not.
The detail SHALL have its own address, carry a way back to the scoreboard of its round, and show a
loading skeleton while its data loads. While anything in an open round awaits the viewer's vote,
the detail SHALL send the viewer to the screening pass, exactly as the scoreboard does. Sources:
`screens/D-casting-tab.md` D1 („Zugriff auf D2"), P-3, human decisions Q-2 and 2026-10-07,
`screens/README.md` §6.

#### Scenario: Opening a row
- **WHEN** a viewer taps a scored row on the scoreboard
- **THEN** that candidate's detail opens, and going back returns to the scoreboard

#### Scenario: A row out of the running
- **WHEN** a viewer opens the collapsed group and taps a withdrawn candidate
- **THEN** that candidate's detail opens

#### Scenario: A vote still awaits
- **WHEN** a viewer with an application awaiting their vote opens a detail address
- **THEN** they are sent to the screening pass

### Requirement: The detail is a card that slides over the scoreboard

When the viewer opens a candidate from the scoreboard, the detail SHALL appear as a card that
slides in from the right over the scoreboard, which stays rendered beneath it. Closing SHALL:
- slide the card out to the right;
- show the scoreboard as it was, at the same scroll position;
- work by the card's close control and by the browser's back navigation alike.

On a touch device the viewer SHALL also be able to close the card by swiping it to the right:
- the card SHALL follow the finger, with the scoreboard visible beneath it, as the screening pass
  shows its neighbouring card;
- releasing past the threshold SHALL close it;
- releasing short of the threshold SHALL return it to its place;
- the threshold and the flick rule SHALL be the same as the screening pass's swipe.

A vertical scroll inside the card SHALL never be taken for a swipe.

When the detail's address is opened directly (a reload, a shared link), it SHALL render as a
full page without the scoreboard beneath. Its close control and a swipe SHALL then lead to the
scoreboard of its round. Under reduced motion the card SHALL appear and disappear without sliding.
Every visibility rule of this spec applies to the card exactly as to the full page, because both
are the same server read. Sources: human decision 2026-10-07 (slide-in card, swipe to close),
P-2 (Geräteneutralität: the close control and back navigation work without a swipe),
`09-Design-System.md` (motion), `screens/D-casting-tab.md` D2.

#### Scenario: Opening slides in
- **WHEN** a viewer taps a row on the scoreboard
- **THEN** the card slides in from the right, and the scoreboard stays rendered beneath it

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

#### Scenario: Reduced motion
- **WHEN** the device asks for reduced motion
- **THEN** the card opens and closes without sliding

