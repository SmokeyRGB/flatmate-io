# Feature Specification: Remove-Resident Confirmation Dialog

**Feature Branch**: `003-remove-resident-modal`

**Created**: 2026-09-17

**Status**: Draft

**Input**: Handoff from `/speckit-assess-decide` (verdict: go) — `.specify/assessments/remove-resident-modal/decision.md`, itself the product of `/speckit-assess-intake` → `/speckit-assess-research` → `/speckit-assess-define` → `/speckit-assess-shape` on the idea: *"The functionality to remove a resident in the Members Moderation Dashboard should be a button to click which opens a popup where 1. the note 'Use "Remove" only for someone ...' is shown and then 2. the name needs to be typed again to confirm deletion. that would be visually cleaner."*

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confirm a resident removal through a focused dialog (Priority: P1)

Administration or a moderator, viewing the Members Moderation Dashboard, wants to remove a member who joined via the join code but does not actually live in the household. Today, the confirmation input for this is visible on every member row at all times; instead, clicking a "Remove" button opens a dialog that shows the existing caution ("use this only for a join-code intruder, not a real move-out") and requires typing the member's exact display name before the removal can be confirmed.

**Why this priority**: This is the entire feature. Every other behavior (cancelling, keeping the existing safety rule) exists to support this one flow safely.

**Independent Test**: Click "Remove" on a member row; confirm a dialog opens showing the cautionary explanation with the confirm action disabled; type the member's exact display name; confirm the action becomes enabled and, once activated, removes the member exactly as today (access revoked, one audit entry recorded naming both the account and the acting profile).

**Acceptance Scenarios**:

1. **Given** the Members Moderation Dashboard, **When** I click "Remove" on a member, **Then** a dialog opens containing the same cautionary explanation currently shown on the page, and the confirm action starts disabled.
2. **Given** the dialog is open, **When** I type anything other than the member's exact display name, **Then** the confirm action stays disabled.
3. **Given** the dialog is open, **When** I type the member's exact display name, **Then** the confirm action becomes enabled.
4. **Given** the confirm action is enabled, **When** I activate it, **Then** the member is removed with the same permission checks, the same access revocation, and the same audit entry as today, and the dialog closes.

---

### User Story 2 - Dismiss the dialog without changing anything (Priority: P2)

A moderator opens the removal dialog by mistake, or changes their mind partway through, and closes it without removing anyone.

**Why this priority**: A confirmation dialog that cannot be safely dismissed would force an unwanted decision — this is a baseline safety behavior, not an enhancement.

**Independent Test**: Open the dialog for a member, then close it via a visible cancel control and separately via the standard dismiss gesture, in each case without completing the typed-name confirmation; confirm the member's status is unchanged and no audit entry was recorded either time.

**Acceptance Scenarios**:

1. **Given** the dialog is open, **When** I activate its cancel control, **Then** the dialog closes and the member is unchanged.
2. **Given** the dialog is open, **When** I dismiss it without confirming (the standard dismiss gesture), **Then** the dialog closes and the member is unchanged.
3. **Given** the dialog was previously closed without confirming, **When** I reopen it for the same member, **Then** the typed-name field starts empty — nothing carries over from the earlier attempt.

---

### Edge Cases

- Given a removal request is already in progress, what happens if the confirm action is activated again before it completes? The control must stay disabled while the request is pending, preventing a duplicate removal attempt.
- Given the member's own state changes between opening the dialog and confirming (e.g. someone else already removed them), what happens on confirm? The dialog shows an inline error rather than closing silently or leaving the person without feedback.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Members Moderation Dashboard MUST NOT show a name-confirmation input for a member unless that member's "Remove" action has been explicitly activated.
- **FR-002**: Activating "Remove" for a member MUST open a dialog containing: the existing cautionary explanation of when "Remove" is appropriate, a field for typing that member's exact display name, and a confirm control.
- **FR-003**: The dialog's confirm control MUST remain disabled until the typed text exactly matches the member's current display name — unchanged from today's behavior.
- **FR-004**: Activating the confirm control MUST perform the same removal behavior as today: the same permission check (administration or moderator only), the same access revocation, and the same audit entry naming both the account and the acting profile.
- **FR-005**: The dialog MUST be dismissible without side effects, both via an explicit cancel control and via the standard dismiss gesture, leaving the member's status unchanged either way.
- **FR-006**: Reopening the dialog for any member MUST start with an empty confirmation field, regardless of what was typed during a previous, dismissed attempt.
- **FR-007**: The confirm control MUST be disabled while a removal request is in progress, preventing a duplicate submission.
- **FR-008**: If the removal request fails, the dialog MUST show an inline error rather than closing silently or leaving the user without feedback.
- **FR-009**: The "Moved out" action's presentation is unchanged by this feature — it is explicitly out of scope, per the assessment's own scoping (`decision.md`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No member row on the Members Moderation Dashboard displays an open name-confirmation input unless "Remove" has been explicitly activated for that row — verifiable by inspection, 100% of rows, 100% of the time.
- **SC-002**: 100% of member removals still require the exact display name to be typed before completing — zero regression from today's behavior.
- **SC-003**: 100% of removals continue to produce exactly one audit entry naming both the account and the acting profile — zero regression.
- **SC-004**: Cancelling or dismissing the dialog results in zero changes to the member's status, 100% of the time.

## Assumptions

- The cautionary explanation currently shown once at the bottom of the member list moves into the per-action dialog, matching the project's own design reference (the prototype already presents this interaction this way) rather than remaining a separate standing notice — a reasonable default from the assessment's research, not left open for clarification.
- The specific technical mechanism for rendering the dialog is a planning-stage decision, not fixed here; the assessment's own research and decision favored an approach that adds no new project dependency, but this specification does not mandate one.
- This feature changes presentation only. It does not alter the two-tier removal decision (`U-27`), the `manage_members` permission model, or the audit-event schema/behavior — all of that stays exactly as implemented in feature `002-f1-casting-round`.
- The "Moved out" action's presentation is intentionally unchanged (see FR-009) — moving it into a dialog as well was raised during assessment but explicitly scoped out, not decided by default.
- No performance or concurrency targets beyond today's existing behavior are introduced; this is a low-traffic, administration/moderator-only screen, per the assessment's own framing.
