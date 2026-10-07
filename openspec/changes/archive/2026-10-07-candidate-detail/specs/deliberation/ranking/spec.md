## RENAMED Requirements

- FROM: `### Requirement: Three groups: Score, Eingeladen, Verdeckt`
- TO: `### Requirement: Four groups: Score, Eingeladen, out of the running, Verdeckt`

## MODIFIED Requirements

### Requirement: The rules are the round's frozen rules, and broken rules refuse the ranking

The weights, the quorum share, the hide-results flag and the vote-authorship flag SHALL be read
from the round's snapshot taken when it opened, never from the household's current settings. The
ranking SHALL be refused with a stated reason, and never computed with fallback values, when any of
these holds:
- the weights lack a rating, carry an extra key, or hold a value that is not a finite number ≥ 0;
- every weight is zero;
- the quorum share is not a number with 0 < share ≤ 1;
- the hide flag is not a boolean;
- the authorship flag is present and not a boolean.

A snapshot with no authorship flag at all SHALL be read as „off". Such a round opened before the
setting existed, so „off" is what was in force when it opened. It is not a fallback value. Sources:
FR-5.4, C-5.2, AC-5.5, EC-5.5, EC-5.6, F-1, F-3, human decisions Q-7 and R-1, FR-5.21a.

#### Scenario: Weights changed while the round is open
- **WHEN** a round opened while "Like" was worth 3, and the household then sets "Like" to 4
- **THEN** the round's scores still use 3 (AC-5.5)

#### Scenario: Quorum share and hiding changed while the round is open
- **WHEN** the household changes the quorum share or turns hiding off after the round opened
- **THEN** the round's quorum judgement and hiding still follow the values frozen at opening

#### Scenario: All weights zero
- **WHEN** the round's frozen weights are all zero
- **THEN** the ranking is refused with the message that the round's rules cannot be read, and no
  candidate is shown (EC-5.6)

#### Scenario: Quorum share out of range
- **WHEN** the round's frozen quorum share is 0, above 1, or not a number
- **THEN** the ranking is refused in the same way

#### Scenario: A round opened before the authorship setting existed
- **WHEN** a round's snapshot has no authorship flag
- **THEN** the ranking is computed as usual, and the round counts as authorship „off"

#### Scenario: A malformed authorship flag
- **WHEN** a round's snapshot holds the authorship flag as a string
- **THEN** the ranking is refused in the same way

### Requirement: Which applications the scoreboard holds

The scoreboard SHALL hold the round's applications in `new`, `screened` and `invited`, and the
applications that are out of the running: `rejected_by_household`, `declined_by_applicant` and
`withdrawn`. An application in any other state SHALL not appear:
- `archived` marks data at the end of its retention (`domain/zustandsmaschinen.md`), so it leaves
  the scoreboard;
- `scheduled`, `interviewed`, `offer_made` and `moved_in` are not reachable in v0.1;
- deletion is F3 change 4's (EC-5.9).

