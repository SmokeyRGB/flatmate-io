# Idea Intake: Remove-resident confirmation as a modal popup

- **Slug**: remove-resident-modal
- **Created**: 2026-09-17
- **Source**: pasted text, plus an attached screenshot of the current Members Moderation Dashboard UI
- **Type**: improvement

## Idea (as captured)

> The functionality to remove a resident in the Members Moderation Dashboard should be a button to click which opens a popup where 1. the note 'Use "Remove" only for someone ...' is shown and then 2. the name needs to be typed again to confirm deletion. that would be visually cleaner

Attached screenshot shows the current implementation: each member row (e.g. "Alex", "Sam") has an always-visible "Type \"<name>\" to confirm" text input directly under the role-toggle buttons, plus a "Remove" link below it; a single shared caution callout ("Use \"Remove\" only for someone who joined via the join code but doesn't actually live here...") sits once at the bottom of the member list, not attached to any individual row.

## Restated

Replace the members page's always-visible, per-row "type the name to confirm" remove control with a single "Remove" button per member that opens a popup/modal; the popup would surface the existing cautionary note and the typed-name confirmation step together, instead of having the confirmation input permanently visible on the page for every member at once.

## Origin & Context

- **Raised by**: the user, while reviewing the currently-implemented Members Moderation Dashboard screen.
- **Trigger**: visual review of the shipped UI (screenshot attached) — the always-visible confirmation input per row was judged visually cluttered; no functional complaint, a presentation-only observation ("that would be visually cleaner").

## First-Glance Unknowns

- [NEEDS CLARIFICATION: does this apply only to the "Remove" action, or should "Moved out" (the other destructive-weight action on the same row) move into a popup too?]
- [NEEDS CLARIFICATION: should the typed-name-match-to-enable-submit behavior stay exactly as implemented today, or is that interaction detail itself open for revision inside the popup?]
- [NEEDS CLARIFICATION: does `docs/09-Design-System.md` need a new modal/dialog/popup pattern defined first, or does one already exist that this idea should reuse? (No dialog pattern was defined during this session's two design-system passes.)]
- [NEEDS CLARIFICATION: should the shared caution callout at the bottom of the member list be removed once its text moves into the popup, kept as a standing notice, or shortened?]
