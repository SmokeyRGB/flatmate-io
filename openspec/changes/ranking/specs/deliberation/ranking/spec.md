## Purpose

The ranking (screen D1): a round's votes become a score, a quorum judgement and a deterministic
order that each resident sees only for candidates they have voted on, never for their own
application. Sources: `docs/backlog/requirements/F5-requirements.md` (V1.1),
`docs/domain/rechenmodelle.md` §8.1/§8.3, `docs/domain/invarianten.md` §5.1–5.4,
`docs/screens/D-casting-tab.md` D1, `docs/03-PRD.md` §4.1.6.

## ADDED Requirements

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

The weights, the quorum share and the hide-results flag SHALL be read from the round's snapshot
taken when it opened, never from the household's current settings. The ranking SHALL be refused
with a stated reason, and never computed with fallback values, when any of these holds:
- the weights lack a rating, carry an extra key, or hold a value that is not a finite number ≥ 0;
- every weight is zero;
- the quorum share is not a number with 0 < share ≤ 1;
- the hide flag is not a boolean.

Sources: FR-5.4, C-5.2, AC-5.5, EC-5.5, EC-5.6, F-1, F-3, human decision Q-7.

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

The scoreboard SHALL hold the round's applications in `new`, `screened` and `invited`. An
`invited` one SHALL carry its state as a label. Applications in any other state SHALL not appear.
Sources: FR-5.22, human decision Q-4; FR-5.23 is served by O4 (F3).

#### Scenario: A rejected application
- **WHEN** an application in the round is `rejected_by_household` or `withdrawn`
- **THEN** it does not appear on the scoreboard

#### Scenario: An invited application
- **WHEN** an application in the round is `invited` and its results are visible to the viewer
- **THEN** it appears in its place with the label for its state

### Requirement: Only a participant of the round sees its ranking

