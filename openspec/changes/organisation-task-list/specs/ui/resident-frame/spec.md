# Spec Delta

## MODIFIED Requirements

### Requirement: A profile menu states who is acting and holds the secondary destinations

Every signed-in screen, resident or organisation, SHALL carry a profile menu that opens as a
drop-down panel below its trigger. Opened, it SHALL first state who is signed in and in which
household: a resident by display name, the household account as its household name marked as
administration. Then it SHALL offer the household's people list, chosen by identity: "who lives here" for every
user with a resident profile, moderators included, and the members list for the household account
(which has no resident profile and no "who lives here"), never both. Member administration is
reached from the organisation surface, not from this menu.
Then, directly after it, it SHALL offer one switch to the other surface, in the same position on
both: on a resident screen "Zur Organisation", to a user who may act on organisation tasks; on an
organisation screen "Zum Dashboard", the way back to Start, to a user who has a resident profile
and may act on organisation tasks (a plain resident has the navigation for that). The menu SHALL
never offer both switches at once. After a divider it SHALL offer the user's own settings, which are not the household's settings, and signing out. The
menu SHALL be operable by keyboard. Signing out from it SHALL end only the user's own session.
Navigating between the organisation surface and Start SHALL NOT change who is acting. Sources:
`rahmenwerk.md` §4.1 (*„Avatar-Menü → „Organisation" … **Kein Identitätswechsel** (ADR-013)"*),
AC-1.6; `screens/B-start.md` B5; `screens/E-einstellungen.md` E1 (*„Aus dem Avatar-Menü"*); U-30;
`09-Design-System.md` (Navigation, avatar menu); human decision 2026-10-13 (the members list in a
moderator's menu doubled "who lives here").

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
- **THEN** it offers "who lives here", "Zur Organisation", their own settings and signing out, and
  neither the members list nor "Zum Dashboard"

#### Scenario: A moderator's menu on an organisation screen
- **WHEN** a moderator opens the profile menu on an organisation screen
- **THEN** it offers "Zum Dashboard", "who lives here", their own settings and signing out, and
  neither the members list nor "Zur Organisation"

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

#### Scenario: The household account's menu
- **WHEN** the household account opens the profile menu
- **THEN** it offers the members list, and not "who lives here"
