# Spec Delta

## Purpose

How the application's user-facing text is sourced, named and rendered: that it comes from one
table rather than from the components that display it, that it is German in v0.1, and that terms
the specification has already fixed appear exactly as fixed rather than being re-invented per
screen.

## ADDED Requirements

### Requirement: User-facing text comes from one table

Every piece of text a resident or a moderating person reads SHALL be resolved from a single
key→text table. No component and no server action SHALL contain a user-facing literal. Source:
`adr/0006-stack-nextjs-postgres-drizzle.md` and `screens/rahmenwerk.md` §8.6 — *„eine
Schlüssel→Text-Tabelle […], kein Text inline im Code"*.

This is a structural requirement rather than a translation one: v0.1 ships one language, and the
table exists so that the second one does not require touching every screen.

#### Scenario: A screen renders text it does not contain
- **WHEN** any screen is rendered
- **THEN** every string it displays is resolved from the table, and the screen's own source holds
  none of them

#### Scenario: An error shown in a form comes from the table
- **WHEN** a server action returns an error for display
- **THEN** what reaches the form is resolved from the table, not composed in the action

#### Scenario: A missing key is caught before it ships
- **WHEN** a key that the table does not define is referenced
- **THEN** the build fails rather than rendering a placeholder or an empty string at runtime

### Requirement: The application speaks German

The table SHALL hold German text, and the document SHALL declare German as its language. Source:
ADR-006 — *"v0.1 liefert nur diese `de`-Tabelle"*.

#### Scenario: The document declares its language
- **WHEN** any page is served
- **THEN** its root element declares German, so that assistive technology pronounces it correctly

#### Scenario: No English remains in front of the resident
- **WHEN** every screen and every error path is exercised
- **THEN** no English text is displayed

### Requirement: Fixed vocabulary is used exactly as fixed

Where `screens/rahmenwerk.md` §8.6 assigns a UI word to a model term, the table SHALL use that word
and no synonym. The binding entries include: `moved_out` → **„Ausgezogen"**; the hard removal of
U-27 → **„Entfernen"**; `join_code` → **„Einladungslink"** / **„Beitrittscode"**; invalidating a
join link → **„Löschen"**, never *„Widerrufen"* and never *„Zurückziehen"*.

Where §8.6 is silent, text is written for this change rather than derived, and §8.6 remains the
arbiter of any term it later adds.

#### Scenario: Invalidating a link is called Löschen
- **WHEN** the action that invalidates a join link is displayed
- **THEN** it reads „Löschen", and neither „Widerrufen" nor „Zurückziehen" appears anywhere

#### Scenario: The two ways of removing a member stay distinct
- **WHEN** the reversible and the permanent removal are both displayed
- **THEN** the first reads „Ausgezogen" and the second „Entfernen", per U-27's deliberate
  distinction

### Requirement: No model term reaches a resident untranslated

No text displayed to a resident SHALL contain a model term — a table name, a column name, an enum
value or a state name — that §8.6 has not translated. This applies to error text in particular.
Source: `screens/rahmenwerk.md` §12, which makes it an accessibility requirement: *„Fehlertexte
ohne Fachjargon […] dürfen keine Modellbegriffe ohne Übersetzung (§8.6) enthalten"*.

#### Scenario: A failed action explains itself in plain words
- **WHEN** an action fails for a reason the resident can act on
- **THEN** what they read names the problem in ordinary German and contains no identifier from the
  data model

### Requirement: An internal failure is not narrated to the resident

Where a failure originates outside the application's own vocabulary — a third-party authentication
service, or an unexpected internal error — the text shown SHALL be one the table defines, not the
message the failure carried. The original SHALL still reach the log.

Two reasons: such a message is written for a developer, and a third-party one cannot be translated
at all because its wording is not ours to control.

#### Scenario: A third-party authentication failure
- **WHEN** the authentication provider rejects a sign-in with its own message
- **THEN** the resident reads text from the table, and the provider's message appears only in the log

#### Scenario: An unexpected internal error
- **WHEN** an error arises that no path anticipated
- **THEN** the resident reads a general failure text from the table rather than the error's own
  message