The ranking of a round SHALL be returned only to a resident who holds an active participation
with the right to vote in that round, whose profile is `active`, and who holds the `vote`
permission. A round chosen by address that the viewer does not take part in, or a malformed
address, SHALL get the same refusal, naming no title and no count. A round in `draft`, `closed`
or `archived` SHALL be refused with its state named. A profile-less session (the household
account) SHALL get no ranking value of any kind. Without an address, the newest round in which
the viewer takes part SHALL be shown. Sources: V-2 (`invarianten.md` §5.2), G-D15, F-12 (no close
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

### Requirement: Results are hidden per candidate until the viewer's own vote

While the round's frozen hide flag is on, a candidate's score, vote count, quorum state, position
and highlight SHALL be withheld from a viewer who holds no non-withdrawn `invite` vote on it. They
SHALL be withheld before data reaches the client: the hidden entry SHALL carry no result field at
all, not an empty one. A hidden candidate SHALL still be listed by name, below the scoreboard,
greyed, with an eye-off mark. Its notice SHALL read „Verdeckt, bis du selbst abgestimmt hast"
while the viewer can still vote on it. When the viewer can no longer vote on it (round not open,
or the application no longer `new`/`screened`), the notice SHALL read „Verdeckt — du hast hier
nicht abgestimmt". Casting a vote SHALL reveal that candidate on the next read, and withdrawing it
SHALL hide it again. Votes at another stage SHALL reveal nothing. Sources: FR-5.15–5.19, C-5.9,
EC-5.4, EC-5.10, F-7, F-8, V-4 (`invarianten.md` §5.4), human decisions Q-3 and R-7.

#### Scenario: Not yet voted
- **WHEN** hiding is on and the viewer has not voted on a candidate
- **THEN** the candidate is listed below the scoreboard, greyed, with its name and the notice, and
  with no score, count or position (AC-5.15)

#### Scenario: Requested directly
- **WHEN** the data behind the scoreboard is requested directly under the same conditions
- **THEN** the hidden entry holds only its id, name, state and whether the viewer can still vote
  (AC-5.16)

#### Scenario: Voting reveals
- **WHEN** the viewer then casts a vote on that candidate
- **THEN** the next read shows the candidate's results (AC-5.17)

#### Scenario: Per candidate
- **WHEN** the viewer has voted on A but not on B
- **THEN** A's results are shown and B is hidden (AC-5.18)

#### Scenario: Another stage
- **WHEN** the viewer's only vote on a candidate is at a stage other than `invite`
- **THEN** the candidate stays hidden (AC-5.19)

#### Scenario: Withdrawn
- **WHEN** the viewer's vote on a candidate is withdrawn
- **THEN** the candidate is hidden again (EC-5.12)

#### Scenario: Can no longer vote
- **WHEN** a candidate moved to `invited` before the viewer voted on it
- **THEN** it stays hidden with the notice „Verdeckt — du hast hier nicht abgestimmt"

#### Scenario: Hiding off
- **WHEN** the round's frozen hide flag is off
- **THEN** every candidate's results are shown, whether or not the viewer voted

### Requirement: One scoreboard: scored rows, then unscored rows

The visible candidates SHALL form one list:
- **Scored rows** come first, in the order above. Each SHALL show a circular progress-ring score
  with the number inside and „aus x Stimmen" beside it, and nothing else about the result. There
  is no rank number and no distribution.
- **Unscored rows** (below quorum) follow at the bottom, oldest application first. Each SHALL show
  no score and no ring, only the notice naming the real threshold: „Noch kein Punktwert — für ein
  faires Bild braucht es mindestens {needed} Stimmen (bisher {n})."

A falling vote count SHALL move a candidate from scored back to unscored. The ring SHALL carry a
text equivalent „{score} von 100 Punkten, aus {n} Stimmen". No text on the screen SHALL make an
evaluative statement about a person. Sources: FR-5.10 (V1.1), AC-5.9 (V1.1), C-5.16, AC-5.28,
EC-5.2, EC-5.3, EC-5.12, human decisions Q-3, Q-10, R-5, R-6; amends PRD §4.1.6's separate
„Warten auf Stimmen" section and `rechenmodelle.md` §8.3's pending sort.

#### Scenario: Below quorum
- **WHEN** a visible candidate has 1 counted vote and 2 are needed
- **THEN** it sits at the bottom of the scoreboard with „Noch kein Punktwert — für ein faires Bild
  braucht es mindestens 2 Stimmen (bisher 1)." and no ring (AC-5.9)

#### Scenario: Everyone below quorum
- **WHEN** no visible candidate has reached quorum
- **THEN** every row is unscored, oldest first, and no placeholder order is invented (EC-5.2)

#### Scenario: No votes at all
- **WHEN** no candidate has any vote and hiding is off
- **THEN** all are unscored rows with „(bisher 0)" (EC-5.3)

### Requirement: The top rows by score, as many as there are open rooms, are highlighted

The first N scored rows SHALL carry a faint, slowly drifting background highlight. N is the number
of the round's rooms that are `open` and not deleted, read at request time. A tie at the boundary
SHALL be decided by the order above, so exactly min(N, scored rows) rows are highlighted. Unscored
and hidden rows SHALL never take a slot. The highlight SHALL be visual only: no word about the
person, a text equivalent naming the real threshold („Unter den {N} höchsten Punktwerten —
{N} Zimmer frei"), no movement of layout or of any control. Under reduced motion it SHALL be a
static tint. With N = 0 nothing is highlighted. Sources: human decisions R-6 and Q-15
(2026-10-05), C-5.16, AC-5.28.

#### Scenario: Two open rooms
- **WHEN** the round covers two `open` rooms and four rows are scored
- **THEN** exactly the first two scored rows are highlighted

#### Scenario: A room is promised
- **WHEN** one of those rooms becomes `promised`
- **THEN** only the first scored row is highlighted on the next read

#### Scenario: Fewer scored rows than rooms
- **WHEN** two rooms are open and one row is scored
- **THEN** only that row is highlighted

#### Scenario: Reduced motion
- **WHEN** the device asks for reduced motion
- **THEN** the highlighted rows carry a static tint and nothing moves

### Requirement: The rules are inspectable from the scoreboard

A „(?)" control on the scoreboard SHALL open, without leaving the screen, the round's frozen weight
of each rating, the formula (mean of the weights of the counted votes, divided by the highest
weight, times 100, x.5 rounded up), and the quorum rule with the round's actual numbers
(„{needed} von {denominator} Stimmen reichen"). The per-candidate arithmetic belongs to the
candidate detail (FR-5.5, plan change 2). Sources: PRD §4.1.6 (*„Die Score-Formel und die
Stufenwerte sind aus der Rangliste heraus einsehbar (P-3)"*), P-3, C-5.16.

#### Scenario: Looking up the rules
- **WHEN** the viewer taps „(?)" on the scoreboard
- **THEN** the four frozen weights, the formula and the round's quorum threshold are shown

### Requirement: The hidden-results hint is bound to the viewer's progress

A screen-level hint SHALL appear above the scoreboard only while at least one application in the
round awaits the viewer's vote, by the same definition the pass and Start use. It SHALL state how
many, with one action into the pass. It SHALL disappear entirely once nothing awaits the viewer,
and SHALL never be a static subtitle. Sources: FR-5.19a, AC-5.19a, F-10, `D-casting-tab.md` D1
„Eigene Stimme fehlt".

#### Scenario: Last vote cast
- **WHEN** the viewer has just cast their last remaining vote in the round
- **THEN** no hidden-results hint is shown anywhere on the scoreboard (AC-5.19a)

#### Scenario: Something still waits
- **WHEN** two applications of the round still await the viewer's vote
- **THEN** the hint names 2 and offers „Jetzt bewerten" into the pass

### Requirement: The scoreboard has its four states

The scoreboard SHALL show a loading skeleton while its data loads. When the round has no visible
candidate at all, it SHALL show an empty state naming the round, without inventing a list. When
the rules are broken, it SHALL show a refusal naming that the round's rules cannot be read. When
the viewer may not see the round, it SHALL show a refusal that names neither the round nor any
count. Sources: `screens/README.md` §6 (G-N6), F-23, EC-5.2, EC-5.5.

#### Scenario: Empty round
- **WHEN** the round the viewer takes part in has no application in `new`, `screened` or
  `invited` other than their own
- **THEN** the empty state is shown, the same as for a round with no applications at all
