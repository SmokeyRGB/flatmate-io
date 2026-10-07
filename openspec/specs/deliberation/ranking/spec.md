# deliberation/ranking Specification

## Purpose
The ranking (screen D1): a round's votes become a score, a quorum judgement and a deterministic
order that each resident sees only for candidates they have voted on, never for their own
application. Sources: `docs/backlog/requirements/F5-requirements.md` (V1.1),
`docs/domain/rechenmodelle.md` §8.1/§8.3, `docs/domain/invarianten.md` §5.1–5.4,
`docs/screens/D-casting-tab.md` D1, `docs/03-PRD.md` §4.1.6.
## Requirements
### Requirement: The score is a mean scaled to 0–100, and no votes is not zero

A candidate's score SHALL be computed from its counted votes at the `invite` stage as
`round_half_up(mean / max(weights) × 100)`. The mean is the sum of the frozen weight of each
counted vote, divided by the number of counted votes. `round_half_up` SHALL round x.5 up, and SHALL
be computed exactly, so that no floating-point error moves a result across a .5 boundary. A
candidate with no counted votes SHALL have no score (`NO_SCORE`), a value distinct from `0` in
every layer, and SHALL never be shown as a numeral. Sources: FR-5.1, FR-5.2, FR-5.3, C-5.1, C-5.3,
`rechenmodelle.md` §8.1 (*„kein Score, keine 0 — das ist nicht dasselbe"*), F-25.

#### Scenario: Worked example
- **WHEN** a candidate has the counted votes No, Like, Like, Must have under the default weights
- **THEN** its score is 55 (AC-5.1)

#### Scenario: One "Must have"
- **WHEN** a candidate's only counted vote is "Must have"
- **THEN** its score is 100 (AC-5.2)

#### Scenario: One "No"
- **WHEN** a candidate's only counted vote is "No"
- **THEN** its score is 0, and this is a real score distinct from no score (AC-5.3)

#### Scenario: No votes
- **WHEN** a candidate has no counted votes
- **THEN** it has no score, and nothing on the screen shows a numeral for it (AC-5.4)

#### Scenario: Exactly on .5
- **WHEN** the scaled mean is exactly 54.5
- **THEN** the score is 55, not 54

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

### Requirement: Only votes of current residents count

A vote SHALL count (in the score, in the quorum numerator and in the vote count shown) only while
its voter belongs to the round's quorum denominator. The denominator is the voters with an
active participation in the round (not removed from it) with the right to vote, whose resident
profile is `active`. A vote by someone who has moved out or been removed SHALL leave the score,
the numerator and the denominator together. It SHALL count again if that person becomes an active
participant again. Nothing about this SHALL be stored; it is derived on every read. Sources:
FR-5.8 (V1.1), EC-5.14 (V1.1), G-D2, F-11, F-13, human decisions Q-6 and R-4 (2026-10-05, overriding
SRD S-32's „bleibt die abgegebene Stimme im Score").

#### Scenario: A voter moves out during the round
- **WHEN** one of four counted voters on a candidate moves out
- **THEN** the candidate's score, vote count and quorum numerator are computed from the other
  three, and the denominator shrinks by one

#### Scenario: A removed member
- **WHEN** a voter's profile is removed from the household
- **THEN** their vote counts nowhere, exactly as for a move-out

#### Scenario: Back again
- **WHEN** that voter's profile is active again and holds an active participation in the round
- **THEN** their vote counts again

### Requirement: Quorum is at least the share of current voters, and only a display

A candidate SHALL reach quorum when its counted votes are at least
`ceil(quorum_share × denominator)`: at the default 0.5, 7 voters require 4 and 6 require 3. Quorum
SHALL decide only where a candidate is shown. No state transition SHALL be prevented, delayed or
triggered by it. A round whose denominator is zero SHALL be refused with a stated reason. Sources:
FR-5.6, FR-5.7, FR-5.9, C-5.5, C-5.6, EC-5.7, G-D2.

#### Scenario: Odd denominator
- **WHEN** 7 voters count and a candidate has 3 counted votes, then 4
- **THEN** quorum is not reached at 3 and is reached at 4 (AC-5.7)

#### Scenario: Even denominator
- **WHEN** 6 voters count and a candidate has 3 counted votes
- **THEN** quorum is reached (AC-5.8)

#### Scenario: One enthusiastic vote
- **WHEN** a candidate's only counted vote is "Must have" and 7 voters count
- **THEN** it is shown without a score, as below quorum (EC-5.1)

### Requirement: A total, deterministic order for scored candidates

Candidates at quorum SHALL be ordered by these keys, ascending:
1. the veto penalty, constant 0 in this release but kept in the order;
2. the score, descending;
3. the number of "Must have" votes, descending;
4. the number of "No" votes, ascending;
5. the number of counted votes, descending;
6. the application's creation time;
7. the application id.

The keys SHALL be applied in this sequence, with no other key. Two reads of unchanged data
SHALL return the same order. Sources: FR-5.11, FR-5.12, FR-5.13, C-5.7, C-5.8, EC-5.13,
`rechenmodelle.md` §8.3.

#### Scenario: Equal score, more "Must have"
- **WHEN** two candidates at quorum have equal scores and one has more "Must have" votes
- **THEN** that one is placed higher (AC-5.11)

#### Scenario: Then fewer "No"
- **WHEN** they are also equal in "Must have" votes and one has fewer "No" votes
- **THEN** that one is placed higher (AC-5.12)

#### Scenario: Then a broader base
- **WHEN** they are also equal in "No" votes and one has more counted votes
- **THEN** that one is placed higher (AC-5.13)

#### Scenario: Identical on every key but the id
- **WHEN** two candidates are identical on keys 1–6
- **THEN** the order follows the id and is the same on every read (AC-5.14)

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

### Requirement: Only a participant of the round sees its ranking

The ranking of a round SHALL be returned only to a resident who holds an active participation
with the right to vote in that round, whose profile is `active`, and who holds the `vote`
permission. A round chosen by address that the viewer does not take part in, or a malformed
address, SHALL get the same refusal, naming no title and no count. A round in `draft`, `closed`
or `archived` SHALL be refused with its state named. A profile-less session (the household
account) SHALL get no ranking value of any kind. Without an address, the newest `open` or
`paused` round in which the viewer takes part SHALL be shown, and when there is none, the empty
state. Sources: V-2 (`invarianten.md` §5.2), G-D15, F-12 (no close
path yet), plan decision "D1 on `/casting`".

#### Scenario: Not a participant
- **WHEN** a resident of the household who does not take part in a round opens its ranking by
  address
- **THEN** they are refused, and no title, name, score or count of that round is shown

#### Scenario: The household account
- **WHEN** the household account requests the ranking directly
- **THEN** no row and no number derived from applications or votes is returned

#### Scenario: A paused round
- **WHEN** the round the viewer takes part in is `paused`
- **THEN** its ranking is shown

### Requirement: The viewer's own application does not exist on the scoreboard

An application linked to any resident profile of the viewer's account SHALL be absent from every
list and every count on the scoreboard. It SHALL not leave a placeholder or a gap, and it SHALL
not take a highlight slot. This SHALL hold in every round state and whatever the hide setting.
A scoreboard emptied by it SHALL show the same empty state as any other empty scoreboard, never a
reason that implies a hidden entry. It SHALL stay ranked for everyone else. Sources: FR-5.29,
FR-5.30, AC-5.24, AC-5.25, AC-5.27 (repository half), EC-5.11 (V1.1, F-5), V-1 (`invarianten.md`
§5.1), `rahmenwerk.md` §6, human decision Q-9.

#### Scenario: Own application with four votes
- **WHEN** the viewer's own application has four counted votes and is at quorum
- **THEN** it is absent from the viewer's scoreboard, and no score, count or position derived from
  it is in the response (AC-5.27)

#### Scenario: Independent of state and setting
- **WHEN** the round is paused, or hiding is off
- **THEN** the own application is still absent

#### Scenario: Others still see it
- **WHEN** another resident of the round opens the scoreboard
- **THEN** the application appears for them in its place

### Requirement: Results are hidden per candidate until the viewer's own vote, while voting on it is still possible

While the round's frozen hide flag is on, a candidate's score, vote count, quorum state, position
and highlight SHALL be withheld from a viewer who holds no non-withdrawn `invite` vote on it, as
long as the candidate is still in `new` or `screened`. Once a candidate has left those states
(for example `invited`), nobody can vote on it any more, so there is nothing left to anchor, and its
results SHALL be shown to every participant whether or not they voted. A paused round does not
reveal anything: voting resumes with it. Withheld values SHALL be withheld before data reaches the
client: the hidden entry SHALL carry no result field at all, not an empty one. A hidden candidate
SHALL still be listed by name in the group „Verdeckt", greyed, with an eye-off mark and the notice
„Verdeckt — du hast hier nicht abgestimmt", oldest application first and never in an order
derived from votes. Casting a vote SHALL reveal that candidate on the next read, and withdrawing it
SHALL hide it again. Votes at another stage SHALL reveal nothing. While anything in an open round
awaits the viewer's vote, the Casting tab leads to the pass instead (capability
`ui/resident-frame`), so the group „Verdeckt" is a fallback that normally stays empty. Sources:
FR-5.15–5.19, FR-5.19a (V1.1: met by the redirect), C-5.9, EC-5.4, EC-5.10, F-7, F-8, V-4
(`invarianten.md` §5.4, amended V1.1), human decisions Q-2, Q-3 and 2026-10-06 (replacing R-7's
"hidden for good").

#### Scenario: Not yet voted
- **WHEN** hiding is on and the viewer has not voted on a candidate in `new` or `screened`
- **THEN** the candidate is listed in „Verdeckt", greyed, with its name and the notice, and with no
  score, count or position (AC-5.15)

#### Scenario: Requested directly
- **WHEN** the data behind the scoreboard is requested directly under the same conditions
- **THEN** the hidden entry holds only its id, name and state (AC-5.16)

#### Scenario: Voting reveals
- **WHEN** the viewer then casts a vote on that candidate
- **THEN** the next read shows the candidate's results (AC-5.17)

#### Scenario: Per candidate
- **WHEN** the viewer has voted on A but not on B, both still open for voting
- **THEN** A's results are shown and B is hidden (AC-5.18)

#### Scenario: Another stage
- **WHEN** the viewer's only vote on a candidate is at a stage other than `invite`
- **THEN** the candidate stays hidden (AC-5.19)

#### Scenario: Withdrawn
- **WHEN** the viewer's vote on a candidate is withdrawn
- **THEN** the candidate is hidden again (EC-5.12)

#### Scenario: Invited before the viewer voted
- **WHEN** a candidate moved to `invited` before the viewer voted on it
- **THEN** its results are shown to the viewer in the group „Eingeladen"

#### Scenario: Paused round
- **WHEN** the round is paused and the viewer has not voted on a candidate in `new`
- **THEN** the candidate stays hidden

#### Scenario: Hiding off
- **WHEN** the round's frozen hide flag is off
- **THEN** every candidate's results are shown, whether or not the viewer voted

### Requirement: The top rows by score, as many as there are open rooms, are highlighted

The first N scored rows of the group „Score" SHALL carry a faint, slowly drifting background
highlight. N is the number of the round's rooms that are `open` and not deleted, read at request
time. A tie at the boundary SHALL be decided by the order above, so exactly min(N, scored rows in
„Score") rows are highlighted. Rows under „Eingeladen" or „Verdeckt" and unscored rows SHALL
never take a slot. The highlight SHALL be visual only: no word about the person, a text equivalent
naming the real threshold („Unter den {N} höchsten Scores — {N} Zimmer frei"), no movement of
layout or of any control. Under reduced motion it SHALL be a static tint. With N = 0 nothing is
highlighted. Under the round's title the screen SHALL name N and what it means („2 Zimmer frei — die 2
höchsten Scores sind hervorgehoben"; with N = 0 „Kein Zimmer frei in dieser Runde"), so the
highlight explains itself (human walkthrough 2026-10-06). Sources: human decisions R-6 and Q-15 (2026-10-05), C-5.16, AC-5.28.

#### Scenario: Two open rooms
- **WHEN** the round covers two `open` rooms and four rows of „Score" are scored
- **THEN** exactly the first two scored rows are highlighted

#### Scenario: A room is put on hold
- **WHEN** one of those rooms is put `on_hold`
- **THEN** only the first scored row is highlighted on the next read

#### Scenario: Fewer scored rows than rooms
- **WHEN** two rooms are open and one row of „Score" is scored
- **THEN** only that row is highlighted

#### Scenario: Invited rows take no slot
- **WHEN** two rooms are open and the highest score belongs to an `invited` candidate
- **THEN** the first two scored rows of „Score" are highlighted, and the invited row is not

#### Scenario: The open rooms are named
- **WHEN** the round covers two `open` rooms
- **THEN** „2 Zimmer frei — die 2 höchsten Scores sind hervorgehoben" appears under the round's title

#### Scenario: Reduced motion
- **WHEN** the device asks for reduced motion
- **THEN** the highlighted rows carry a static tint and nothing moves

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

### Requirement: Rows still being decided carry „Einladen" for those who may invite

For a viewer whose live membership holds `change_application_state`, every row of the „Score" group
SHALL carry „Einladen", which starts the invitation (spec `casting/invitation`). This applies to
scored and unscored rows alike, because quorum blocks nothing (FR-5.28). No row of „Eingeladen" or
„Verdeckt" SHALL carry it. For any other viewer, no row SHALL carry it. The button SHALL change
nothing about which rows the viewer sees, their order, their score or the highlight. After an
invitation the candidate SHALL appear under „Eingeladen", with its results visible to every
participant, by the existing rules. Sources: FR-5.24, FR-5.28, AC-5.10, human decision 2026-10-06
(„Einladen" on the scoreboard row).

#### Scenario: A moderator sees the button on decided rows
- **WHEN** a moderator opens a scoreboard with one scored and one unscored row under „Score"
- **THEN** both rows carry „Einladen"

#### Scenario: A plain resident sees none
- **WHEN** a resident without `change_application_state` opens the same scoreboard
- **THEN** no row carries „Einladen", and the rows, their order and their scores are the same as
  the moderator's

#### Scenario: After inviting
- **WHEN** a moderator confirms „Eingeladen!" on a row under „Score"
- **THEN** the scoreboard shows that candidate under „Eingeladen" without „Einladen", and the
  candidates left under „Score" keep their order

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

