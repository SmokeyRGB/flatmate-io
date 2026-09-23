## MODIFIED Requirements

### Requirement: A revoked membership grants nothing

A membership that has been revoked SHALL fail every permission and role check, regardless of the
permissions or role recorded on it, and SHALL NOT be able to open a new session, whichever sign-in
path is used. Revocation itself comes from FR-1.26's two removal tiers (`Membership.revoked_at`,
`domain/identity.md` §2.1). That a revoked membership then grants nothing is implemented behaviour
with no requirement of its own. It is recorded here because every other requirement in this
capability rests on it, not because a packet states it. The sign-in half follows from V-3's
*„sofortiger Zugriffsentzug"* (`domain/invarianten.md` §5.3): revoking the sessions that exist
means nothing if a new one can be opened. Reactivating a moved-out member clears the revocation, and
they can sign in again.

#### Scenario: Revocation takes effect everywhere at once
- **WHEN** a membership carrying a role and granted permissions is revoked
- **THEN** every check against it is refused, on every route, without each route testing for it

#### Scenario: A revoked member cannot sign in again
- **WHEN** a member who was marked moved out or removed signs in with correct credentials, by display
  name or by the account's email address
- **THEN** no session is created, and the refusal is the same one a wrong password gets

#### Scenario: A reactivated member signs in normally
- **WHEN** a member marked moved out is reactivated and then signs in with correct credentials
- **THEN** a session is created
