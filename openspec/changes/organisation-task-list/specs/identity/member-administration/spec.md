# Spec Delta

## ADDED Requirements

### Requirement: Adding a resident offers their invitation at once

When a caller who holds both `create_resident_profile` and `manage_join_codes` adds a resident
profile on the members screen, that profile's single-use bound invitation SHALL be issued as part of
the same action and shown on the new profile's entry, with its link and code ready to copy. A caller
without `manage_join_codes` SHALL get the profile only. If the profile is created but the invitation
cannot be issued, the profile SHALL remain and SHALL offer issuing its invitation, as it does today.
Sources: FR-2.1, FR-2.4; `screens/O-organisation.md` O16; persona walkthrough 2026-10-12 (adding a
person and inviting them were two steps, the second never found).

#### Scenario: Add and invite in one step
- **WHEN** the household account adds a resident named "Alex"
- **THEN** Alex's entry shows a single-use invitation bound to Alex, with copyable link and code, without a further action

#### Scenario: No right to issue links
- **WHEN** a caller holding `create_resident_profile` but not `manage_join_codes` adds a resident
- **THEN** the profile is created and no invitation is issued

#### Scenario: The invitation fails after the profile
- **WHEN** the profile is created and issuing its invitation fails
- **THEN** the profile exists and its entry offers issuing the invitation

### Requirement: Residents are listed in a stable order

The members screen SHALL list resident profiles in the order they were created, oldest first, ties
broken by a stable key, so that the list does not reorder between views. Sources:
`screens/O-organisation.md` O16; persona walkthrough 2026-10-12 (three new profiles appeared in an
unexpected order).

#### Scenario: Three profiles added in turn
- **WHEN** profiles "Alex", "Jonas" and "Mia" are added in that order
- **THEN** the members screen lists them as Alex, Jonas, Mia on every view
