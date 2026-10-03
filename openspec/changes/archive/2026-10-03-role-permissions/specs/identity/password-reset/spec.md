## MODIFIED Requirements

### Requirement: The administration can issue a reset link for an active profile without an email

The household account SHALL be able to issue a password-reset link for an active resident profile
of its own household, provided that profile's account has no email address. The right to issue one
SHALL be the stored permission `issue_password_reset_link`, which only the household set contains
and which the database refuses on every other membership (`identity/permissions`), so no other
identity SHALL be able to issue one. A reset link SHALL be single-use and SHALL expire like any
join link. Sources: O-16 (`domain/identity.md` §2.1: *„Die Verwaltung … kann für ein aktives
`ResidentProfile` ohne `email` einen einmal verwendbaren Link ausstellen"*); PRD §4.1.1 K-18;
`resident-settings` proposal Assumption 5; F3 change 2b (`role-permissions`).

#### Scenario: Issuing a reset link
- **WHEN** the household account issues a reset link for an active profile whose account has no
  email
- **THEN** a single-use link is created naming that profile

#### Scenario: A moderator cannot issue one
- **WHEN** a moderator's resident session attempts to issue a reset link
- **THEN** it is refused and no link is created

#### Scenario: A profile with an email gets no reset link
- **WHEN** the household account attempts to issue a reset link for a profile whose account has an
  email
- **THEN** it is refused and no link is created

#### Scenario: Only active profiles
- **WHEN** the household account attempts to issue a reset link for a prepared, moved-out or
  removed profile
- **THEN** it is refused and no link is created
