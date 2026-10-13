## MODIFIED Requirements

### Requirement: Rating everything is acknowledged

When three conditions hold, Start SHALL lead the standing with a celebratory banner
acknowledging that the resident has rated every application:
- the resident may vote in an open round;
- that round still has applications open for voting (`new`/`screened`, not the resident's own);
- none of them awaits the resident's vote.

The banner is the top band of the standing card itself, edge to edge with a divider beneath, with
the scoreboard highlight's look: a heading in the brand colour, one line of body text, no icon, and
the same slow sand-coloured drift as the highlighted rows, never a terracotta tint; under reduced
motion it is the plain accent (human, walkthrough 2026-10-13). It SHALL be worded about the resident's own part and the household's
progress, never about an applicant, speed, a value or a count. It SHALL NOT point to results or to
revising.

It SHALL not appear in any other empty state: not when the round has no application open for
voting, not when the resident does not take part, and not for the household account. An awaiting
count the viewer was refused counts as unknown, never as zero. Such a count has no entry for the
round, as when the stored `vote` permission was removed. Only an explicit 0 is acknowledged. A
withdrawn vote does not count as rated. Sources: `screens/B-start.md` B1 (*„Entschieden
(2026-09-15): der Moment nach der letzten eigenen Stimme wird anerkannt, nicht nur gemeldet."*),
P-O-04 (wording open), human decisions 2026-09-30 and 2026-10-06, C-10.

#### Scenario: Last card rated
- **WHEN** the resident has rated every application open for voting in the round and returns to
  Start
- **THEN** the banner leads the standing, with the heading „Stark gemacht — du hast für alle
  Bewerbungen gevotet!" and the body „Damit bringst du eure WG ein gutes Stück näher an die
  Entscheidung."

#### Scenario: Nothing to rate yet
- **WHEN** the round has no application in `new` or `screened` other than the resident's own
- **THEN** no acknowledgement is shown, only the standing

#### Scenario: Something still waits
- **WHEN** an application still awaits the resident's vote
- **THEN** the vote task is shown, and no acknowledgement

#### Scenario: A withdrawal takes it away
- **WHEN** the resident had rated everything and then withdraws one of their votes
- **THEN** Start shows the vote task again, and no acknowledgement

#### Scenario: The awaiting count was refused
- **WHEN** the round is open for voting but the viewer's awaiting count for it is unknown (the
  stored `vote` permission was removed, so the count has no entry for the round)
- **THEN** no acknowledgement is shown, only the standing
