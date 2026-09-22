# identity/join Specification

## Purpose
Redeeming a join link: what a visitor is shown before they are asked for anything, what exactly two
fields buy them, what a completed join creates and records, how a refusal reads, what happens to
somebody who already belongs here or belongs somewhere else, how long staying signed in lasts, and
the limit on how often this route will check a code at all. The link is the household's only
remaining access control (C-2.4), and this is the one route that exposes it to the public.

## Requirements

### Requirement: The household is named before anything is asked

Opening a valid join link SHALL display the household's name before any field is requested, so that
a visitor can tell they are joining the right household before they type. That name SHALL be one
the household chose for itself, not a value the system supplied on its behalf — a name every
household shares identifies none of them, and recognition is the whole purpose the name serves
here. Resolving the link SHALL NOT consume one of its redemptions. Sources: FR-2.9, AC-2.1;
`screens/A-zugang.md` A3 (*„Haushaltsname zur Bestätigung"*).

#### Scenario: The name precedes the form
- **WHEN** a visitor opens a valid join link
- **THEN** the household's name is displayed and no field has yet been requested

#### Scenario: The name is the household's own
- **WHEN** two different households each issue a link and a visitor opens both
- **THEN** each shows the name its own people chose, and neither shows a name the system picked

#### Scenario: Looking does not spend
- **WHEN** a valid link is opened any number of times without a join completing
- **THEN** its count is unchanged and it stays usable

### Requirement: A link bound to a prepared profile claims it instead of creating one

A join link MAY name a prepared resident profile. Redeeming such a link SHALL claim that profile —
making it active and giving it an account and a membership — and SHALL NOT create a second profile.
Redeeming a link that names no profile SHALL create one, as before. The visitor SHALL be greeted by
the named profile's display name before any field is requested, and SHALL be asked only for a
password, because the name is not theirs to choose. There SHALL be no other way to claim a prepared
profile. Sources: FR-2.18; C-2.4 (the link is the household's only access control); the human
decision of 2026-09-22.

Claiming previously required no secret: the password typed was the one the account was created
with, and the household id is explicitly not a security boundary (C-1.4). Requiring the link is what
closes that.

#### Scenario: A bound link greets by name and asks only for a password
- **WHEN** a visitor opens a link bound to a prepared profile
- **THEN** that profile's display name and the household's name are shown, and the only field
  requested is a password

#### Scenario: Redeeming a bound link claims the named profile
- **WHEN** a visitor completes a bound link's form
- **THEN** the named profile is active and has an account and a membership, and no second profile
  was created

#### Scenario: A neutral link still creates a profile
- **WHEN** a visitor redeems a link that names no profile
- **THEN** a new resident profile is created from the name they chose

#### Scenario: A bound link is spent by the claim
- **WHEN** a bound link has been redeemed once
- **THEN** every later attempt on it is refused, indistinguishably from any other spent link

#### Scenario: There is no other route to a prepared profile
- **WHEN** somebody knows a household's id and a prepared profile's display name but holds no link
- **THEN** they cannot claim that profile

### Requirement: Two fields are enough, and the third is visibly optional

The join form SHALL require exactly two fields — display name and password — and SHALL offer an
email field that is visibly optional and may be submitted empty. No third required field SHALL be
added, including a password confirmation. Where the password field enforces any requirement, that
requirement SHALL be visible in or beside the field before a submission is rejected for it.
Sources: FR-2.10, FR-2.10a, FR-2.11, C-2.1, AC-2.2, AC-2.3, AC-2.20.

#### Scenario: Two fields and an empty email complete a join
- **WHEN** a visitor submits a display name and a password with the email field empty
- **THEN** the join succeeds and no error refers to the email

#### Scenario: The password rule is readable before it bites
- **WHEN** the join form is displayed and the password field enforces a requirement
- **THEN** that requirement is readable without submitting first and without failing once

### Requirement: An email given at join is stored unverified and blocks nothing

An email address supplied at join SHALL be stored without being verified, and its unverified state
SHALL NOT prevent the resident from doing anything the product lets a resident do. No content SHALL
be delivered to an unverified address. Sources: FR-2.11, FR-2.15, FR-2.16, AC-2.10, AC-2.11.

#### Scenario: An unverified address is not a gate
- **WHEN** a resident joins with an email address and that address is never verified
- **THEN** their membership is active and nothing they may do is withheld pending verification

### Requirement: A join creates the resident and lands them on Start

A successful join SHALL create the account, the resident profile in its active state and the
membership, and SHALL place the resident on the Start screen — never on an intermediate screen and
never directly in a screening run. Sources: FR-2.18, AC-2.2; `screens/A-zugang.md` A3
(*„Direkt danach: **immer Start (B1)**"*).

#### Scenario: One submission produces a member
- **WHEN** a visitor completes the join form on a valid link
- **THEN** an account, an active resident profile and a membership exist for them, and they are on
  Start

#### Scenario: No intermediate step
- **WHEN** a join succeeds
- **THEN** no verification step, passkey enrolment or confirmation screen is interposed before Start

### Requirement: A join is recorded, and attributed to the link it was made with

Every successful join SHALL raise the count of the link it used by exactly one, SHALL record which
link that was, and SHALL produce one append-only audit entry naming the new resident profile and the
time of joining. Neither the record nor the audit entry SHALL contain the code. Sources: FR-2.6,
FR-2.19, AC-2.19, AC-2.26, **G-A5**.

#### Scenario: The audit answers who and when
- **WHEN** a join succeeds and the audit record is inspected
- **THEN** it names the new resident profile and the time of joining, and carries no code

#### Scenario: The link knows who came through it
- **WHEN** two residents join through the same link
- **THEN** that link's count is two and it names both of them, including after it is used up or
  deleted

#### Scenario: The count rises exactly once per join
- **WHEN** one resident joins
- **THEN** the link's count rises by one, not by two and not by zero

### Requirement: A refused join says one thing and names a way back

A join refused because the link is expired, used up, deleted or never existed SHALL produce exactly
one message, identical in all four cases, that does not name the reason, and SHALL direct the
visitor to ask a flatmate for a current link. The link SHALL be validated again at submission, not
only when it is opened. Sources: FR-2.7, FR-2.8, AC-2.7, AC-2.8, AC-2.9, EC-2.7, EC-2.9.

#### Scenario: Four causes, one message
- **WHEN** one link is expired, another used up, another deleted, and another never existed
- **THEN** all four refusals read character-for-character the same and none names a cause

#### Scenario: The refusal is not a dead end
- **WHEN** a visitor is refused
- **THEN** they are told to ask a flatmate for a current link

#### Scenario: A link deleted mid-registration is refused at submit
- **WHEN** a visitor opens a valid link, and it is deleted before they submit
- **THEN** the submission is refused with the same single message and no account is created

### Requirement: A display name already taken in the household is refused

A join SHALL be refused when the chosen display name is already in use in that household by a
profile that has not moved out, SHALL say so inline, and SHALL invite the visitor to choose another
name. The name SHALL be trimmed of surrounding whitespace before the comparison; letter case SHALL
NOT be folded. Sources: AC-2.17, C-2.6, EC-2.11; `domain/identity.md` §2.1
`ResidentProfile.display_name`.

#### Scenario: A taken name is refused with a way forward
- **WHEN** a household has an active resident named "Jonas" and a visitor submits "Jonas"
- **THEN** the join is refused inline and the visitor is invited to choose another name

#### Scenario: Whitespace does not make a new name
- **WHEN** a visitor submits " Jonas "
- **THEN** it is treated as a collision with "Jonas"

#### Scenario: Case is not folded
- **WHEN** a visitor submits "jonas" and an active resident is named "Jonas"
- **THEN** the two are different names and the join is not refused for collision

### Requirement: A redemption is spent only by a join that completes

Claiming a redemption and creating the resident SHALL be one indivisible step. Where any part of a
join fails, the attempt SHALL leave no account, resident profile or membership behind, SHALL leave
no credentials anyone can sign in with, and SHALL NOT contribute to the link's count. The count
SHALL NOT be decremented by any path: a failed attempt never contributes to it in the first place.
Two attempts competing for the last remaining redemption SHALL still resolve to exactly one
success. Sources: EC-2.1, FR-2.4, FR-2.6; `domain/identity.md` §2.1 (the count is never reset).

#### Scenario: A failed join leaves nothing behind
- **WHEN** any part of a join fails
- **THEN** no account, resident profile or membership from that attempt exists, and nothing created
  by it can be signed in with

#### Scenario: A failed join does not spend the link
- **WHEN** a join fails
- **THEN** the link's count is what it was before the attempt, and the link is still usable if it
  was usable before

#### Scenario: The count is never rewound
- **WHEN** the link's count is inspected over its whole life
- **THEN** it only ever rises, and no path lowers it

#### Scenario: Two attempts on the last redemption
- **WHEN** two visitors submit the same single-use link at the same moment
- **THEN** exactly one becomes a member, the other is refused, and the count is one — never two

### Requirement: Staying signed in is a server-side lifetime

The join form SHALL offer a "stay signed in on this device" choice, selected by default and
clearable. Clearing it SHALL produce a session whose **server-side** lifetime is short — twelve
hours — rather than a cookie that merely disappears when the browser closes. Leaving it selected
SHALL produce the long-lived session. Sources: FR-2.12, AC-2.6, EC-2.10; `domain/identity.md` §2.1
`Session.expires_at`.

A session cookie has no server-side expiry: closing the browser would discard the cookie while
leaving the session valid for anyone holding the token.

#### Scenario: The box is pre-selected and clearable
- **WHEN** the join form is displayed
- **THEN** the "stay signed in" choice is selected and can be cleared

#### Scenario: Cleared means twelve hours, server-side
- **WHEN** a visitor clears the choice and joins
- **THEN** the stored session expires twelve hours later and is not valid beyond that, whatever the
  browser did with its cookie

#### Scenario: Left selected means the long session
- **WHEN** a visitor leaves the choice selected and joins
- **THEN** the stored session carries the long lifetime

### Requirement: Nothing is asked of a joiner before their first vote

No app-install prompt and no element that asks for an email address SHALL appear in the join form or
on any screen between joining and the resident's first vote. No passkey enrolment SHALL be offered
during joining. The optional, emptily-submittable email field of FR-2.11 is not such an element.
Sources: FR-2.13, FR-2.14, C-2.2, AC-2.4, AC-2.5; `03-PRD.md` §4.1.1.

#### Scenario: The path is clean end to end
- **WHEN** a resident traverses every screen from the join form to their first vote
- **THEN** no install prompt and no request for an email address appears on any of them

#### Scenario: No passkey at join
- **WHEN** the join form is displayed
- **THEN** no passkey enrolment is offered

### Requirement: Someone who already belongs is not made to join again

A visitor who opens a join link while already signed in as a member of that household SHALL NOT get
a second account or profile; they SHALL be taken to Start and told they are already a member. A
visitor signed in as a resident of a **different** household SHALL be refused with an explanation.
Sources: EC-2.4, EC-2.5, A-2.4.

#### Scenario: An existing member follows the link
- **WHEN** a signed-in member of this household opens its join link
- **THEN** no second account or profile is created and they are taken to Start with a note that
  they are already a member

#### Scenario: A resident of another household follows the link
- **WHEN** a signed-in resident of a different household opens this link
- **THEN** the join is refused with an explanation, and it is not the invalid-link message

### Requirement: The route limits how often it will check a code

The number of code-redemption attempts from one source SHALL be limited, on the route rather than on
any single link, and a limited attempt SHALL be refused **without being checked against any link**.
Sources: FR-2.28, AC-2.25, EC-2.14, C-2.12.

Checking a code is an oracle against the whole estate rather than against one household: a guess is
tested against every live link at once, so the search space divides by the number of links in
existence. This is what makes FR-2.26's short code defensible, and C-2.12 binds the two together as
one decision.

#### Scenario: Repeated guesses stop being answered
- **WHEN** one source makes repeated redemption attempts with wrong codes and reaches the limit
- **THEN** further attempts are refused without any link being consulted

#### Scenario: The limit spans the estate, not one household
- **WHEN** a source's attempts name codes belonging to different households
- **THEN** they count against the same limit

#### Scenario: A limited refusal is not an invalid-link refusal
- **WHEN** an attempt is refused for the limit
- **THEN** the visitor is told they have tried too often, and is not told that their link is invalid

#### Scenario: The limit does not persist forever
- **WHEN** a limited source waits out the window
- **THEN** it may present a code again

### Requirement: The code reaches this route in a path or a body, never a query string

On this route the join code SHALL travel only as a URL path segment or inside a request body, SHALL
NOT be assembled into any query string, and SHALL NOT appear in any log the application writes,
including when an unexpected failure is reported. Sources: AC-2.18, C-2.3, **G-A5** and its
2026-09-21 addendum (hand entry arrives by POST, and the form route needs the same redaction as the
invitation route).

#### Scenario: Neither entry path uses a query parameter
- **WHEN** a code arrives by invitation link or by hand entry
- **THEN** it is a path segment or a body field, and no query parameter carries it

#### Scenario: A failed join logs no code
- **WHEN** a join fails for any reason, expected or not, and the application's logs are inspected
- **THEN** no log line contains the code

### Requirement: Joining while a round is open joins the round

A resident who joins while a round is open SHALL become a participant of every currently open round,
marked as having joined after it opened rather than as part of the opening snapshot, and the round's
quorum denominator SHALL grow accordingly. Joining when no round is open SHALL succeed and SHALL NOT
be treated as an error. Sources: EC-2.2, EC-2.3; F1 FR-1.18 as revised 2026-09-17.

#### Scenario: A round in progress gains the new resident
- **WHEN** a resident joins while a round is open
- **THEN** they are a participant of that round, marked as having joined after it opened

#### Scenario: No open round is not an error
- **WHEN** a resident joins and no round is open
- **THEN** the join succeeds and Start says that no round is running
