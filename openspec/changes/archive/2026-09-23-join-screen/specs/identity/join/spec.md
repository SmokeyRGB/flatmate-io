## ADDED Requirements

### Requirement: A code can be entered by hand

There SHALL be a screen, reachable without any link, on which a visitor can type a join code. The
typed code SHALL be normalised exactly as a code in a link is — case folded, whitespace removed,
separator optional — and SHALL then bring the visitor to the same invitation a link to that code
would have opened, in the same shape (neutral or bound). The typed code SHALL travel in the
request body, never in a query string. An input that cannot be a code at all — wrong length after
normalisation, or containing characters no code is made of — SHALL be refused on that screen with a
hint about the code's format, SHALL NOT be checked against any link, and SHALL NOT count as a
redemption attempt; an input that could be a code SHALL NOT be judged on this screen, so that
whether it names a live link is answered only by the invitation itself, with FR-2.8's single
message. Sources: FR-2.27, US-2.15, AC-2.24, EC-2.15, FR-2.26; P-1; G-A5 and its 2026-09-21
addendum; the human decision of 2026-09-23 (a route of its own).

#### Scenario: A code read off a note is accepted
- **WHEN** a visitor types a live link's code in lower case, with a space and without the hyphen
- **THEN** they are shown that link's invitation — the household's name, and the fields that
  link's shape asks for

#### Scenario: A typed bound code greets by name
- **WHEN** a visitor types the code of a link bound to a prepared profile
- **THEN** they are greeted by that profile's name and asked only for a password, exactly as if
  they had opened the link

#### Scenario: A typed code that names no live link gets the single refusal
- **WHEN** a visitor types a well-formed code that is expired, used up, deleted or never existed
- **THEN** they see the same single invalid-link message a link would have produced

#### Scenario: Something that cannot be a code is refused on the spot
- **WHEN** a visitor submits an empty field, or a string of the wrong length or with characters no
  code uses
- **THEN** they stay on the entry screen with a hint about the code's format, and no link is
  consulted and no attempt is counted

#### Scenario: The typed code never reaches a query string
- **WHEN** a code is submitted by hand and the visitor arrives at its invitation
- **THEN** the code travelled in the request body and then as a path segment, and no URL on the way
  carried it as a query parameter

### Requirement: The join screen carries the four mandatory states

The invitation screen SHALL carry `rahmenwerk.md` §6's four states — Laden, Leer, Fehler and Keine
Berechtigung — for a neutral link and for a bound link alike, with the behaviour §6 sets as the
default unless the screen's own entry departs from it. Sources: G-N6; `rahmenwerk.md` §6;
`screens/A-zugang.md` A3.

- **Laden** SHALL be a placeholder in the shape of the content that follows, and SHALL NOT cause the
  layout to jump when the content arrives, whichever of the two shapes it turns out to be.
- **Leer** SHALL be arriving on the join path without a code: the visitor SHALL be told what
  normally appears there and offered the one sensible action, typing the code.
