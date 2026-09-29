## Purpose

How an application enters the system by hand. It covers who may capture one and into which round,
what the stored record holds (both axes of S-38 among them), which limits apply, how the Art. 14
duty and its text reach the moderator before saving, what the audit trail records, and who may
read the saved record. Sources: `docs/backlog/requirements/F3-requirements.md` (V1.1) FR-3.1–3.13,
AC-3.1–3.12, C-3.14; `03-PRD.md` §4.1.3; `06-Compliance-Anhang.md` §4.4/§4.5; screen O3.

## ADDED Requirements

### Requirement: Only a resident profile holding `create_application` captures, and only into an open round

An application SHALL be created only by a session with a resident profile acting whose membership,
at the moment of the write, is not revoked and holds `create_application`, either through the
`moderator` role or granted individually. The round SHALL be one of the session's own household,
and SHALL be `open` at the moment of the write. The permission and the round state SHALL be
checked where the write happens, not only where the form is shown, so a membership revoked or a
round closed while the form was open is refused at save. Sources: FR-3.1 (*"against an **open**
casting round"*), AC-3.4, AC-3.5 (*"by any route"*), EC-3.9, S-50.

#### Scenario: A moderator captures without being granted anything
- **WHEN** a resident profile in the `moderator` role saves an application into an open round
- **THEN** the application is created

#### Scenario: The way to capture is offered only to those who may capture
- **WHEN** a round's page is shown to a session that does not hold `create_application`, or for a
  round that is not open
- **THEN** it shows no way to the capture form

#### Scenario: A plain resident who types the address is refused
- **WHEN** a resident profile in the `member` role without `create_application` opens the capture
  form by typing its address, submits it, or calls the capture directly
- **THEN** no form is shown, no application is created, and the refusal names a missing permission

#### Scenario: A granted member can capture
- **WHEN** a member has been granted `create_application` individually
- **THEN** its capture succeeds and its role is still `member`

#### Scenario: The household account is refused before anything is read
- **WHEN** a session without a resident profile attempts a capture
- **THEN** it is refused as requiring a resident profile, before any database query runs, and the
  database refuses the same insert by direct SQL under the application role

#### Scenario: No round is open
- **WHEN** the capture form is opened for a round that is not `open`
- **THEN** no form is shown, and the screen states that applications are captured only in an open
  round and offers the way back to the round

#### Scenario: The round closes while the form is open
- **WHEN** the round leaves `open` after the form was loaded and before it is saved
- **THEN** the save is refused with the reason that the round is no longer open, and the typed
  values stay in the form

#### Scenario: A round close in flight is waited for
- **WHEN** a transaction changing the round's status is uncommitted while a capture runs
- **THEN** the capture waits for it and decides on the committed status

#### Scenario: A membership revoked in flight is waited for
- **WHEN** a transaction revoking the capturing membership is uncommitted while a capture runs
- **THEN** the capture waits for it and, once it commits, is refused as missing the permission

#### Scenario: Another household's round
- **WHEN** a capture names a round id belonging to another household
- **THEN** it is refused exactly as a round that does not exist

#### Scenario: The database keeps an application in its own household's round
- **WHEN** an application row is inserted or updated by direct SQL under the application role with
  a round id that names no round of the row's own household, whether another household's round or
  none at all
- **THEN** the database refuses the write

### Requirement: The name is the one required field

A capture SHALL require the applicant's name and SHALL accept every other field empty: age, email,
phone, other contact, message text and further attributes. A name consisting only of whitespace
SHALL count as empty. The database SHALL enforce the non-empty name for every writer. Two
applications with the same name, in the same round or captured at the same moment, SHALL both be
created with no warning. Sources: FR-3.2, FR-3.3, C-3.1, AC-3.1–3.3, EC-3.1, EC-3.10, EC-3.11.

#### Scenario: A name is enough
- **WHEN** a capture is saved with only a name
- **THEN** the application is created in state `new` and every optional field is empty

#### Scenario: The name is missing
- **WHEN** a capture is saved with the name empty or only whitespace
- **THEN** no application is created and the name field is named as missing

#### Scenario: Whitespace is refused by the database too
- **WHEN** a row whose name is only spaces, tabs or line breaks is inserted by direct SQL under the
  application role
- **THEN** the database refuses it

#### Scenario: Duplicate names
- **WHEN** two applications with the same name are captured into one round
- **THEN** both exist

### Requirement: The record states its state, its intake path and its collection source explicitly

A captured application SHALL be stored in state `new`, with `source = manual_form` set by the
system and never taken from the submission, and with `collected_from` holding exactly the value the
submission carried. Neither axis SHALL have a default anywhere, neither in the database nor in the
server. A submission without a collection source SHALL be refused, not defaulted. The collection
source SHALL never be derived from the intake path. Every application SHALL belong to a round.
Sources: FR-3.4, FR-3.6, FR-3.8, FR-3.10, C-3.2, C-3.10, AC-3.7, AC-3.11, A-3.4, C-3.11.

#### Scenario: The pre-selected value is stored explicitly
- **WHEN** a capture is saved without touching the collection source, and the stored row is read by
  direct SQL
- **THEN** `collected_from` is `data_subject` as a value, not null

#### Scenario: Two captures, two sources
- **WHEN** two applications are captured through the same form, one marked as coming from someone
  else and one not
- **THEN** one stores `third_party` and the other `data_subject`, and both store
  `source = manual_form`

#### Scenario: A missing collection source is refused
- **WHEN** a submission carries no collection source
- **THEN** no application is created

#### Scenario: The database has no default
- **WHEN** a row is inserted by direct SQL without `collected_from`, or without `source`, or
  without a round
- **THEN** the database refuses it

### Requirement: Lengths are limited and the limit is visible before it is reached

The fields SHALL be limited as C-3.14 sets:
- name: 1–200 characters after trimming;
- email: ≤ 254;
- phone: ≤ 50;
- other contact: ≤ 200;
- message text: ≤ 4,000;
- further attributes: at most 10, each with a label of 1–60 and a value of 1–500 characters;
- age: a whole number from 0 to 150.

Characters are counted as Unicode code points. The form SHALL show the message text's count
against its limit while typing. A value over a limit SHALL be refused and name its field. The
database SHALL enforce every limit except the per-attribute ones, which the server enforces.
Sources: C-3.14, EC-3.4.

#### Scenario: A long message is counted before the limit
- **WHEN** a message text is typed or pasted
- **THEN** its character count against 4,000 is visible before the limit is reached

#### Scenario: Over the limit
- **WHEN** a capture carries a message text of 4,001 characters
- **THEN** no application is created and the message field is named

#### Scenario: The database enforces the limits
- **WHEN** a row whose name, a contact, the message or the age exceeds its limit, or whose attribute
  list is not a list of 1–10 entries, is inserted by direct SQL
- **THEN** the database refuses it

#### Scenario: Emoji count once
- **WHEN** a message of 4,000 emoji, each a single code point, is captured
- **THEN** it is accepted

### Requirement: The collection source is visible and pre-selected

The form SHALL show, as a written statement, that the details come from the applicant: „Angaben von
der bewerbenden Person". Beside it SHALL be a single unticked checkbox, „Die Angaben stammen nicht
von der Person selbst (z. B. jemand hat sie euch empfohlen)". The form SHALL submit the collection
source explicitly whether or not the box is ticked. Sources: FR-3.9, AC-3.6, `03-PRD.md` §4.1.3,
`rahmenwerk.md` §8.6.

#### Scenario: The form is displayed
- **WHEN** the capture form is displayed
- **THEN** the statement is visible, the checkbox is unticked, and the value the form would submit
  is `data_subject`

### Requirement: A third-party source shows the duty and the text before saving, and nothing is sent

When the checkbox is ticked, the form SHALL show before saving:
- that the applicant must be informed at the latest with the household's first message to them,
  and at the latest one month after capture;
- the one-month date, as a date;
- the Art. 14 text of `06-Compliance-Anhang.md` §4.5 (*Variante Dritterhebung*).

The text SHALL be filled with the applicant's name, the household's name and the categories of data
actually entered, never a list that claims more than is filled in. It SHALL be editable before
copying and copyable with one action. Its `[Link]` placeholder SHALL be accompanied by a plain
statement that no privacy page exists yet to link to. The edited text SHALL NOT be stored or sent to the server. No
control anywhere SHALL send the text or contact the applicant. Sources: FR-3.11, FR-3.12, FR-3.13,
AC-3.8, AC-3.10, C-3.9, S-16, Compliance §4.5 (four rules on the wording, and the date beside the
text).

#### Scenario: Ticking the box
- **WHEN** the checkbox is ticked on the capture form
- **THEN** both deadlines, the one-month date and the filled-in text appear before saving

#### Scenario: Categories follow the fields
- **WHEN** only a name and a phone number are filled in
- **THEN** the text's categories name the name and the phone number and nothing else

#### Scenario: No send action
- **WHEN** the text is displayed
- **THEN** a copy action exists and no send, share or email action exists

#### Scenario: Unticking the box
- **WHEN** the checkbox is ticked and then unticked
- **THEN** the duty and the text disappear, and the form submits `data_subject`

### Requirement: The form offers no structured field for special categories

No input of the capture form SHALL be a structured field for health, religion, ethnic origin,
sexuality, political opinion or trade-union membership, in any language. This holds for every
input's name and every visible label. Sources: FR-3.5, AC-3.12, C-3.3, G-F3.

#### Scenario: Every input is enumerated
- **WHEN** every input of the rendered capture form is enumerated with its name and label
- **THEN** none matches the special-category blocklist the data-inventory gate uses

### Requirement: A capture is audited without its content

Every capture SHALL write, in the same transaction, one append-only audit entry of type
`application.created`. The entry names the application, the acting account and the acting
profile, and its payload holds only the intake path and the collection source, never the name, a
contact, the message or an attribute. A capture that is refused SHALL leave no audit entry.
Sources: FR-3.7, G-D7.

#### Scenario: The audit entry after a capture
- **WHEN** an application is captured
- **THEN** exactly one `application.created` entry exists for it, naming the account and the
  profile that acted, and its payload holds exactly the intake path and the collection source

#### Scenario: A refused capture
- **WHEN** a capture is refused for any reason
- **THEN** neither an application nor an audit entry is written

### Requirement: After saving, the moderator lands where the next step is

After a capture with the applicant as source, the moderator SHALL return to the round with a short
success notice. After a capture with a third-party source, the moderator SHALL land on the
application's detail, which shows the application's details, the duty with the one-month date
counted from the capture, and the copyable text. So the duty and its text appear in the same step
as the capture. Sources: screen O3 „Nach dem Speichern", F3 R-3.2, FR-3.12 („afterwards from the
application"), AC-3.9.

#### Scenario: Saved from the applicant
- **WHEN** a capture with `data_subject` is saved
- **THEN** the round's page is shown with a success notice

#### Scenario: Saved from a third party
- **WHEN** a capture with `third_party` is saved
- **THEN** the application's detail is shown with the duty, the date counted from the capture, and
  the copyable text

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

### Requirement: The capture screen has its four states, and a refusal never echoes what was typed

The capture screen SHALL show:
- a loading state shaped like the form;
- the no-open-round state of the first requirement;
- a permission state that says why capture is not available and who can help (the household's
  moderation);
- an error state that keeps every typed value in the form.

A refused or failed save SHALL NOT send the typed values back from the server. They stay in the
browser, so they appear in no server response and no development log of the action's state.
Sources: G-N6, screen O3 „Abweichende Zustände", AC-3.5, F2 lesson (`next dev` logs a server
action's previous state in full).

#### Scenario: No permission
- **WHEN** a member without `create_application` opens the capture form
- **THEN** no form is shown, and the screen says that the moderation, or someone with the right,
  captures applications

#### Scenario: A refused save keeps the values
- **WHEN** a save is refused
- **THEN** every value typed so far is still in the form, and the server's response carries only
  a refusal code and at most a field name

#### Scenario: A database refusal carries no value
- **WHEN** the database refuses the write of a capture
- **THEN** the error that reaches the server action, and anything it logs, names at most the refusal
  code, the SQLSTATE and the constraint, and none of the values typed
