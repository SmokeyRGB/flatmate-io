## Purpose

The Demo-WG on the shared development database can be reset at any time to a state that shows the
product's core flow: signing in or claiming a profile, rating in the screening pass, and reading
the scoreboard. Synthetic data only (G-B1), never production.

## ADDED Requirements

### Requirement: Cleanup then seed always yields a showable flow

Running the demo cleanup (as the database owner) followed by the demo seed SHALL, on a database
with no demo household, produce a household in which:
- at least four residents take part in an open round, so that quorum needs at least two votes;
- one prepared, unclaimed profile has a bound join link;
- the round covers exactly two `open` rooms;
- realistic synthetic applications exist;
- the other residents' votes were cast through the same write path the app uses.

After the presenting resident completes the pass, whatever they rated, the scoreboard SHALL show:
- at least three scored rows, because the other residents' votes on them already reach quorum;
- at least one unscored row, because no one else voted on it;
- one `invited` row hidden from the presenter, with the notice that they cannot vote on it.

This SHALL hold also when the prepared profile is claimed before the pass, which adds one voter
to the round.

The seed SHALL print the sign-in details (including the household's sign-in code), the links and
what to show, without printing any applicant data. Sources: human decision Q-12 (2026-10-05),
G-B1.

#### Scenario: Reset twice
- **WHEN** the cleanup and then the seed are run, and then both are run again
- **THEN** the second run succeeds as well and yields the same showable state under a new
  household id

#### Scenario: The presenter's pass
- **WHEN** the presenting resident signs in after the seed
- **THEN** the Casting tab takes them to the pass with a full deck, and after the last card the
  scoreboard shows scored, unscored and hidden rows as listed above

### Requirement: The cleanup removes every demo row

The demo cleanup SHALL delete every household-scoped row of the demo household, from every table
any module declares, and the household's authentication users. The one exception is
`activity_event`, which is append-only and stays as a tombstone. The cleanup SHALL refuse to run
as the application's runtime role. Sources: `.claude/rules/implementation-hazards.md` "Migrations"
(no foreign keys, nothing cascades); FR-0.13; `06-Compliance-Anhang.md` §5.6.

#### Scenario: After cleanup
- **WHEN** the cleanup has run
- **THEN** no row with the demo household's id remains in any table except `activity_event`, and
  its Auth users are gone