- **Fehler** SHALL cover the invalid link (FR-2.8's single message and its ways back), the
  rate-limited refusal, and an unexpected failure. An unexpected failure SHALL say in one plain
  sentence that joining did not work, SHALL offer to try again, SHALL assure the visitor that
  nothing was lost, and SHALL NOT show or log the failure's own text.
- **Keine Berechtigung** SHALL be a visitor signed in to a different household (EC-2.5): the screen
  SHALL say why they cannot join from here and SHALL offer the action that resolves it.

#### Scenario: Loading shows the screen's shape, not a spinner
- **WHEN** a visitor opens an invitation and its content has not yet arrived
- **THEN** a placeholder in the shape of the heading, the household line and the form's card is
  shown, and no full-screen spinner

#### Scenario: Loading does not jump into a bound link
- **WHEN** the invitation that arrives turns out to be a bound link, with one field fewer than a
  neutral one
- **THEN** the placeholder did not reserve rows the bound form does not have

#### Scenario: No code is an empty state with a way on
- **WHEN** a visitor arrives on the join path without any code
- **THEN** they are told that an invitation normally appears here and are offered a field to type
  their code

#### Scenario: An unexpected failure offers a retry and says nothing was lost
- **WHEN** the invitation fails to load, or a submission fails, for a reason no domain error
  describes
- **THEN** the visitor reads one plain sentence, an offer to try again and the assurance that
  nothing was lost, and neither the screen nor any log line carries the failure's text or the code

#### Scenario: A bound link has the same states as a neutral one
- **WHEN** a signed-in resident of another household, a rate-limited visitor, and a visitor whose
  submission fails unexpectedly each meet a bound link
- **THEN** each sees the same state they would have seen on a neutral link, differing only where
  the bound form itself differs

### Requirement: A refused submission keeps what was typed

When a join submission is refused inline — a taken name, a missing field, a password too short,
the invalid link, another household's session, the rate limit, or a failed account creation — the
form SHALL show the refusal with the name, the email and the "stay signed in" choice the visitor
made still in place. The password SHALL NOT be kept and SHALL be entered again. Keeping what was
typed SHALL NOT cause any of it to be sent back by the server or written to any log. Sources:
AC-2.17 (*"with a way forward"*); EC-2.10 (the choice is clearable, and a retry must not undo
that); `rahmenwerk.md` §6 (*„die Zusicherung, dass nichts verloren ging"*); G-B3.

A refusal that empties the field it asks the visitor to change is not a way forward.

#### Scenario: A taken name stays in its field
- **WHEN** a visitor submits the name "Jonas", an optional email and a password, and "Jonas" is
  taken
- **THEN** the refusal is shown beside the name field, "Jonas" and the email are still in their
  fields, and the password field is empty

#### Scenario: A cleared choice stays cleared
- **WHEN** a visitor clears "stay signed in" and their submission is refused
- **THEN** the box is still cleared

#### Scenario: The password is never echoed
- **WHEN** any submission is refused
- **THEN** the page returned carries no copy of the password that was submitted

#### Scenario: Nothing typed reaches a log
- **WHEN** a submission is refused and then submitted again, and the application's and the
  development server's logs are inspected
- **THEN** no log line contains the name, the email, the password or the code that was typed

### Requirement: Sign-in leads to the ways in that are not sign-in

The sign-in screen SHALL offer a visitor without an account both other ways in: founding a
household, and entering a join code by hand. Neither SHALL require knowing a URL. Sources: FR-2.27;
`screens/A-zugang.md` A1 (*„Ohne Anmeldung erreichbar"*); the change 2 deferral of 2026-09-22.

#### Scenario: Registration is reachable from sign-in
- **WHEN** a visitor on the sign-in screen wants to found a household
- **THEN** one link from that screen takes them to registration

#### Scenario: Hand entry is reachable from the resident side of sign-in
- **WHEN** a visitor on the resident side of sign-in has a code but no account
- **THEN** one link from that screen takes them to the screen where a code is typed

## MODIFIED Requirements

### Requirement: A refused join says one thing and names a way back

A join refused because the link is expired, used up, deleted or never existed SHALL produce exactly
one message, identical in all four cases, that does not name the reason, and SHALL direct the
visitor to ask a flatmate for a current link. The refusal SHALL also offer to type a code by hand,
because a link that does not open is most often a link that was damaged on its way, and the code it
carried may still be good. The link SHALL be validated again at submission, not only when it is
opened. Sources: FR-2.7, FR-2.8, FR-2.27, US-2.15, AC-2.7, AC-2.8, AC-2.9, EC-2.7, EC-2.9.

#### Scenario: Four causes, one message
- **WHEN** one link is expired, another used up, another deleted, and another never existed
- **THEN** all four refusals read character-for-character the same and none names a cause

#### Scenario: The refusal is not a dead end
- **WHEN** a visitor is refused
- **THEN** they are told to ask a flatmate for a current link, and are offered the screen where a
  code can be typed by hand

#### Scenario: A link deleted mid-registration is refused at submit
- **WHEN** a visitor opens a valid link, and it is deleted before they submit
- **THEN** the submission is refused with the same single message and the same ways back, and no
  account is created

### Requirement: Someone who already belongs is not made to join again

A visitor who opens a join link while already signed in as a member of that household SHALL NOT get
a second account or profile; they SHALL be taken to Start and told they are already a member. A
visitor signed in as a resident of a **different** household SHALL be refused with an explanation,
and SHALL be offered to sign out on the spot; signing out there SHALL end only their own session and
SHALL bring them back to the same invitation, now as a visitor who may join. Sources: EC-2.4,
EC-2.5, A-2.4; `rahmenwerk.md` §6 (Keine Berechtigung: *„Erklärung warum plus wer helfen kann"*).

#### Scenario: An existing member follows the link
- **WHEN** a signed-in member of this household opens its join link
- **THEN** no second account or profile is created and they are taken to Start with a note that
  they are already a member

#### Scenario: A resident of another household follows the link
- **WHEN** a signed-in resident of a different household opens this link
- **THEN** the join is refused with an explanation, and it is not the invalid-link message

#### Scenario: Signing out resolves it without losing the invitation
- **WHEN** that resident chooses to sign out from the refusal
- **THEN** their own session ends, no other session is touched, and they are shown the same
  invitation's form

#### Scenario: Signing in elsewhere mid-registration is met the same way at submit
- **WHEN** a visitor opens a link signed out, signs in to a different household in another tab,
  and then submits the join form
- **THEN** the submission is refused with the same explanation and the same offer to sign out, and
  no account is created
