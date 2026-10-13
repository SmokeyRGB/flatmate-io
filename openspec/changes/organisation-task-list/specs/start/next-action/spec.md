# Spec Delta

## MODIFIED Requirements

### Requirement: Each identity lands on its own surface

A session acting as a resident profile SHALL land on Start after a completed join, after signing
in, and on opening the application's root. A session of the household account (no resident
profile) SHALL land on the organisation surface (O1) in each of those cases. It SHALL never be
shown Start, and a request for Start or the Casting tab from such a session SHALL send it to its
own landing. Sources: FR-2.18, AC-2.2; `screens/B-start.md` B1 (*„Standard-Landeseite für jedes
`ResidentProfile`"*); `screens/O-organisation.md` O1; G-D15; human decision 2026-10-05 (the
household account's landing moved from O20 to O1, shipped with role-permissions; this spec
catches up).

#### Scenario: A resident signs in
- **WHEN** a resident signs in successfully
- **THEN** they are on Start

#### Scenario: A resident joins
- **WHEN** a visitor completes a join
- **THEN** they are on Start, and not on the organisation surface

#### Scenario: The household account signs in
- **WHEN** the household account signs in successfully
- **THEN** it is on the organisation surface

#### Scenario: The household account asks for Start
- **WHEN** a household-account session requests Start or the Casting tab
- **THEN** it is sent to the organisation surface and receives no content from Start

### Requirement: A separate bridge into organisation work

A resident who may act on organisation tasks SHALL see, below their own tasks and visually distinct
from them, a single bridge into the organisation surface. It SHALL carry the number of open
organisation tasks the viewer can carry out, counted from the same task list the organisation
surface shows (`organisation/task-list`), so the two cannot disagree. When there are none, it SHALL
say plainly that there is nothing to organise right now, worded about the organisation work and
never as praise that could read as covering the resident's own open tasks. A resident who may not
act on organisation tasks SHALL not see it at all. Only work that moves the casting process forward
or makes it possible counts as an organisation task. When the first organisation task is "open the
first round", the bridge body is the organisation surface's own first-round text. Resident work,
such as voting, is never an organisation task. Sources: `rahmenwerk.md` §2.3 (*„nur sichtbar für
Profile mit Rechten, nie in die persönliche Liste gemischt"*), U-5; `screens/O-organisation.md`
rules 1–3; persona walkthroughs 2026-10-12 (the old empty wording sat beside an open vote task).

#### Scenario: A fresh household has one first-round task
- **WHEN** a moderator views Start, the household has an undeleted room that can be cast for, and no round of any status
- **THEN** the bridge counts the open organisation tasks, one of which is the first-round task, and its body is the organisation surface's first-round text

#### Scenario: No room yet
- **WHEN** a moderator views Start and the household has no undeleted room and no round
- **THEN** the bridge counts an "add a room" task and no first-round task

#### Scenario: No round and no room a round can be held for gives no first-round task
- **WHEN** a moderator views Start, the household has no round of any status, and every undeleted room is occupied or not available
- **THEN** no first-round task is counted, since the new-round form would refuse every room

#### Scenario: A free room with no round covering it
- **WHEN** a moderator views Start, the household already has a round, and an open, undeleted room is covered by no draft, open or paused round
- **THEN** the bridge counts one open task for that room and leads to the organisation surface

#### Scenario: Candidates can be invited
- **WHEN** a moderator views Start and their ranking for an open round highlights an application that is still being decided
- **THEN** the bridge counts an "invite candidates" task

#### Scenario: Nothing to organise
- **WHEN** a moderator views Start and no organisation task is open for them
- **THEN** the bridge says that there is nothing to organise right now, and does not say „Alles erledigt – gut gemacht"

#### Scenario: No rights, no bridge
- **WHEN** a plain resident views Start
- **THEN** no bridge is shown

#### Scenario: A count the viewer can act on
- **WHEN** a resident holds a role that shows the bridge but lacks the permission to create a round
- **THEN** the free room is not counted as their task
