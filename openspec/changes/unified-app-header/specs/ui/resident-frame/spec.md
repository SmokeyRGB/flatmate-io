## MODIFIED Requirements

### Requirement: Two destinations in the resident navigation

Every resident screen SHALL carry a navigation with exactly two destinations, Start and Casting.
The current one SHALL be marked. The organisation surface SHALL NOT be one of them. It is its own
surface, reached from the profile menu and from Start's organisation bridge, but it SHALL share
the resident frame's header, so the product mark and the profile menu are the same on both. No
control SHALL be offered for a feature that does not exist yet, such as notifications. Sources:
`rahmenwerk.md` §4.1 (*„untere Leiste *Start · Casting*"*, *„Organisation | eigene Fläche, kein
Tab"*, K-3, K-6); `09-Design-System.md` (Navigation).

#### Scenario: Two tabs
- **WHEN** a resident views any resident screen
- **THEN** the navigation offers Start and Casting and nothing else, with the current one marked

#### Scenario: No dead control
- **WHEN** a resident views any resident screen
- **THEN** no notification control is shown

#### Scenario: The same header on the organisation surface
- **WHEN** a signed-in user moves between a resident screen and an organisation screen
- **THEN** the product mark stays top-left and the profile menu stays top-right, unchanged in
  place and shape, and the organisation screen shows no separate "signed in as" bar or sign-out link

### Requirement: A profile menu states who is acting and holds the secondary destinations

Every signed-in screen, resident or organisation, SHALL carry a profile menu that opens as a
drop-down panel below its trigger. Opened, it SHALL first state who is signed in and in which
household: a resident by display name, the household account as its household name marked as
administration. Then it SHALL offer the household's people list, chosen by what the user may see:
the members list for someone who may see it, and "who lives here" for everyone else, never both.
Then, directly after it, it SHALL offer one switch to the other surface, in the same position on
both: on a resident screen "Zur Organisation", to a user who may act on organisation tasks; on an
organisation screen "Zum Dashboard", the way back to Start, to a user who has a resident profile
and may act on organisation tasks (a plain resident has the navigation for that). The menu SHALL
never offer both switches at once. After a divider it SHALL offer the user's own settings, which are not the household's settings, and signing out. The
menu SHALL be operable by keyboard. Signing out from it SHALL end only the user's own session.
Navigating between the organisation surface and Start SHALL NOT change who is acting. Sources:
`rahmenwerk.md` §4.1 (*„Avatar-Menü → „Organisation" … **Kein Identitätswechsel** (ADR-013)"*),
AC-1.6; `screens/B-start.md` B5; `screens/E-einstellungen.md` E1 (*„Aus dem Avatar-Menü"*); U-30;
`09-Design-System.md` (Navigation, avatar menu).

#### Scenario: The menu names the identity
- **WHEN** a resident opens the profile menu
- **THEN** it shows their display name and the household's name before any item

#### Scenario: The household account names its identity
- **WHEN** the household account opens the profile menu on an organisation screen
- **THEN** it shows the household's name marked as administration, not a resident placeholder

#### Scenario: A plain resident's menu
- **WHEN** a plain resident opens the profile menu
- **THEN** on either surface it offers "who lives here", their own settings and signing out, and
  none of "Zum Dashboard", the members list or "Zur Organisation" (a plain resident reaches Start
  from the navigation)

#### Scenario: A moderator's menu
- **WHEN** a moderator opens the profile menu on a resident screen
- **THEN** it offers the members list instead of "who lives here", "Zur Organisation", their own
  settings and signing out, and not "Zum Dashboard"

#### Scenario: A moderator's menu on an organisation screen
- **WHEN** a moderator opens the profile menu on an organisation screen
- **THEN** it offers "Zum Dashboard", the members list, their own settings and signing out, and
  not "Zur Organisation"

#### Scenario: Back to Start from the organisation surface
- **WHEN** a resident with organisation rights opens the profile menu on an organisation screen
  and chooses "Zum Dashboard"
- **THEN** they arrive on Start

#### Scenario: No Dashboard without a profile
- **WHEN** a session without a resident profile opens the profile menu
- **THEN** "Zum Dashboard" is not offered

#### Scenario: The mark leads to Start
- **WHEN** a signed-in user chooses the product mark on any resident or organisation screen
- **THEN** they are taken to Start (a session without a resident profile is passed on to the
  organisation surface, as Start itself does)

#### Scenario: The mark on a signed-out screen
- **WHEN** a visitor views sign-in, registration or join
- **THEN** the product mark is shown but is not a link

#### Scenario: Own settings, not the household's
- **WHEN** a resident chooses their settings from the menu
- **THEN** they reach their own settings screen, not the household settings screen

#### Scenario: Signing out
- **WHEN** a user chooses to sign out from the profile menu
- **THEN** their own session ends and they are on the sign-in screen
