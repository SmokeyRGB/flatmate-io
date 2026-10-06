# identity/provider-calls Specification

## Purpose
How the application talks to the identity provider: every call has a deadline, and an answer that
never came is treated as an unknown outcome, never as a refusal. Each flow that calls the provider
states in its own capability what an unknown outcome leaves behind.

## Requirements
### Requirement: Every call to the identity provider has a deadline

Every request the application sends to the identity provider SHALL be abandoned when no complete
answer has arrived within a fixed deadline. The deadline SHALL apply to each request separately.
It SHALL hold wherever the request is made, including while a database transaction holds row locks
on the account. A request abandoned this way SHALL release everything the waiting request held
(its database connection and its locks) as soon as the flow that made it finishes, not after the
runtime's own network timeout. The deadline SHALL be configurable per environment and SHALL have a
default. Sources: `.claude/rules/implementation-hazards.md`, "No transaction spans Postgres and
Supabase Auth"; the measurements of 2026-09-28 (requests answered neither by the provider nor by
the network for minutes).

#### Scenario: A request that is never answered
- **WHEN** the provider receives no request, or never answers one, that the application sent
- **THEN** the call ends with an unknown outcome once the deadline passes, not minutes later

#### Scenario: An answer that arrives in time
- **WHEN** the provider answers within the deadline, with success or with an error
- **THEN** the application receives exactly that answer, unchanged

#### Scenario: Another writer waiting on the same account
- **WHEN** a change to an account is waiting on a provider answer that never comes, and a second
  request needs the same account's locks
- **THEN** the second request proceeds once the first has given up, without waiting minutes

### Requirement: An unanswered call is an unknown outcome, never a refusal

The application SHALL distinguish two outcomes of a failed provider call:
- *refused*: the provider answered and declined;
- *unknown*: no answer arrived, or the answer was a server-side or gateway failure. The request
  may or may not have taken effect.

An unknown outcome SHALL never be reported as a refusal, whether as a wrong password, a taken
address or anything else the person could act on wrongly. Where a call changes state at the
provider, an unknown outcome SHALL be resolved against the provider's current state before the
person is told anything definite, or SHALL be reported as not determinable. Sources:
`.claude/rules/implementation-hazards.md` (*„Every error after an external change maps to the state
that change left behind"*; *„A repair after a failed commit reconciles to the authority's current
state (the provider's address), never replays its own write"*).

#### Scenario: An unanswered sign-in check
- **WHEN** the provider does not answer a password check
- **THEN** the person is not told their password is wrong

#### Scenario: An unanswered change
- **WHEN** the provider does not answer a request that changes an account
- **THEN** the application does not assume the change was refused. It either establishes what the
  provider now holds or says that it cannot tell

### Requirement: Only a call that changes nothing is sent again blind

A call that only reads, or only checks a password, SHALL be sent a second time when its first
answer never came, and SHALL NOT be sent more than twice. A call that changes state at the provider SHALL NOT
be sent again before the application has read back that the first copy did not take effect. The
one exception is removing an account the application itself just created: that SHALL be sent at
most twice, because a second removal of an already-removed account changes nothing. A call that
creates an account SHALL NOT be sent again at all.

A password check SHALL count as "wrong password" only when the provider says exactly that. A check
the provider declines for any other reason, such as too many requests, SHALL be treated like an
unanswered one.

#### Scenario: A lost read
- **WHEN** the first answer to a read never comes and the second does
- **THEN** the flow continues with the second answer

#### Scenario: A lost change is read back before it is repeated
- **WHEN** the answer to a change never comes
- **THEN** the change is sent again only if the provider shows it did not take effect, and at most
  once

#### Scenario: A declined password check is not a wrong password
- **WHEN** the provider declines a password check because of too many requests
- **THEN** the person is not told their password is wrong

#### Scenario: A lost account creation is never repeated
- **WHEN** the answer to an account creation never comes
- **THEN** no second creation is sent
