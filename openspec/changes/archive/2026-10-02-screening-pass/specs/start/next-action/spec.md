## MODIFIED Requirements

### Requirement: A vote waiting for the resident is a task

Where a round is open and the resident takes part in it with the right to vote, each application of
that round still on the main path at the voting stage (`new` or `screened`) that the resident has
not voted on SHALL count toward one T-5 task. "Not voted on" means the resident holds no
non-withdrawn vote on it at the `invite` stage; this count and the screening pass's deck SHALL be
the same set, by one definition. The count SHALL be shown as a number, and the task SHALL lead
directly to that round's screening pass. Its due date SHALL be the round's phase deadline where
one is set, and it SHALL have none otherwise. A resident without the right to vote in the round
SHALL NOT be offered this task. Sources: `rahmenwerk.md` §2.1 T-5, §2.2 (*„T-4, T-5 Stimmen |
`CastingRound.phase_deadline_at` (S-44)"*); EC-2.12; `F4-requirements.md` FR-4.1 (V1.1, F-1).

#### Scenario: Applications await a vote
- **WHEN** an open round holds applications at the voting stage and the resident may vote in it
- **THEN** Start's primary action names how many await the resident and leads to screening

#### Scenario: A deadline is set
- **WHEN** the round has a phase deadline
- **THEN** the vote task is dated by it and its reason names the deadline

#### Scenario: No right to vote
- **WHEN** the resident takes part in the open round without the right to vote
- **THEN** no vote task is offered and Start shows the round's standing

#### Scenario: Some already rated
- **WHEN** the resident has rated three of five applications awaiting them
- **THEN** the task names two, and the screening pass jumps to exactly those two

#### Scenario: Everything rated
- **WHEN** the resident has rated every application awaiting them
- **THEN** no vote task is offered and Start shows the round's standing

#### Scenario: Two rounds
- **WHEN** the resident may vote in two open rounds that both await them
- **THEN** each task leads to its own round's pass
