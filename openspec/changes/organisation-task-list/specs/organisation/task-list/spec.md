# Spec Delta

## Purpose

The organisation surface (O1) as a task list: it tells the person organising the household's
search what to do next and why, shows where the round stands, and fills its empty state with the
round overview, so that a first-time moderator can run a round without reading any explanation.

## ADDED Requirements

### Requirement: One primary organisation task, with its reason

O1 SHALL show at most one primary task at a time, with the reason it comes first readable without
any interaction, and a single direct action that leads to the screen where the task is carried out,
never to a list in which the task must be found again. Up to three further open tasks SHALL be
listed beneath it, each leading directly to its action, and any beyond those SHALL be folded into a
single "and N more" entry. Sources: `screens/O-organisation.md` O1 (*„Ein primärer CTA, bis zu drei
Zeilen darunter, Rest eingeklappt — sortiert nach Zeitdruck mit genanntem Grund, gleiches Prinzip wie
B1"*) and rule 1 (*„Jede Orga-Aufgabe führt direkt auf die Handlung"*); `rahmenwerk.md` §2.3.

#### Scenario: Several tasks are open
- **WHEN** an organisation user with three open organisation tasks opens O1
- **THEN** exactly one is shown as the primary task with its reason, and the other two are listed beneath it

#### Scenario: Overflow is folded
- **WHEN** more than four organisation tasks are open
- **THEN** one is primary, three are listed, and the rest appear as a single "and N more" entry

#### Scenario: A task leads to its action
- **WHEN** the user follows the primary task's action
- **THEN** they arrive on the screen where that task is carried out

### Requirement: Organisation tasks are offered by held permission

Each organisation task SHALL be offered only to a caller whose live membership holds the permission
its action requires, decided inside the read that produces the list and never by a role comparison
or by the page. The task kinds and their conditions are:

| Task | Required permission | Open while |
|---|---|---|
| Add a room | `manage_rooms` | the household has no undeleted room |
| Invite flatmates | `manage_join_codes` | no resident has joined the household (no live resident membership) |
| Decide who runs the search | `appoint_moderator` | no live membership of the household holds `manage_rounds`, and the task has a way to offer: the founding link is unused and valid and the caller may read it, or a joined member exists who could be appointed |
| Open the first round | `manage_rounds` | the household has no round of any status, has at least one undeleted room, and at least one undeleted room is neither occupied nor not available |
| Open a round for a room | `manage_rounds` | the household has a round, and a room is open for letting, not deleted, and covered by no draft, open or paused round (one task per room) |
| Invite candidates | `manage_rounds` | per open round the caller takes part in with the right to vote: the caller has no vote awaiting in that round (an explicit zero; an unknown count counts as awaiting), and the caller's own ranking for it shows at least one highlighted application that is still being decided |

"Decide who runs the search" SHALL offer only the ways that work at that moment: taking it on
oneself through the household's own founding link while that link is unused and valid and the
caller may read it, and appointing a member on the members screen only while a joined member exists
who could be appointed. With neither way available the task SHALL NOT be offered; inviting
flatmates comes first. "Invite flatmates" SHALL, once at least one unused invitation exists but no
one has joined yet, name sharing the existing links as the step instead of creating invitations,
and still lead to the members screen. Independently of this task, the founding-link offer
that `identity/join-code` requires on the household account's organisation screen stays available
while the link is unused and valid. "Invite
candidates" SHALL lead to that round's ranking. Sources: `rahmenwerk.md` §4.2 (*„Welche Abschnitte
der Organisationsfläche erscheinen, entscheidet **allein `role`/`permissions`**"*), §4.3 (*„Die
Verwaltung kann jederzeit ein `ResidentProfile` **anlegen** und Moderatoren ernennen"*);
`screens/O-organisation.md` rules 1–3; F3 Q-14 (human, 2026-09-28); EC-1.1/EC-1.2.

#### Scenario: A fresh household account
- **WHEN** the household account of a household with no room, no joined resident and no moderator opens O1
- **THEN** the tasks are "add a room", "invite flatmates" and, while the founding link is live, "decide who runs the search"; no round task

#### Scenario: No room yet, as moderator
- **WHEN** a moderator opens O1 in a household with no undeleted room and no round
- **THEN** "add a room" is offered and "open the first round" is not

