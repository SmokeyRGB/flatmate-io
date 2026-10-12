## MODIFIED Requirements

### Requirement: At most one vote per application, resident and stage

A resident profile SHALL hold at most one vote per application per voting stage. A new rating of
an application in the same stage SHALL replace the earlier value in the same record, set its
change time, and clear the withdrawal mark, if the value differs or the vote was withdrawn. A
rating with the value the record already holds, while it is not withdrawn, SHALL change nothing:
no column of the record and no activity entry. It SHALL still be refused wherever a new vote
would be refused. The screening pass is the `invite` stage. Values SHALL be exactly `no`,
`rather_not`, `good`, `definitely`. Sources: C-4.5 (*"At most one rating per `(application,
resident profile, voting stage)`"*), FR-4.11, FR-4.14 (V1.1), AC-4.7, AC-4.10, EC-4.6.

#### Scenario: Rating the same application twice
- **WHEN** a resident rates an application `good` and then `no`
- **THEN** exactly one vote of theirs exists on that application at `invite`, its value is `no`,
  and its change time is later than its creation time

#### Scenario: The same value again
- **WHEN** a resident rates an application `good` and then `good` again
- **THEN** every column of the record is unchanged, the change time included, and one activity
  entry exists for it

#### Scenario: The same value again in a paused round
- **WHEN** a resident sends the value they already hold again after the round was paused
- **THEN** it is refused with a reason naming the round's state

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

## ADDED Requirements

### Requirement: A withdrawal is recorded, never erased

A resident SHALL be able to withdraw their own live vote on an application. A withdrawal SHALL
mark the record as withdrawn, with the time of withdrawal. It SHALL keep the record, its value and
its creation time. A withdrawn vote SHALL count nowhere a live vote counts (awaiting, reveal,
score, quorum), and the application SHALL await the resident's vote again.

A withdrawal SHALL be refused exactly where a vote would be refused, with the same reasons: the
round is not open, the resident has no right to vote, the profile is not active, the application
is their own, or the application is no longer `new`/`screened`. A withdrawal SHALL be refused as
not found, and change nothing, when the resident holds no live vote on the application, either
none at all or one already withdrawn. A rating after a withdrawal makes the vote live again.
Sources: FR-4.14, AC-4.15, EC-4.7, FR-4.15.

#### Scenario: Withdraw, then inspect
- **WHEN** a resident rated an application `good` and withdraws the rating
- **THEN** their vote record still exists with value `good`, with the same id and creation time
  and a withdrawal time, and the application awaits their vote again

#### Scenario: Withdraw, rate, withdraw
- **WHEN** a resident withdraws, rates `no`, and withdraws again
- **THEN** one record exists with value `no`, it is withdrawn, and its creation time is the first
  rating's

#### Scenario: Nothing to withdraw
- **WHEN** a resident withdraws on an application they never rated, or withdraws a second time
- **THEN** it is refused as not found, and no record or activity entry is written

#### Scenario: Withdraw in a paused round
- **WHEN** a resident withdraws a vote after the round was paused
- **THEN** it is refused with a reason naming the round's state, and the vote stays live

#### Scenario: Withdraw after the application was invited
- **WHEN** a resident withdraws a vote on an application that is now `invited`
- **THEN** it is refused as not votable, and the vote stays live

#### Scenario: Withdraw after losing the right to vote
- **WHEN** a resident whose participation was removed withdraws a vote they cast before
- **THEN** it is refused as not eligible, and the vote stands (EC-4.7)

#### Scenario: Withdraw without the vote permission
- **WHEN** a resident session without the stored `vote` permission, or the household account,
  withdraws
- **THEN** it is refused before any vote is read or written

### Requirement: Every vote change is in the activity log, without its value

Each change of a vote SHALL write exactly one activity entry, in the same transaction as the
change. The entry SHALL name the application as its subject, and the acting account and resident
profile. The three entry types:
- `vote.cast`: a vote becomes live, through a first rating or a rating after a withdrawal.
- `vote.revised`: a live vote changes value.
- `vote.withdrawn`: a live vote is withdrawn.

A write that changes nothing, and a refused write, SHALL record no entry. The entry SHALL carry the
voting stage and nothing else. It never carries a value, old or new, and never free text.
Sources: `docs/03-PRD.md` §4.2 activity rule, G-D7 (*"`{value: "no"}` und jeder Freitext sind es
nicht"*), F-18.

#### Scenario: First rating
- **WHEN** a resident rates an application for the first time
- **THEN** one `vote.cast` entry exists for that application, with the resident as actor and the
  payload exactly `{stage: "invite"}`

#### Scenario: Changing a rating
- **WHEN** a resident changes their live rating from `good` to `no`
- **THEN** one `vote.revised` entry is added, with no value in its payload

#### Scenario: Withdrawing and rating again
- **WHEN** a resident withdraws a rating and later rates the application again
- **THEN** a `vote.withdrawn` entry and then a `vote.cast` entry are added

#### Scenario: A refused write
- **WHEN** a vote or withdrawal is refused
- **THEN** no vote entry is recorded

#### Scenario: A value in the payload
- **WHEN** a vote entry is recorded with a payload that holds the value, an unknown key, or a
  stage other than `invite`/`offer`
- **THEN** recording is refused, and the refusal names the key, never the value
