## MODIFIED Requirements

### Requirement: Cleanup then seed always yields a showable flow

Running the demo cleanup (as the database owner) followed by the demo seed SHALL, on a database
with no demo household, produce a household in which:
- at least four residents take part in an open round, so that quorum needs at least two votes;
- one prepared, unclaimed profile has a bound join link;
- the round covers exactly two `open` rooms;
- realistic synthetic applications exist;
- the other residents' votes were cast through the same write path the app uses;
- the invited application was invited through the same invitation the app uses, not by separate
  state changes.

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