The viewer's own application is excluded in every state (requirement below). Sources: FR-5.22,
human decision Q-4 as amended by the human on 2026-10-07 („A rejected application should still be
visible in the round, and scoreboard, until deleted", and `archived` excluded); FR-5.23 is served
by O4 (F3).

#### Scenario: A rejected application
- **WHEN** an application in the round is `rejected_by_household`
- **THEN** it appears in the group of applications out of the running, with its state named

#### Scenario: Every end state
- **WHEN** applications in the round are `withdrawn` and `declined_by_applicant`
- **THEN** each appears in that same group, with its own state named

#### Scenario: An archived application
- **WHEN** an application in the round is `archived`
- **THEN** it does not appear on the scoreboard

#### Scenario: An invited application
- **WHEN** an application in the round is `invited`
- **THEN** it appears in the group „Eingeladen", not among the applications still being decided

### Requirement: The rules are inspectable from the scoreboard

A „(?)" control on the scoreboard SHALL open, without leaving the screen:
- the round's frozen weight of each rating;
- the formula: the mean of the weights of the counted votes, divided by the highest weight, times
  100, with x.5 rounded up;
- the quorum rule with the round's actual numbers („{needed} von {denominator} Stimmen reichen").

The per-candidate arithmetic SHALL be on the candidate detail (spec
`deliberation/candidate-detail`), which every scored and unscored row opens. Sources: PRD §4.1.6
(*„Die Score-Formel und die Stufenwerte sind aus der Rangliste heraus einsehbar (P-3)"*), P-3,
C-5.16, FR-5.5.

#### Scenario: Looking up the rules
- **WHEN** the viewer taps „(?)" on the scoreboard
- **THEN** the four frozen weights, the formula and the round's quorum threshold are shown

#### Scenario: From a row to its arithmetic
- **WHEN** the viewer taps a scored row
- **THEN** that candidate's detail opens, and its „(?)" shows the candidate's own calculation

### Requirement: The scoreboard has its four states

The scoreboard SHALL show a loading skeleton while its data loads. When the round has no visible
candidate at all, in any group, it SHALL show an empty state naming the round, without inventing a
list. When the rules are broken, it SHALL show a refusal naming that the round's rules cannot be
read. When the viewer may not see the round, it SHALL show a refusal that names neither the round
nor any count. Sources: `screens/README.md` §6 (G-N6), F-23, EC-5.2, EC-5.5.

#### Scenario: Empty round
- **WHEN** the round the viewer takes part in has no application other than their own in any state
  the scoreboard holds
- **THEN** the empty state is shown, the same as for a round with no applications at all

#### Scenario: Only applications out of the running
- **WHEN** every application of the round other than the viewer's own is out of the running
- **THEN** the scoreboard shows that group, collapsed, and not the empty state

### Requirement: Four groups: Score, Eingeladen, out of the running, Verdeckt

The visible candidates SHALL be shown in up to four groups, in this order, each with its heading,
and a group with no row SHALL not be shown:
1. **„Score"**: the candidates still being decided (`new`/`screened`). Scored rows come first,
   in the order above. Each SHALL show a circular progress-ring score with the number inside and
   „aus x Stimmen" beside it, and nothing else about the result. There is no rank number and no
   distribution. Unscored rows (below quorum) follow at the bottom, oldest application first. Each
   SHALL show no score and no ring, only the notice naming the real threshold: „Noch kein Score
   — für ein faires Bild braucht es mindestens {needed} Stimmen (bisher {n})."
2. **„Eingeladen"**: the `invited` candidates, with the same row shapes (ring at quorum, the
   notice below it), scored rows first in the order above, then unscored oldest first. This group
   may later become its own tab.
3. **„Ausgeblendet"**, the applications out of the running (`rejected_by_household`,
   `declined_by_applicant`, `withdrawn`).
   - Same row shapes and order as „Eingeladen", and each row names its state.
   - The group is **collapsed by default**. Its heading shows the number of rows and opens it.
   - Its results are visible to every participant, because no vote can be cast on these
     applications any more.
   - None of its rows carries „Einladen" or takes a highlight slot.
4. **„Verdeckt"**: the hidden candidates (requirement above).

A falling vote count SHALL move a candidate from scored back to unscored within its group. The ring
SHALL carry a text equivalent „{score} von 100 Punkten, aus {n} Stimmen". No text on the screen,
including the third group's heading, SHALL make an evaluative statement about a person. Sources:
FR-5.10 (V1.1), AC-5.9 (V1.1), C-5.16, AC-5.28, EC-5.2, EC-5.3, EC-5.12, human decisions Q-3,
Q-10, R-5, R-6, 2026-10-06 (the „Eingeladen" group) and 2026-10-07 (the collapsed group of
applications out of the running); amends PRD §4.1.6's separate „Warten auf Stimmen" section and
`rechenmodelle.md` §8.3's pending sort.

#### Scenario: Below quorum
- **WHEN** a visible candidate in `new` has 1 counted vote and 2 are needed
- **THEN** it sits at the bottom of „Score" with „Noch kein Score — für ein faires Bild
  braucht es mindestens 2 Stimmen (bisher 1)." and no ring (AC-5.9)

#### Scenario: Everyone below quorum
- **WHEN** no visible candidate has reached quorum
- **THEN** every row is unscored, oldest first within its group, and no placeholder order is
  invented (EC-5.2)

#### Scenario: No votes at all
- **WHEN** no candidate has any vote and hiding is off
- **THEN** all are unscored rows with „(bisher 0)" (EC-5.3)

#### Scenario: An invited candidate
- **WHEN** a candidate at quorum is `invited`
- **THEN** it is shown with its ring under „Eingeladen" and not under „Score"

#### Scenario: A rejected candidate
- **WHEN** a candidate at quorum is `rejected_by_household`
- **THEN** it is in the collapsed group below „Eingeladen", with its ring and its state named,
  without „Einladen" and without a highlight

#### Scenario: Not yet voted, then rejected
- **WHEN** hiding is on, the viewer never voted on a candidate, and the candidate is withdrawn
- **THEN** its results are visible to the viewer in the collapsed group, as for an invited one

#### Scenario: Reopened
- **WHEN** that withdrawn candidate is reopened to `new`, and the viewer still has not voted on it
- **THEN** its results are hidden from the viewer again, under „Verdeckt"
