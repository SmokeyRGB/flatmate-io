## Purpose

What a vote is at the data level: one rating per application, resident and voting stage, and the
refusals that hold however the vote is written — through the application, or by SQL under the
application's database role. Sources: `docs/domain/deliberation.md` §2.3 (`Vote`),
`docs/backlog/requirements/F4-requirements.md` FR-4.11–4.15, C-4.5, G-D15, G-C7.

## ADDED Requirements

### Requirement: At most one vote per application, resident and stage

A resident profile SHALL hold at most one vote per application per voting stage. Rating an
application again in the same stage SHALL replace the earlier value in the same record, set its
change time, and clear a withdrawal mark if one is set. The screening pass is the `invite` stage.
Values SHALL be exactly `no`, `rather_not`, `good`, `definitely`. Sources: C-4.5 (*"At most one
rating per `(application, resident profile, voting stage)`"*), FR-4.11, AC-4.7, AC-4.10, EC-4.6.

#### Scenario: Rating the same application twice
- **WHEN** a resident rates an application `good` and then `no`
- **THEN** exactly one vote of theirs exists on that application at `invite`, its value is `no`,
  and its change time is later than its creation time

#### Scenario: Two devices at once
- **WHEN** the same resident's two ratings of one application arrive concurrently
- **THEN** exactly one vote exists afterwards and it holds the value of the write that committed
  last

#### Scenario: A fifth value
- **WHEN** a vote with a value outside the four is written, through the application or by direct SQL
- **THEN** it is refused

#### Scenario: A vote persists without a submit step
- **WHEN** a resident rates one application and their session ends
- **THEN** the vote is still recorded when they return (AC-4.11)

### Requirement: The database refuses a vote the rules do not allow, whoever writes it

Every write of a vote SHALL be refused, through the application and by SQL under the application's
database role alike, when:
- the round is not `open` — the refusal names the round's state;
- the voter has no active participation in that round with the right to vote, or their resident
  profile is not active;
- the application does not exist in the vote's household, or belongs to a different round than
  the vote names;
- the application is not in `new` or `screened`;
- the application is linked to the voter's own profile;
- the vote is written for another resident profile than the session's own.

Votes already recorded when a round is paused or closed SHALL stand. Sources: FR-4.15, AC-4.13,
AC-4.14, FR-4.2/4.3 (database half, F-13), EC-4.4, EC-4.5, EC-4.7.

#### Scenario: Paused, closed or archived
- **WHEN** a resident rates in a round that is `paused`, `closed` or `archived`
- **THEN** the vote is refused with a reason naming that state, and no vote is written or changed

#### Scenario: No right to vote
- **WHEN** a resident whose participation in the round has `can_vote` false rates
- **THEN** the vote is refused as not eligible

#### Scenario: Removed from the round
- **WHEN** a resident whose participation was removed rates
- **THEN** the vote is refused as not eligible

#### Scenario: Own application, by direct SQL
- **WHEN** a vote on an application linked to the voter's own profile is inserted by SQL under the
  application role
- **THEN** the database rejects it

#### Scenario: Cross-round pairing
- **WHEN** a vote names a round other than the application's own, or an application of another
  household
- **THEN** the database rejects it

#### Scenario: Voting as someone else
- **WHEN** a vote naming another resident profile is inserted, or another resident's vote is
  updated, by SQL under the application role
- **THEN** the insert is rejected and the update changes no row

#### Scenario: A voted application is moved to another round
- **WHEN** an application that holds votes is moved to another round or household, by any path
  including SQL under the application role
- **THEN** the move is rejected, and the same move of an application without votes is not

#### Scenario: Recorded votes survive a pause
- **WHEN** a round with recorded votes is paused
- **THEN** every recorded vote is unchanged

### Requirement: No vote is visible or writable without a resident profile

A session without a resident profile SHALL NOT be able to read, count, insert or update any vote —
neither through the application nor by SQL under the application role, including a pooled session
whose profile setting reads as the empty string. The household account SHALL be refused a vote
before any query runs, with an error naming the missing profile. Sources: G-D15 (*"weder Zeilen
noch Aggregate"*), FR-1.7/AC-1.5.

#### Scenario: Counting votes without a profile
- **WHEN** a household with votes is queried with `count(*)` over the vote table by SQL under the
  application role, without a resident profile
- **THEN** the count is zero

#### Scenario: The household account rates
- **WHEN** a household-account session casts a vote
- **THEN** it is refused as requiring a resident profile, and no query is issued

### Requirement: Votes are isolated by household

A session SHALL NOT read or write another household's votes, through the application or by SQL
under the application role. Source: G-C7, ADR-004.

#### Scenario: Another household's votes
- **WHEN** a resident session counts votes by direct SQL while another household holds votes
- **THEN** only its own household's votes are counted

### Requirement: The vote record carries no derived weight

A vote SHALL store its value, never a weight. The weight SHALL always be derived from the round's
frozen rules. Source: `docs/domain/deliberation.md` §2.3 (*"nie gespeichert, damit
Gewichtsänderungen nachvollziehbar bleiben"*).

#### Scenario: Inspecting a vote
- **WHEN** a vote record is inspected
- **THEN** it holds a value and no weight
