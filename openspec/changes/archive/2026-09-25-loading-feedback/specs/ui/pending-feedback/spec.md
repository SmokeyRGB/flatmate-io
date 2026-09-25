## Purpose

What a person sees while something they started is still happening: a screen loading, a form
submitting, a navigation pending. It also covers the check that holds every screen and form to it,
so that nothing a person clicks looks unresponsive.

## ADDED Requirements

### Requirement: A submitting form shows that it is working

While a form is submitting, its submit button SHALL:
- show a pending indicator inside itself;
- be disabled, so it cannot be submitted a second time;
- expose the pending state to assistive technology.

It SHALL keep its size, so nothing around it moves. The indicator SHALL NOT cover the page or any
other control. Under a reduced-motion preference, the indicator SHALL NOT animate and SHALL stay
visible. Sources: `screens/rahmenwerk.md` §6 (*„Nie Vollbild-Spinner, nie Layoutsprung"*);
`09-Design-System.md` "Feedback states"; human request 2026-09-25.

#### Scenario: Submitting shows the pending state
- **WHEN** a person submits any form
- **THEN** its submit button shows a pending indicator and is disabled until the submission ends

#### Scenario: No double submission
- **WHEN** a person, once the page is interactive, clicks a submit button a second time while the
  first submission is still running
- **THEN** no second submission is sent

#### Scenario: Focus stays where it was
- **WHEN** a person submits a form from the keyboard
- **THEN** keyboard focus stays on the submit button while it is pending

#### Scenario: Nothing moves
- **WHEN** a submit button enters or leaves its pending state
- **THEN** its size is unchanged and no other element on the screen moves

#### Scenario: Reduced motion
- **WHEN** the person's device asks for reduced motion
- **THEN** the pending indicator is shown without animation

### Requirement: Every screen has a loading state shaped like its content

Every screen SHALL have a loading state that is shown as soon as a navigation to it starts, until
its content is ready. The one exception is entering a different area of the app (after signing in,
or moving between the resident and the organisation areas): the session is checked first, and
during that check the control that was used SHALL show that it is pending instead. The loading state SHALL be a skeleton in the shape of the screen's content:
never a full-screen spinner, never a blank screen. Sources: `screens/rahmenwerk.md` §6 (Laden);
G-N6; `09-Design-System.md` "Feedback states".

#### Scenario: Navigating to a screen
- **WHEN** a person opens a screen whose content is not ready yet
- **THEN** a skeleton in the shape of that screen is shown immediately, then replaced by the
  content

#### Scenario: Entering another area of the app
- **WHEN** a person signs in, or follows a link from the resident area to the organisation area
- **THEN** the button or link they used shows a pending state until the new area appears

### Requirement: A navigation link shows that it was followed

Every navigation link SHALL show a pending hint
between the click and the moment the target's loading state or content appears. The hint SHALL
NOT move the surrounding layout. Sources: human request 2026-09-25.

#### Scenario: Following a navigation link
- **WHEN** a person clicks a navigation link and the target takes time to begin rendering
- **THEN** the clicked link shows a pending hint until the navigation proceeds

### Requirement: The rules hold for every later screen and form

The project's verification SHALL fail when a screen has no loading state, or when a form's submit
button is not the shared pending-aware button. Exceptions SHALL be few, each listed with its reason.
Sources: human decision 2026-09-25 ("needs to be done for all further changes in F3 & F4").

#### Scenario: A new screen without a loading state
- **WHEN** a change adds a screen without a loading state and it is not a listed exception
- **THEN** verification fails and names the screen

#### Scenario: A new form with a plain submit button
- **WHEN** a change adds a form whose submit button is a plain button
- **THEN** verification fails and names the file
