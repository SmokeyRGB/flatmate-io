# Spec Delta

## MODIFIED Requirements

### Requirement: The stored code survives sign-out and prefills sign-in

The stored code SHALL remain after sign-out and after the session expires. When the sign-in screen
is opened on a device that holds one, the resident side's household field SHALL be prefilled with
it and SHALL stay editable: what the person types into a prefilled field SHALL replace the
prefilled code rather than being appended to it. A stored value that no longer resolves SHALL be
refused like any unknown code (identity/sign-in) and SHALL NOT be cleared automatically by the
refusal.

#### Scenario: Prefill after sign-out
- **WHEN** a resident who joined with the checkbox ticked signs out and opens the sign-in screen's
  resident side
- **THEN** the household field already shows their household's sign-in code

#### Scenario: Prefill is editable
- **WHEN** the field is prefilled and the person types a different code
- **THEN** the typed code is the one submitted

#### Scenario: Typing replaces the prefill
- **WHEN** the field is prefilled and the person focuses it and types a full code
- **THEN** the field holds only the typed code, not the prefilled code followed by it
