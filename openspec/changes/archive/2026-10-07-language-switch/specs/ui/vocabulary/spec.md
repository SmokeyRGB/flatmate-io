## RENAMED Requirements

- FROM: `### Requirement: The application speaks German`
- TO: `### Requirement: The application speaks the viewer's language`

## MODIFIED Requirements

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

## ADDED Requirements

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
