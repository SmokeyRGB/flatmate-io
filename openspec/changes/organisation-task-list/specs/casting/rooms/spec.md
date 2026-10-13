# Spec Delta

## Purpose

The rooms screen (O14): the household's rooms, their state, and the actions on them, written on
first touch and covering only the requirements this change makes observable.

## ADDED Requirements

### Requirement: Each room state change is a named action

The rooms screen SHALL show each room's current state and SHALL offer every state change that room
may make as its own action, each named by what it does (for example making a planned room free for
the search, or pausing the search for it). It SHALL NOT offer a change the room may not make.
Changing a room's state SHALL send nothing to anyone. Sources: FR-1.9, FR-1.10, FR-1.11;
`screens/O-organisation.md` O14; persona walkthrough 2026-10-12 (a dropdown plus a separate "change
state" link left the household unsure what "Offen" would trigger).

#### Scenario: A planned room
- **WHEN** a caller holding `manage_rooms` opens the rooms screen with a planned room
- **THEN** that room shows its state and offers exactly the action that makes it free for the search

#### Scenario: An open room
- **WHEN** the room is open
- **THEN** it offers pausing the search and making it not available, and no other state change

#### Scenario: One tap changes the state
- **WHEN** the caller uses a room's named action
- **THEN** the room's state changes to that target, with no further selection

### Requirement: Removing a room asks first

Removing a room SHALL require a confirmation that names the room, and the remove action SHALL be
visually set apart from the room's other actions. Sources: FR-1.9; `09-Design-System.md`
(destructive actions); persona walkthrough 2026-10-12.

#### Scenario: Remove is confirmed
- **WHEN** the caller chooses to remove a room
- **THEN** a confirmation naming the room is shown, and the room is removed only after it is confirmed

#### Scenario: Remove is cancelled
- **WHEN** the caller cancels the confirmation
- **THEN** the room is unchanged
