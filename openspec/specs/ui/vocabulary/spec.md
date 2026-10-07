# ui/vocabulary Specification

## Purpose
How the application's user-facing text is sourced, named and rendered: that it comes from one
table rather than from the components that display it, that it is German or English, whichever the
viewer chose (`ui/language-choice`), and that terms the specification has already fixed appear
exactly as fixed rather than being re-invented per screen.
## Requirements
### Requirement: User-facing text comes from one table

Every piece of text a resident or a moderating person reads SHALL be resolved from a single
key→text table. No component and no server action SHALL contain a user-facing literal. Source:
`adr/0006-stack-nextjs-postgres-drizzle.md` and `screens/rahmenwerk.md` §8.6 — *„eine
Schlüssel→Text-Tabelle […], kein Text inline im Code"*.

This is a structural requirement rather than a translation one: each language has one such table
(German and, since language-switch, English), so adding a language never means touching every
screen.

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

### Requirement: The application speaks the viewer's language

The application SHALL speak the language its viewer chose, German or English, and German where no
choice has been made (`ui/language-choice` decides which one applies to a request). Each language
SHALL have its own table. The German table is the reference, and the vocabulary §8.6 fixes binds it.
The document SHALL declare the language it actually displays. Source: the human decision of
2026-10-07 recorded in `03-PRD.md`'s language row, which lifts the v0.1 exclusion that ADR-006's
2026-09-16 Ergänzung recorded (*„v0.1 liefert nur diese `de`-Tabelle"*).

Applicant content is never translated. Text the household entered is not either: names, room
names, free text. It is displayed as it was entered, in whatever language that was.

#### Scenario: The document declares its language
- **WHEN** any page is served
- **THEN** its root element declares the language the page is displayed in (German or English), so
  that assistive technology pronounces it correctly

#### Scenario: No English remains in front of the resident
- **WHEN** every screen and every error path is exercised by a viewer who has German, chosen or by
  default
- **THEN** no English text is displayed, apart from the language name "English" in the language
  toggle

#### Scenario: No German remains in front of an English viewer
- **WHEN** every screen and every error path is exercised by a viewer who has chosen English
- **THEN** no text from the German table is displayed, apart from the language name „Deutsch" in
  the toggle and the text addressed to people outside the app

#### Scenario: Applicant content is shown as entered
- **WHEN** a viewer with English chosen opens an application entered in German
- **THEN** the application's own content appears exactly as entered, and only the text around it is
  English

#### Scenario: Dates follow the displayed language
- **WHEN** a date is displayed
- **THEN** it is formatted by the conventions of the displayed language, not always the German ones

### Requirement: Both tables carry the same keys

The English table SHALL define every key the German table defines, and no other, with the same
shape. Where an entry takes arguments (a count, a name), the English entry SHALL take the same
arguments. A difference SHALL fail the build, not appear at runtime as a missing or German string
on an English screen.

#### Scenario: A key added only in German
- **WHEN** a key is added to the German table and not to the English one
- **THEN** the build fails and names the missing key

#### Scenario: An entry whose arguments differ
- **WHEN** an English entry takes different arguments than its German counterpart
- **THEN** the build fails

### Requirement: Text for people outside the app stays German

Text a person in the app composes or copies for someone outside it SHALL stay German, whatever
language that person has chosen. Examples are the invite message to an applicant and the text that
accompanies a join link. The language choice governs what the viewer reads in the app, not what the
household sends out in its own name. Source: the human decision of 2026-10-07 (*"it should only be
a UI thing for now"*).

#### Scenario: An English-speaking moderator copies an invite
- **WHEN** a moderator with English chosen copies the invite text for an applicant
- **THEN** the copied text is the German one, while the screen around it is English

