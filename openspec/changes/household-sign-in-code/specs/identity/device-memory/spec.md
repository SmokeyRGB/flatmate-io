## Purpose

What a device may remember about signing in, and for whom. It covers the one value kept so that
A2's household field can be prefilled (*„vorbelegt, wenn das Gerät „angemeldet bleiben" hält"*),
the opt-in it depends on, and what happens on a shared device.

## ADDED Requirements

### Requirement: The device remembers only the household sign-in code, and only by opt-in

While a resident's session has `remember_me = true`, the application SHALL keep that household's
sign-in code in the browser's local storage. While a resident's session has
`remember_me = false`, it SHALL remove any stored code. The stored value SHALL be the household
sign-in code alone. A display name, account or profile id, email address, session token, or any
applicant, deliberation or vote data SHALL never be stored under this capability. No cookie SHALL
be added for it. A household-account session SHALL neither write nor remove the value. Sources: A2;
`06-Compliance-Anhang.md` §10 (the new subsection this change adds); `03-PRD.md` §6.5 (*„Nur eine
unbedingt erforderliche Sitzungs-Cookie"*, which stays true); G-B6.

#### Scenario: Join with "stay signed in" ticked
- **WHEN** a visitor joins by link with the checkbox ticked and reaches the resident frame
- **THEN** local storage holds that household's sign-in code and nothing else from this capability

#### Scenario: Sign-in with the checkbox cleared removes it
- **WHEN** a resident signs in on a device that holds a stored code, with the checkbox cleared
- **THEN** after reaching the resident frame, no code is stored

#### Scenario: No cookie is added
- **WHEN** a resident session with `remember_me = true` has reached the resident frame
- **THEN** the only cookie the application has set is the session cookie

### Requirement: The stored code survives sign-out and prefills sign-in

The stored code SHALL remain after sign-out and after the session expires. When the sign-in screen
is opened on a device that holds one, the resident side's household field SHALL be prefilled with
it and SHALL stay editable. A stored value that no longer resolves SHALL be refused like any
unknown code (identity/sign-in) and SHALL NOT be cleared automatically by the refusal.

#### Scenario: Prefill after sign-out
- **WHEN** a resident who joined with the checkbox ticked signs out and opens the sign-in screen's
  resident side
- **THEN** the household field already shows their household's sign-in code

#### Scenario: Prefill is editable
- **WHEN** the field is prefilled and the person types a different code
- **THEN** the typed code is the one submitted

### Requirement: The form works without device storage

If the browser's local storage is unavailable, empty or throws, the sign-in screen SHALL render
and work with an empty household field, and the resident frame SHALL render without error. Sources:
P-2.

#### Scenario: Storage throws
- **WHEN** local storage access throws (private window, blocked site data)
- **THEN** the sign-in screen renders with an empty household field and sign-in by typed code works

### Requirement: A shared device hands on only the household

On a device used by several people one after another, the only value passed from one sign-in to
the next SHALL be the last household sign-in code written. A later resident of the same household
SHALL find their household prefilled and type their own name. A resident of a different household
SHALL find the other household's code, editable, and replace it on their own sign-in. Sources:
GUARDRAILS, the box *„die Identität, die auf dem Gerät zurückbleibt"* (*„Wem gehören diese Daten —
und was passiert damit, wenn sich auf demselben Gerät als Nächstes jemand anderes anmeldet?"*).

#### Scenario: Second resident of the same household
- **WHEN** resident A signs out on a shared device and resident B of the same household opens
  sign-in
- **THEN** the household field is prefilled, and the name field is empty

#### Scenario: Resident of another household
- **WHEN** a resident of household 2 signs in on a device that stored household 1's code, with the
  checkbox ticked
- **THEN** after reaching the resident frame, the device holds household 2's code
