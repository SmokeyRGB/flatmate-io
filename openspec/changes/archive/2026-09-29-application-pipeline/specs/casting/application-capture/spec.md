## MODIFIED Requirements

### Requirement: The organisation's view of an application is readable only to those who work on applications

This requirement covers the organisation surface only: the application detail inside a round's
organisation pages (screen O5's shell), where applications are captured and managed. It says
nothing about what a resident sees of an application while screening it. That is F4's deck, where
every participating resident sees the applicant's facts (name, message and the rest) under V-2, and
F4 specifies it.

The organisation detail SHALL be readable only by a session with a resident profile acting, whose
live membership holds `create_application` or `change_application_state`, and only for an
application of its own household. The screens SHALL offer the way to it only to such a session. A
resident without either permission reaches it only by typing its address, and is then refused. The
household account SHALL see neither the detail nor that the application exists. A malformed or
unknown id SHALL show "not found", never an error. Sources: G-D15, ADR-014, F3 plan decision Q-11
(the organisation surface is permission-gated, stricter than V-2).

The permission SHALL hold through the read itself: the membership stays locked from the check to
the end of the read, so a revocation that commits in between makes the read wait and then refuse,
and never lets it return personal data at no authorized instant.

Exactly two reads SHALL return an application's personal columns: this detail, and the round's
list of applications (`casting/application-pipeline`). The list follows the same rule and returns
no message and no attributes. Every other function SHALL return lifecycle columns only (id,
household, round, state, state change time, resident it became, creation time, retention date):
- the profile-only read of an application;
- a state change's result.

#### Scenario: A moderator opens the organisation detail
- **WHEN** a moderator opens the organisation detail of an application in their household
- **THEN** its details are shown

#### Scenario: A resident without an application permission types the organisation address
- **WHEN** a member without either permission requests the organisation detail by its address
- **THEN** nothing about the application is returned, and the screen explains that this page is
  for the moderation

#### Scenario: The household account
- **WHEN** a session without a resident profile requests the organisation detail
- **THEN** nothing is returned, and no database query runs

#### Scenario: A malformed id
- **WHEN** the organisation detail is requested with an id that is not a UUID
- **THEN** "not found" is shown

#### Scenario: A revocation in flight is waited for
- **WHEN** the reader's membership is being revoked in a transaction that has not ended
- **THEN** the read waits, and once the revocation commits it is refused

#### Scenario: The profile-only read carries no personal column
- **WHEN** an application is read by the profile-only read
- **THEN** its result has no applicant name, contact, message, attributes, age, source or
  collection source

#### Scenario: A state change returns no personal column
- **WHEN** an application's state is changed
- **THEN** the result carries lifecycle columns only
