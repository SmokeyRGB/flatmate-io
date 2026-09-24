## Purpose

The frame around every resident screen: two destinations in the navigation (Start and Casting), a
profile menu for the secondary ones, and a clean separation from the organisation surface. The frame
never offers a destination that has nothing behind it.

## ADDED Requirements

### Requirement: Two destinations in the resident navigation

Every resident screen SHALL carry a navigation with exactly two destinations, Start and Casting.
The current one SHALL be marked. The organisation surface SHALL NOT be one of them. It is its own
surface, reached from the profile menu and from Start's organisation bridge. No control SHALL be
offered for a feature that does not exist yet, such as notifications. Sources: `rahmenwerk.md` §4.1
(*„untere Leiste *Start · Casting*"*, *„Organisation | eigene Fläche, kein Tab"*, K-3, K-6);
`09-Design-System.md` (Navigation).

#### Scenario: Two tabs
- **WHEN** a resident views any resident screen
- **THEN** the navigation offers Start and Casting and nothing else, with the current one marked

#### Scenario: No dead control
- **WHEN** a resident views any resident screen
- **THEN** no notification control is shown

### Requirement: A profile menu states who is acting and holds the secondary destinations

The resident frame SHALL carry a profile menu that opens as a drop-down panel below its trigger.
Opened, it SHALL first state who is signed in and in which household. Then it SHALL offer the
household's people list, chosen by what the resident may see: the members list for someone who
may see it, and "who lives here" for everyone else, never both. Then "Organisation", only to a
resident who may act on organisation tasks. After a divider it SHALL offer the resident's own
settings, which are not the household's settings, and signing out. The menu SHALL be operable by
keyboard. Signing out from it SHALL end only the resident's own session. Navigating to the
organisation surface SHALL NOT change who is acting. Sources: `rahmenwerk.md` §4.1 (*„Avatar-Menü
→ „Organisation" … **Kein Identitätswechsel** (ADR-013)"*), AC-1.6; `screens/B-start.md` B5;
`screens/E-einstellungen.md` E1 (*„Aus dem Avatar-Menü"*); U-30; `09-Design-System.md`
(Navigation, avatar menu).

#### Scenario: The menu names the identity
- **WHEN** a resident opens the profile menu
- **THEN** it shows their display name and the household's name before any item

#### Scenario: A plain resident's menu
- **WHEN** a plain resident opens the profile menu
- **THEN** it offers "who lives here", their own settings and signing out, and neither the members
  list nor "Organisation"

#### Scenario: A moderator's menu
- **WHEN** a moderator opens the profile menu
- **THEN** it offers the members list instead of "who lives here", "Organisation", their own
  settings and signing out

#### Scenario: Own settings, not the household's
- **WHEN** a resident chooses their settings from the menu
- **THEN** they reach their own settings screen, not the household settings screen

#### Scenario: Signing out
- **WHEN** a resident chooses to sign out from the profile menu
- **THEN** their own session ends and they are on the sign-in screen

### Requirement: The Casting tab leads to what can be done there

The Casting destination SHALL take a resident who has applications awaiting their vote straight to
the screening step. Otherwise it SHALL show a placeholder saying the casting view arrives in a later
slice. The screening step SHALL itself be a placeholder until the screening feature exists, and it
SHALL say so rather than appearing broken. Sources: `rahmenwerk.md` §4.1; human decision
2026-09-24.

#### Scenario: Something to screen
- **WHEN** a resident with applications awaiting their vote opens the Casting tab
- **THEN** they are taken to the screening step

#### Scenario: Nothing to screen
- **WHEN** a resident with no application awaiting their vote opens the Casting tab
- **THEN** the placeholder is shown

### Requirement: The resident's own settings screen exists as a placeholder

The resident's own settings screen (E1) SHALL be reachable from the profile menu. Until its content
is built, it SHALL say that adding an email address and changing the password arrive in a later
step, and SHALL offer a way back to Start. It SHALL NOT show or link to the household settings.
Sources: `screens/E-einstellungen.md` E1; FR-2.17 (delivered by a later change); human decision
2026-09-24.

#### Scenario: Opening own settings today
- **WHEN** a resident opens their own settings screen
- **THEN** they see that its content follows in a later step, and a way back to Start

### Requirement: The organisation surface has its own address

The organisation surface (O1) SHALL be reached at its own address, distinct from Start's. Its
sub-screens SHALL lead back to it, not to Start. The resident screen "who lives here" SHALL lead
back to Start. Sources: `screens/O-organisation.md` O1; `rahmenwerk.md` §4.1; human decision
2026-09-24.

#### Scenario: Back from an organisation screen
- **WHEN** a user follows the back link on rooms, members, rounds or settings
- **THEN** they arrive on the organisation surface

#### Scenario: Back from "who lives here"
- **WHEN** a resident follows the back link on "who lives here"
- **THEN** they arrive on Start
