# tooling/demo-household Specification

## Purpose
The Demo-WG on the shared development database can be reset at any time to a state that shows the
product's core flow: signing in or claiming a profile, rating in the screening pass, and reading
the scoreboard. Synthetic data only (G-B1), never production.
## Requirements
### Requirement: Cleanup then seed always yields a showable flow

Running the demo cleanup (as the database owner) followed by the demo seed SHALL, on a database
with no demo household, produce a household in which:
- at least four residents take part in an open round, so that quorum needs at least two votes;
- one prepared, unclaimed profile has a bound join link;
- the round covers exactly two `open` rooms;
- realistic synthetic applications exist;
- the other residents' votes were cast through the same write path the app uses.

After the presenting resident (a resident who cast none of the seeded votes, such as Sam, or Robin
after claiming) completes the pass, whatever they rated, the scoreboard SHALL show:
- at least three scored rows, because the other residents' votes on them already reach quorum;
- at least one unscored row, because no one else voted on it;
- one `invited` row under „Eingeladen", with its score (it left voting, so it is revealed to
  everyone, human decision 2026-10-06).

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
  scoreboard shows the rows listed above

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

### Requirement: The demo household can be reset in place

Resetting the demo (the reset SQL as the database owner, then the demo round seed) SHALL keep the
existing demo household: its id, its sign-in code, its accounts, profiles, memberships, join links
and settings. It SHALL delete only the household's votes, applications, round participations,
rounds and rooms, and recreate them, through the app's own write paths, in the showable state the
fresh seed produces. Residents the seed needs that are missing SHALL be added, and residents that
exist SHALL be reused. The round seed SHALL refuse to run while the household still has a round,
and SHALL stop with a message naming the resident whose sign-in failed. It SHALL print the number
of voters and the quorum, and warn when the seeded votes plus one presenter vote cannot reach it.
Source: human decision 2026-10-06.

#### Scenario: Reset keeps the household
- **WHEN** the reset SQL and then the demo round seed run on the existing demo household
- **THEN** the household id and sign-in code are unchanged, every resident can still sign in with
  their password, and the Casting tab shows the fresh round

#### Scenario: Reset twice
- **WHEN** the reset and the round seed run a second time
- **THEN** no resident is duplicated and the same showable state results

#### Scenario: A round still exists
- **WHEN** the round seed runs without the reset first
- **THEN** it refuses and changes nothing

