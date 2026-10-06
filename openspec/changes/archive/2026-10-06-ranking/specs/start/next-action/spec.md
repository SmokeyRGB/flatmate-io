## MODIFIED Requirements

### Requirement: Nothing open means the round's standing, never a blank

When the resident has no open task, Start SHALL show the round's standing in place of the task
card, and SHALL never show an empty surface. The standing is the actual distribution of the
round's applications by state; it SHALL not name a single phase for the round, because every
application has its own standing (one may be invited while others are still being decided). Side
states do not count, and a round with no main-path application reads "Warten auf Bewerbungen".
With no open round, Start SHALL say that no round is running. Sources: FR-2.23, AC-2.15, EC-2.3,
EC-2.12; `screens/B-start.md` B1 (*„Rundenstand aus §3 füllt die Fläche — nie leer"*);
`rahmenwerk.md` §3.1; human decision 2026-10-06 (no phase label on Start).

#### Scenario: Everything done
- **WHEN** the resident has no open task and a round is open
- **THEN** the round's distribution by state is displayed, and no phase name such as
  „Terminfindung" is

#### Scenario: No round
- **WHEN** no round is open
- **THEN** Start says that no round is running, and the surface is not empty

#### Scenario: A round runs without the resident
- **WHEN** a round is open but the resident does not take part in it
- **THEN** Start says that a round is running without them, shows no number derived from its
  applications, and does not say that no round is running

#### Scenario: Only side states
- **WHEN** every application of the open round is in a side state
- **THEN** the standing reads as waiting for applications

## ADDED Requirements

### Requirement: Rating everything is acknowledged

When the resident may vote in an open round, that round still has applications open for voting
(`new`/`screened`, not the resident's own), and none of them awaits the resident's vote, Start
SHALL lead the standing with a short acknowledgement that the resident has rated every
application, worded about the resident's own part and never about an applicant. It SHALL not
appear in any other empty state: not when the round has no application open for voting, not when
the resident does not take part, and not for the household account. Sources: `screens/B-start.md`
B1 (*„Entschieden (2026-09-15): der Moment nach der letzten eigenen Stimme wird anerkannt, nicht
nur gemeldet."*), P-O-04 (wording open), human decision 2026-10-06.

#### Scenario: Last card rated
- **WHEN** the resident has rated every application open for voting in the round and returns to
  Start
- **THEN** the acknowledgement „Stark gemacht — du hast alle Bewerbungen bewertet!" leads the
  standing

#### Scenario: Nothing to rate yet
- **WHEN** the round has no application in `new` or `screened` other than the resident's own
- **THEN** no acknowledgement is shown, only the standing

#### Scenario: Something still waits
- **WHEN** an application still awaits the resident's vote
- **THEN** the vote task is shown, and no acknowledgement
