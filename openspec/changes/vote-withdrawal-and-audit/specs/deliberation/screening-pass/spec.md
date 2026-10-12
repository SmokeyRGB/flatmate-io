## ADDED Requirements

### Requirement: The digit keys rate the current card

On a keyboard, the keys 1 to 4 SHALL rate the current card with the four values, in the order the
buttons show them (1 = „Nein" … 4 = the strongest), exactly as a tap on that button would. The
keys SHALL be ignored when:
- a modifier key is held;
- the key comes from a text field;
- the weights pop-over or any dialog is open;
- a rating is still being recorded;
- the pass shows a refusal.

The buttons SHALL stay the primary control. The keys are an addition and SHALL NOT be advertised
on the touch layout. Sources: FR-4.20, AC-4.21, F-17, `screens/rahmenwerk.md`.

#### Scenario: Rating by key
- **WHEN** the resident on card 2 presses 3
- **THEN** card 2 is rated with the third value and card 3 is shown, as after a tap on the third
  button

#### Scenario: The pop-over is open
- **WHEN** the weights pop-over is open and the resident presses 1
- **THEN** nothing is rated

#### Scenario: A rating is still pending
- **WHEN** the resident presses 2 twice quickly
- **THEN** exactly one rating is sent for the current card

## MODIFIED Requirements

### Requirement: Completion leads somewhere and nothing waits

After the last card is rated, the pass SHALL lead to the Casting tab, which shows the ranking's
place (D1) and never an empty surface. If the resident rated at least one card in that pass, the
Casting tab SHALL greet them with a short celebratory notice: „Geschafft! Deine Stimmen sind
drin." The notice praises the act. It never mentions an applicant, speed or a value, names no
count and points to no result. It slides in gently (a crossfade under reduced motion), dismisses
itself, and does not come back on reload.

Opening the pass with nothing awaiting the resident SHALL state „Nichts wartet auf dich" rather
than show an error, also when the round's only application is the resident's own. Reopening after
completion SHALL show that state. Revising after completion belongs to D2 (F5). Sources: FR-4.17,
FR-4.18, AC-4.17, AC-4.18, EC-4.1, EC-4.2, EC-4.12 (V1.1, F-7), human decisions Q-5, Q-6 and
2026-09-30 (praise), C-10.

#### Scenario: The last card
- **WHEN** the resident rates the final card
- **THEN** the Casting tab is shown with the heading „Rangliste" and the notice „Geschafft! Deine
  Stimmen sind drin."

#### Scenario: Nothing rated in the pass
- **WHEN** a pass ends because its only remaining card can no longer be rated, and the resident
  rated no card in it
- **THEN** the Casting tab is shown without the notice

#### Scenario: Reload
- **WHEN** the resident reloads the Casting tab after the notice was shown
- **THEN** the notice is not shown again

#### Scenario: Reopening
- **WHEN** the resident opens the pass again after completing it
- **THEN** „Nichts wartet auf dich" is shown

#### Scenario: Only the own application
- **WHEN** the round's only application is linked to the resident's own profile
- **THEN** „Nichts wartet auf dich" is shown, not an error