#### Scenario: A room exists and no round
- **WHEN** a moderator opens O1 in a household with an undeleted room that can be cast for and no round of any status
- **THEN** "open the first round" is offered

#### Scenario: Someone already runs the search
- **WHEN** any live membership of the household holds `manage_rounds`
- **THEN** "decide who runs the search" is not offered to anyone

#### Scenario: The founding link is still live
- **WHEN** the household account is offered "decide who runs the search" and its founding link is unused and valid
- **THEN** the task offers joining through that link in one click, and offers appointing a member only if a joined member exists

#### Scenario: The founding link is spent
- **WHEN** the household account's founding link has been used, has expired or was deleted, and a joined member exists who could be appointed
- **THEN** "decide who runs the search" leads to the members screen only

#### Scenario: Nobody to appoint yet
- **WHEN** no live membership holds `manage_rounds`, no one has joined, and the founding link is spent
- **THEN** "decide who runs the search" is not offered, and "invite flatmates" is

#### Scenario: Invitations exist, nobody joined
- **WHEN** the household has unused invitations and no one has joined
- **THEN** "invite flatmates" names sharing the existing links, not creating invitations

#### Scenario: Candidates can be invited
- **WHEN** a moderator who has voted opens O1 and their ranking for an open round highlights an application that is still being decided
- **THEN** "invite candidates" is offered for that round and leads to its ranking

#### Scenario: The moderator still has votes to cast
- **WHEN** a moderator's ranking for the open round highlights an undecided application but an application of that round still awaits the moderator's vote
- **THEN** "invite candidates" is not offered; Start's vote task leads there first

#### Scenario: Ranking not yet visible to the moderator
- **WHEN** a moderator's ranking for the open round shows no highlighted row yet, for instance because they have not voted
- **THEN** "invite candidates" is not offered

#### Scenario: Permission removed
- **WHEN** a caller whose membership no longer holds `manage_rounds` opens O1
- **THEN** no round task and no "invite candidates" task is offered to them

### Requirement: One fixed rule orders organisation tasks

Organisation tasks SHALL be ordered by one deterministic rule computed from stored state: add a
room, invite flatmates, decide who runs the search, open the first round, open a round for a room,
invite candidates; tasks of the same kind ordered by a stable key. No learned, heuristic or
AI-assisted prioritisation SHALL be used. Sources: P-3; C-2.8; `rahmenwerk.md` §2.2.

#### Scenario: Same input, same order
- **WHEN** O1 is computed twice from the same stored state
- **THEN** the order of tasks is identical both times

#### Scenario: Setup before rounds
- **WHEN** both "invite flatmates" and "open a round for a room" are open for the caller
- **THEN** "invite flatmates" comes first

### Requirement: Nothing open means the round overview, never a blank

