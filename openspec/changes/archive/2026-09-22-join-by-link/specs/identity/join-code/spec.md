# Spec Delta

## ADDED Requirements

### Requirement: A link may name the person it was issued for

A join link SHALL optionally name one prepared resident profile of its own household. A link that
names none SHALL behave exactly as every link did before. A link that names one SHALL be issued for
exactly that person, SHALL carry a maximum of one redemption, and SHALL be refused once it has been
spent, like any other exhausted link. Naming a profile SHALL NOT change anything else about a link:
its expiry, its cap, its count, its deletion and its refusal all behave identically. Sources: the
human decision of 2026-09-22; C-2.4; FR-2.5, FR-2.7.

A link is the only way a prepared profile can be claimed, which is what makes the household's link
its access control in fact and not only in principle.

#### Scenario: A moderating person issues an invitation for a prepared profile
- **WHEN** a prepared profile exists and an invitation is issued for it
- **THEN** a link is created naming that profile, valid for one redemption

#### Scenario: A named link is refused like any other once spent
- **WHEN** a link naming a profile has been redeemed
- **THEN** further attempts on it produce the same refusal as an exhausted neutral link, naming no
  cause

#### Scenario: Deleting a named link leaves its profile alone
- **WHEN** a link naming a prepared profile is deleted before anyone redeems it
- **THEN** the profile is still prepared and a new invitation can be issued for it

#### Scenario: A link names a profile of its own household only
- **WHEN** a link is issued naming a profile
- **THEN** that profile belongs to the same household as the link, and no link can name a profile
  of another household

## MODIFIED Requirements

### Requirement: A code resolves to at most one household

Presenting a code SHALL identify at most one household. A code matching no link SHALL be refused
exactly as a code matching a link that fails its limits. Source: FR-2.9 needs the household's name
before any input is requested, so this resolution SHALL be possible without consuming a redemption.

A presented code SHALL be normalised before it is looked up: upper-cased, stripped of whitespace,
and with the separator optional. A code that must be readable aloud and typeable from a note
(FR-2.26) cannot also demand exactness, so the forms a person actually produces resolve to the same
link as the one carried in the invitation URL. This is the one place casing is folded deliberately;
display names still do not fold case (EC-2.11). Sources: EC-2.15, AC-2.24, **P-1**.

#### Scenario: Looking at a link does not spend it
- **WHEN** a valid link is resolved any number of times without a join completing
- **THEN** its count is unchanged

#### Scenario: An unknown code is refused
- **WHEN** a code belonging to no link is presented
- **THEN** the attempt is refused, indistinguishably from a code that once existed

#### Scenario: A code read off a note resolves
- **WHEN** a code is presented in lower case, with a space in it and no separator
- **THEN** it resolves to the same link as the code in the invitation URL

#### Scenario: Normalisation does not invent matches
- **WHEN** a normalised code corresponds to no link
- **THEN** it is refused like any other unknown code, and normalisation never maps two different
  issued codes onto one another

### Requirement: The moderating person governs the links

The screen where links are shared SHALL display the warning that whoever holds a link can vote and
that it belongs only in direct messages to flatmates; SHALL let a moderating person issue a new
link, choosing its validity and its maximum; and SHALL list the household's links — live and dead —
each showing its remaining validity, its count against its maximum, its code, the full invitation
URL, a way to extend it and a way to delete it. Each link SHALL also name the residents who joined
through it, so the history answers *who came in through what* and not only *how many* (AC-2.26).
Administration and moderation SHALL have equal access. Sources: FR-2.2, FR-2.3, FR-2.4, FR-2.5,
FR-2.6, FR-2.29; AC-2.26; S-49; U-30 for the parity.

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
- **THEN** the screen leads with issuing a new one and still lists the dead ones (EC-2.13)

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
