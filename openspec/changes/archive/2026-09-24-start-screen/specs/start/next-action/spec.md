## Purpose

The resident's Start screen (B1): it answers "what is due for me now?" with exactly one primary
action and the reason it comes first, chosen by one deterministic precedence rule. It fills an
empty state with the round's standing, and offers a separate bridge into organisation work for
those who hold it. It also fixes which surface each
kind of session lands on.

## ADDED Requirements

### Requirement: Each identity lands on its own surface

A session acting as a resident profile SHALL land on Start after a completed join, after signing
in, and on opening the application's root. A session of the household account (no resident
profile) SHALL land on the household settings screen (O20) in each of those cases. It SHALL never
be shown Start, and a request for Start or the Casting tab from such a session SHALL send it to its
own landing. Sources: FR-2.18, AC-2.2; `screens/B-start.md` B1 (*„Standard-Landeseite für jedes
`ResidentProfile`"*); `screens/O-organisation.md` O20; G-D15.

#### Scenario: A resident signs in
- **WHEN** a resident signs in successfully
- **THEN** they are on Start

#### Scenario: A resident joins
- **WHEN** a visitor completes a join
- **THEN** they are on Start, and not on the organisation surface

#### Scenario: The household account signs in
- **WHEN** the household account signs in successfully
- **THEN** it is on the household settings screen

#### Scenario: The household account asks for Start
- **WHEN** a household-account session requests Start or the Casting tab
- **THEN** it is sent to the household settings screen and receives no content from Start

### Requirement: Exactly one primary action, with its reason

Start SHALL display at most one primary action at a time. Next to it, visible without any
interaction, SHALL be the reason it comes first. Up to three further open tasks SHALL be listed
beneath it, and any beyond those SHALL be folded into a single "and N more" entry. No promotional or
install-related element SHALL occupy the primary action's position or be ordered above a task with a
due date. Sources: FR-2.20, FR-2.21, FR-2.25, AC-2.12, AC-2.13, AC-2.16; `rahmenwerk.md` §2.3
(*„Genau **ein** primärer CTA mit konkreter Zahl und direktem Ziel · darunter bis zu **drei**
Zeilen · der Rest eingeklappt als „und N weitere"“*).

#### Scenario: One action among several
- **WHEN** a resident with an open vote and other open tasks opens Start
- **THEN** exactly one primary action is displayed

#### Scenario: The reason needs no tap
- **WHEN** a primary action is displayed
- **THEN** the reason it is first is readable without interacting with the screen

#### Scenario: Overflow is folded
- **WHEN** a resident has more than four open tasks
- **THEN** one is primary, three are listed, and the rest appear as a single "and N more" entry

### Requirement: One precedence rule chooses the order

Open tasks SHALL be ordered by exactly one rule. Tasks that carry a real due date come first,
earliest first. Tasks without a due date follow in the fixed order T-1, T-2, T-3, T-4/T-5, T-6. An
overdue task keeps its place among the dated tasks and changes only its reason text. It never
blocks or unlocks anything. T-6 SHALL never be listed beside T-5. The order SHALL be computed
deterministically from the stored state, with no learned, heuristic or AI-assisted prioritisation.
Sources: FR-2.24, C-2.8, S-48, P-5; `rahmenwerk.md` §2.2 (*„Aufgaben mit Datum zuerst, die
nächstfällige zuoberst. Aufgaben ohne Datum danach, in der festen Reihenfolge T-1 · T-2 · T-3 ·
T-4/T-5 · T-6."*).

#### Scenario: A dated task outranks an undated one
- **WHEN** one open task has a due date and another of an earlier fixed-order type has none
- **THEN** the dated task is primary

#### Scenario: Two dated tasks
- **WHEN** two open tasks both have due dates
- **THEN** the one due sooner is primary

#### Scenario: No dates at all
- **WHEN** no open task has a due date
- **THEN** they are ordered T-1, T-2, T-3, T-4/T-5, T-6

#### Scenario: Overdue is still first, not locked
- **WHEN** a task's due date has passed
- **THEN** it is still offered, ordered by its date, and its reason says it is overdue

#### Scenario: Same input, same order
- **WHEN** Start is computed twice from the same stored state
- **THEN** the order is identical both times

### Requirement: A vote waiting for the resident is a task

Where a round is open and the resident takes part in it with the right to vote, each application of
that round still on the main path at the voting stage (`new` or `screened`) that the resident has
not voted on SHALL count toward one T-5 task. The count SHALL be shown as a number, and the task
SHALL lead directly to the screening step. Its due date SHALL be the round's phase deadline where
one is set, and it SHALL have none otherwise. A resident without the right to vote in the round
SHALL NOT be offered this task. Sources: `rahmenwerk.md` §2.1 T-5, §2.2 (*„T-4, T-5 Stimmen |
`CastingRound.phase_deadline_at` (S-44)"*); EC-2.12.

#### Scenario: Applications await a vote
- **WHEN** an open round holds applications at the voting stage and the resident may vote in it
- **THEN** Start's primary action names how many await the resident and leads to screening

#### Scenario: A deadline is set
- **WHEN** the round has a phase deadline
- **THEN** the vote task is dated by it and its reason names the deadline

#### Scenario: No right to vote
- **WHEN** the resident takes part in the open round without the right to vote
- **THEN** no vote task is offered and Start shows the round's standing

### Requirement: Start shows no participation count and no participant list

Start SHALL NOT show how many residents have voted, and SHALL NOT offer a way to the list of a
round's participants. Participation and the participant list belong with the round's score-board
after screening. Sources: human decision 2026-09-24, amending FR-2.22, AC-2.14 and `03-PRD.md`
§4.1.2 (*Beteiligungsstand*); `screens/B-start.md` B4 (*Zugang*, as amended).

#### Scenario: An open round with voters
- **WHEN** a resident opens Start while a round is open
- **THEN** no count of voters and no link to a participant list is displayed

### Requirement: Nothing open means the round's standing, never a blank

When the resident has no open task, Start SHALL show the round's standing in place of the task
card, and SHALL never show an empty surface. The standing names the phase of the application that
has progressed furthest along the main path. Side states do not count, and a round with no
main-path application reads "Warten auf Bewerbungen". Beneath the phase SHALL be the actual
distribution of applications by state. With no open round, Start SHALL say that no round is
running. Sources: FR-2.23, AC-2.15, EC-2.3, EC-2.12; `screens/B-start.md` B1 (*„Rundenstand aus §3
füllt die Fläche — nie leer"*); `rahmenwerk.md` §3.1.

#### Scenario: Everything done
- **WHEN** the resident has no open task and a round is open
- **THEN** the round's phase and its distribution by state are displayed

#### Scenario: No round
- **WHEN** no round is open
- **THEN** Start says that no round is running, and the surface is not empty

#### Scenario: A round runs without the resident
- **WHEN** a round is open but the resident does not take part in it
- **THEN** Start says that a round is running without them, shows no number derived from its
  applications, and does not say that no round is running

#### Scenario: Only side states
- **WHEN** every application of the open round is in a side state
- **THEN** the phase reads as waiting for applications

### Requirement: The viewer's own past application is not counted

Any count on Start derived from applications SHALL exclude an application that became the viewing
resident. Such an application SHALL neither appear as a row nor contribute to any number, so
nothing on the screen allows it to be reconstructed. Sources: `rahmenwerk.md` §6 (*„kein Platzhalter,
keine Lücke, kein Hinweis, keine Zählung, aus der man zurückrechnen könnte"*); V-1.

#### Scenario: A new flatmate looks at the standing
- **WHEN** a round is still open for another room and the viewer's own application in it has
  reached moved-in
- **THEN** the distribution by state on the viewer's Start does not count that application

### Requirement: No application-derived number for the household account

No read that serves Start SHALL return a value derived from applications to a session without a
resident profile: no rows, and no aggregates such as counts or the distribution by state. The refusal SHALL be made by the read itself, whichever route or caller
invokes it, and not only by the screen that happens to call it. Sources: G-D15, ADR-014;
`rahmenwerk.md` §4.3.

#### Scenario: Through the screen
- **WHEN** a household-account session requests Start
- **THEN** it receives no application-derived value

#### Scenario: Called directly
- **WHEN** a read that serves Start is invoked for a household-account session by any other caller
- **THEN** it returns no application-derived value, and issues no query that could produce one

### Requirement: A separate bridge into organisation work

A resident who may act on organisation tasks SHALL see, below their own tasks and visually distinct
from them, a single bridge into the organisation surface. It SHALL carry the number of open
organisation tasks the viewer can carry out. When there are none, it SHALL say that everything is
taken care of. A resident who may not act on organisation tasks SHALL not see it at all. Only work
that moves the casting process forward counts as an organisation task. In this slice that is one
task: a room that is open for letting and not covered by any draft, open or paused round. It is
counted only for a viewer who holds the permission that creating a round requires. Resident work, such as voting, is never an
organisation task. Sources: `rahmenwerk.md` §2.3 (*„nur sichtbar für Profile mit Rechten, nie in die
persönliche Liste gemischt"*), U-5; `screens/O-organisation.md` rules 1–3.

#### Scenario: A free room with no round
- **WHEN** a moderator views Start and a room is open with no round covering it
- **THEN** the bridge shows one open task and leads to the organisation surface

#### Scenario: Nothing to organise
- **WHEN** a moderator views Start and no organisation task is open
- **THEN** the bridge says everything is taken care of

#### Scenario: No rights, no bridge
- **WHEN** a plain resident views Start
- **THEN** no bridge is shown

#### Scenario: A count the viewer can act on
- **WHEN** a resident holds a role that shows the bridge but lacks the permission to create a round
- **THEN** the free room is not counted as their task
