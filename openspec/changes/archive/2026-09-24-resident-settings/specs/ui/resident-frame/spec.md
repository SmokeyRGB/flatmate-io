## REMOVED Requirements

### Requirement: The resident's own settings screen exists as a placeholder

**Reason:** This change builds the screen. Its behaviour is now specified in
`identity/account-settings`.
**Migration:** Nothing to migrate. The route and the profile-menu entry stay. The real screen
replaces the placeholder copy.

## ADDED Requirements

### Requirement: The resident's own settings screen is reached from the profile menu

The resident's own settings screen (E1) SHALL be reachable from the profile menu and SHALL offer a
way back to Start. It SHALL NOT show or link to the household settings. `identity/account-settings`
specifies its content. Sources: `screens/E-einstellungen.md` E1 (*„Aus dem Avatar-Menü"*); human
decision 2026-09-24.

#### Scenario: Opening own settings
- **WHEN** a resident opens their own settings from the profile menu
- **THEN** they reach the settings screen, which has a way back to Start and no link to the
  household settings