When the caller has no open organisation task, O1 SHALL show the overview of the household's active
round in place of the task card, and SHALL never show an empty surface. Its one action SHALL follow
the round's step: while no application has arrived, capturing one (for a caller holding
`create_application`); once applications are being voted on or invited, the round's casting
view for a caller with a resident profile, with capturing as a secondary action. With no round at all and no
task, it SHALL say that no round is running. Only one round SHALL be presented as active; other
rounds are reachable from a list below it. Sources: `screens/O-organisation.md` O1 (*„Leer (keine
Orga-Aufgabe offen) | Rundenübersicht aus §3 füllt die Fläche — nie leer"*); EC-1.5.

#### Scenario: Round running, nothing to do
- **WHEN** a moderator with no open organisation task opens O1 while a round is open
- **THEN** the round overview fills the task area

#### Scenario: Voting under way, nothing to organise
- **WHEN** a moderator with no open organisation task opens O1 while the active round has applications being voted on
- **THEN** the primary action leads to the round's casting view, and capturing an application is offered as a secondary action

#### Scenario: Several open rounds
- **WHEN** two rounds are open
- **THEN** exactly one is presented as the active round and the other is listed below it

### Requirement: The round progress header

For the active round O1 SHALL show a step indicator of the round's progress, each step named by
what is done in it: opening the round, collecting applications, voting, sending out invitations. The
current step SHALL be computed from the furthest-advanced main-path application by the rule of
`rahmenwerk.md` §3.1, with side states never counting as progress. For a caller who may not see the round's applications (the household account), only "opening the
round" SHALL be shown as done and no later step SHALL be named as current. Before any round exists,
the household account SHALL see its setup steps, with starting the search as the current step once
the other setup steps are done. An earlier step SHALL be shown
as done only while no application of the round is still in it; otherwise it SHALL be shown as still
running and named as such next to the current step, so the indicator never claims that voting is
finished while applications still await votes. Steps that v0.1 cannot carry out (scheduling beyond invitation, offer, moving in) SHALL NOT
be shown. A caller with a resident profile SHALL also see the round's applications counted by
state. The indicator SHALL never gate or hide an action. Sources: `rahmenwerk.md` §3.1 (*„Die Anzeige
wird aus der Bewerbung berechnet, die **am weitesten fortgeschritten** ist"*, *„Was die Anzeige nicht
ist: ein Tor"*); human decision 2026-10-12 (only built steps).

#### Scenario: Round just opened
- **WHEN** the active round has no main-path application
- **THEN** the indicator's current step is "collecting applications"

#### Scenario: Voting under way
- **WHEN** the furthest-advanced application of the active round is `new` or `screened`
- **THEN** the current step is "voting"

#### Scenario: Someone invited
- **WHEN** an application of the active round is `invited`
- **THEN** the current step is "sending out invitations", and no later step is shown

#### Scenario: Someone invited while others are still voted on
- **WHEN** one application of the active round is `invited` and others are still `new`
- **THEN** the current step is "sending out invitations", the voting step is shown as still running, not as done, and the indicator says so

#### Scenario: Only side states
- **WHEN** every application of the active round is in a side state
- **THEN** the current step is "collecting applications"

### Requirement: No application-derived value for the household account

No read that serves O1 SHALL return a value derived from applications or votes to a session without
a resident profile: no rows, no counts, no state distribution and no task derived from them. Such a
session SHALL see that a round exists, its title and its status only. The refusal SHALL be made by
the read itself, whichever caller invokes it. Sources: G-D15; ADR-014; `rahmenwerk.md` §4.3
(*„alles aus `Application` Abgeleitete — einschließlich Zahlen — setzen dagegen ein
`ResidentProfile` voraus"*).

#### Scenario: The household account during a round
- **WHEN** the household account opens O1 while a round with applications is open
- **THEN** it sees the round's title and status and the step "opening the round" as done, and no count, no distribution and no "invite candidates" task

#### Scenario: Called directly
- **WHEN** a read that serves O1 is invoked for a household-account session by any other caller
- **THEN** it returns no application-derived value

### Requirement: Capturing an application is always one tap away

While a round is open, a caller holding `create_application` SHALL find on O1 a persistent entry to
capture an application for the active round and a link to that round's applications, independent of
which task is primary. Capture is not a task: the system cannot know that an application arrived.
Sources: F3 Q-14 (human, 2026-09-28: *„persistent „Bewerbung erfassen" entry and the round's
„Bewerbungen" section link"*); `screens/O-organisation.md` rule 2.

#### Scenario: Moderator during a round
- **WHEN** a moderator opens O1 while a round is open
- **THEN** an entry to capture an application for that round and a link to its applications are offered

#### Scenario: No permission to capture
- **WHEN** a caller without `create_application` opens O1 while a round is open
- **THEN** no capture entry is offered

### Requirement: Organisation sections as visible entries

O1 SHALL offer the organisation sections the caller may use (rooms, member administration,
household settings) as visibly distinct, labelled entries with an icon; "who lives here" is a
resident screen reached from the profile menu, not an organisation section, each shown
only when the caller's stored permissions grant that section, from the same read that decides the
profile menu. Opening another round SHALL be offered only to a caller holding `manage_rounds`, and
SHALL NOT be the most prominent element while a round is open. Sources: `rahmenwerk.md` §4.4,
§4.2; role-permissions design D9.

#### Scenario: Household account
- **WHEN** the household account opens O1
- **THEN** it sees entries for rooms, member administration and household settings, and none for "who lives here"

#### Scenario: A moderator
- **WHEN** a moderator opens O1
- **THEN** it sees an entry for member administration and none for "who lives here"

#### Scenario: Plain section access follows permissions
- **WHEN** a caller without `manage_rooms` opens O1
- **THEN** no rooms entry is shown

#### Scenario: Another round is possible
- **WHEN** a moderator opens O1 while a round is open
- **THEN** opening another round is offered as a secondary entry, below the task area and the round overview
