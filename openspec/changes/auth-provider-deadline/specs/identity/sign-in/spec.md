## ADDED Requirements

### Requirement: A sign-in that cannot reach the provider says so

When a sign-in cannot be decided because the identity provider did not answer (identity
`provider-calls`: an unknown outcome), the person SHALL be told that signing in is not possible
right now and to try again. They SHALL NOT be told their credentials are wrong. No session SHALL be
opened. This applies to every side of the sign-in screen: household, resident by name, and
resident by email. The text SHALL come from the table (`ui/vocabulary`), and the provider's own
message SHALL reach only the log.

The refusal for a wrong name, address or password is unchanged, and stays the same refusal for all
of them.

A name sign-in SHALL make the same requests to the provider whether or not the name exists in the
household. So neither the answer, nor its failure when the provider is unreachable, nor the
provider traffic it causes SHALL tell a visitor whether the name exists. Sources: this requirement's
enumeration concern, as `sign-in-enumeration.test.ts` states it for the refusal message; human
decision 2026-09-28 (uniform calls rather than an availability check first).

#### Scenario: The provider does not answer the password check
- **WHEN** a person signs in and the provider never answers the password check
- **THEN** they are told signing in is not possible right now, not that the password is wrong
- **AND** no session is opened

#### Scenario: The provider does not answer the address lookup of a name sign-in
- **WHEN** a resident signs in by name and the provider never answers the lookup of their sign-in
  address
- **THEN** they are told signing in is not possible right now

#### Scenario: An unknown name meets the same unreachable provider
- **WHEN** a visitor signs in by name with a name that does not exist in the household, and the
  provider never answers
- **THEN** they are told signing in is not possible right now, exactly as for a name that exists

#### Scenario: An unknown name causes the same provider requests as a known one
- **WHEN** one name sign-in uses a name that does not exist and another uses one that does, both
  with a wrong password
- **THEN** both get the same refusal, and both send the provider the same number and kind of
  requests

#### Scenario: A wrong password is still a refusal
- **WHEN** the provider answers and declines the password
- **THEN** the person sees the same refusal as for any other wrong credentials
