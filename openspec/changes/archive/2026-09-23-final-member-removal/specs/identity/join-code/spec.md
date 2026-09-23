## MODIFIED Requirements

### Requirement: The moderating person governs the links

The screen where links are shared SHALL display the warning that whoever holds a link can vote and
that it belongs only in direct messages to flatmates; SHALL let a moderating person issue a new
link, choosing its validity and its maximum; and SHALL list the household's links — live and dead —
each showing its remaining validity, its count against its maximum, its code, the full invitation
URL, a way to extend it and a way to delete it. Each link SHALL also name the residents who joined
through it, so the history answers *who came in through what* and not only *how many* (AC-2.26). A
member who was **removed** SHALL NOT be named there, since they are no longer a resident and are
hidden from the resident list too. The link's use count is unaffected. A **live** link — not deleted,
not expired, uses left — through which a removed member joined SHALL carry a caution that the
removed person may still hold it, next to its delete action, so a moderator can decide to delete it.
A dead link carries none: a used-up or deleted link can never be used again, and an expired one only
once it is extended, at which point it is live and carries the caution again. Nothing SHALL be
deleted automatically, since a reusable link may still be waiting for flatmates who have not joined
yet. Human decisions, 2026-09-22 (U-27 follow-through) and 2026-09-23 (live links only).

Live links SHALL be listed first. Dead links — expired, used up or deleted — SHALL be listed in a
section collapsed by default, whose summary states how many it holds, so the screen is not
cluttered with links nobody can use. They are still listed, with their end state and who came
through them; collapsed is not hidden. Human decision, 2026-09-23. Administration and moderation SHALL have equal access. Sources:
FR-2.2, FR-2.3, FR-2.4, FR-2.5, FR-2.6, FR-2.29; AC-2.26; S-49; U-27; U-30 for the parity.

The action that invalidates a link SHALL read **"Löschen"** — never *„Widerrufen"*, never
*„Zurückziehen"* (`screens/rahmenwerk.md` §8.6). Nothing on the screen SHALL present these limits as
security: they are social visibility (C-2.5).

#### Scenario: The warning sits where the link is copied
- **WHEN** a moderating person opens the screen
- **THEN** the warning is visible without interaction, beside the links rather than elsewhere

#### Scenario: Issuing does not edit
- **WHEN** a moderating person changes the validity and maximum fields
- **THEN** only the next link issued is affected, and no existing link's limits change

#### Scenario: A household with no live link is not an empty screen
- **WHEN** every link is deleted, expired or used up
- **THEN** the screen leads with issuing a new one and still lists the dead ones, in the collapsed
  section (EC-2.13)

#### Scenario: Both roles have the same controls
- **WHEN** either an administration account or a moderator opens the screen
- **THEN** both see the same links and the same actions

#### Scenario: A resident cannot reach any of it
- **WHEN** an account that is neither administration nor moderator requests the screen
- **THEN** no link, code or control is disclosed

#### Scenario: A used-up link still names who came through it
- **WHEN** two residents joined through a link that is now used up
- **THEN** the link is still listed, shows two of two used, and names both residents

#### Scenario: A link nobody used names nobody
- **WHEN** a link has never been redeemed
- **THEN** it is listed with a count of zero and names no resident

#### Scenario: A removed member is not named under their link
- **WHEN** two people joined through a link and one of them has since been removed
- **THEN** the link still shows two uses, and names only the one who was not removed

#### Scenario: A live link a removed member came through is flagged
- **WHEN** a removed member joined through a link that is still live
- **THEN** the link carries the caution beside its „Löschen" action, and is not deleted by the
  removal itself

#### Scenario: A dead link is not flagged
- **WHEN** a removed member joined through a link that has since been used up, deleted or expired
- **THEN** the link carries no caution

#### Scenario: Extending an expired link brings the caution back
- **WHEN** an expired link with uses left, through which a removed member joined, is extended
- **THEN** it is live again, listed among the live links, and carries the caution

#### Scenario: Dead links are collapsed
- **WHEN** a moderating person opens the screen and some links are expired, used up or deleted
- **THEN** those links sit in a section that is collapsed by default and states how many it holds,
  and opening it shows each with its end state and who joined through it

#### Scenario: Only live links are outside the collapsed section
- **WHEN** the screen lists a live link and a dead one
- **THEN** the live link is shown first and outside the collapsed section, the dead one inside it
