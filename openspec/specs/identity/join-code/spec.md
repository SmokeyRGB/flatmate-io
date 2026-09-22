# identity/join-code Specification

## Purpose
The lifecycle of a household's join links: how one is issued, how long it stays usable, how many
times it may be redeemed, how a code presented by a visitor resolves to a household, what a
moderating person can see and change, and what the record of a dead link preserves. The link is the
household's only remaining access control (C-2.4), so this capability is where its limits live.

## Requirements

### Requirement: A household holds several join links at once

A household SHALL be able to have more than one usable join link at a time, each issued separately
and each carrying its own expiry, usage limit and use count. The system SHALL never *require* a
code per person: one link shared into a group chat SHALL always be sufficient on its own. Source:
FR-2.1 as amended 2026-09-21; `domain/identity.md` §2.1 `JoinCodeIssuance`.

#### Scenario: Two links with different limits coexist
- **WHEN** a second link is issued with a different expiry and a different maximum
- **THEN** both are usable, each judged against its own limits, and redeeming one does not change
  the other's count

#### Scenario: One link is enough
- **WHEN** a household issues a single link and raises its maximum
- **THEN** every resident can join through that one link, and no per-person link is required

### Requirement: A join link expires

Every join link SHALL carry an expiry instant and SHALL be refused once it has passed, whatever its
count says. The expiry SHALL default to seven days from issue, and SHALL be extendable by a further
seven days in one action. Source: FR-2.3; **O-15** (*„mit einem Tippen verlängerbar"*).

#### Scenario: A new link is valid for seven days
- **WHEN** a link is issued
- **THEN** it expires seven days later

#### Scenario: An expired link is refused
- **WHEN** a link is presented after its expiry
- **THEN** the attempt is refused, whatever its maximum and count are

#### Scenario: Extending adds seven days
- **WHEN** a moderating person extends a link
- **THEN** its expiry moves seven days further out and nothing else about it changes

### Requirement: A join link has a usage cap and a use count

Every join link SHALL carry a maximum number of redemptions, chosen when it is issued and
defaulting to **one**, and a count of redemptions so far, starting at zero. The count SHALL rise by
exactly one per successful redemption and SHALL NOT be reset. A link SHALL be refused once its
count has reached its maximum. A maximum of **zero** SHALL mean the link is closed. Source: FR-2.4,
FR-2.6, FR-2.7.

**There SHALL be no such thing as an unlimited link.** Every link carries a maximum, always; the
field admits no absent value. A link that could be redeemed without end is the password-equivalent
without an expiry date that `domain/identity.md` §2.1 names as the reason these limits exist at all,
and it would defeat the counter, the history and the cap together. Where a household wants many
people to use one link, it raises that link's maximum — a number it chose, not the absence of
one.

#### Scenario: The suggested maximum is one
- **WHEN** a link is issued and the moderating person leaves the maximum at the value the form
  suggests
- **THEN** the link is stored with a maximum of one and a count of zero, so it permits exactly one
  redemption

#### Scenario: The count rises and stops at the maximum
- **WHEN** a link reaches its maximum through successful redemptions
- **THEN** its count equals its maximum and every further attempt is refused

#### Scenario: A maximum of zero closes the link on arrival
- **WHEN** a link is issued with a maximum of zero
- **THEN** every attempt on it is refused, and the household's other links are unaffected

#### Scenario: Every link is stored with a maximum, on every path
- **WHEN** a link is created by any path, including the founding link at household registration
- **THEN** it is stored with a maximum, and no value of that field — absent, null or otherwise —
  means "no limit"

### Requirement: A code resolves to at most one household

Presenting a code SHALL identify at most one household. A code matching no link SHALL be refused
exactly as a code matching a link that fails its limits. Source: FR-2.9 needs the household's name
before any input is requested, so this resolution SHALL be possible without consuming a redemption.

#### Scenario: Looking at a link does not spend it
- **WHEN** a valid link is resolved any number of times without a join completing
- **THEN** its count is unchanged

#### Scenario: An unknown code is refused
- **WHEN** a code belonging to no link is presented
- **THEN** the attempt is refused, indistinguishably from a code that once existed

### Requirement: A refusal discloses no reason

A refused redemption SHALL yield one outcome that does not say which cause applied — expired, used
up, deleted, or never valid. No caller SHALL be able to recover the cause from the outcome. Source:
FR-2.8 as corrected 2026-09-21.

The system *can* tell these apart, because every issued link is kept. It withholds the difference
deliberately: a stranger has not earned the reason, and naming it would say whether a code ever
existed and whether it was merely used up.

#### Scenario: Every cause produces the same outcome
- **WHEN** one code is refused for expiry, another for its cap, another for deletion, and another
  for never having existed
- **THEN** all four outcomes are indistinguishable

#### Scenario: Expiry and cap exhausted together need no precedence
- **WHEN** a link is both expired and used up
- **THEN** one refusal is produced and no rule decides which cause "wins" (EC-2.7)

### Requirement: A redemption is claimed atomically

Deciding that a link may be redeemed and recording that redemption SHALL be one indivisible step.
Where two attempts compete for the last remaining redemption, exactly one SHALL succeed. Source:
EC-2.1.

With a default maximum of one, this is the ordinary invitation rather than a rare collision.

#### Scenario: Two simultaneous attempts on a single-use link
- **WHEN** two visitors present the same single-use link at the same moment
- **THEN** exactly one succeeds, the other is refused, and the recorded count is one — never two

#### Scenario: The count never exceeds the maximum
- **WHEN** any number of attempts compete for one link
- **THEN** its count never rises above its maximum

### Requirement: A link can be deleted without disturbing anything else

Deleting a join link SHALL make it refuse every subsequent presentation, SHALL leave the
household's other links usable, and SHALL NOT affect memberships already created through it. The
deleted link SHALL remain visible in the household's history. Source: FR-2.5 as amended;
`screens/O-organisation.md` O16.

Deleting every live link achieves what rotating a single code previously did, which is why rotation
is no longer a separate mechanism.

#### Scenario: Deleting one link leaves the others working
- **WHEN** one of two live links is deleted
- **THEN** the deleted one is refused and the other still works

#### Scenario: Existing members are untouched
- **WHEN** a link through which residents joined is deleted
- **THEN** those memberships are unchanged and the link still names who joined through it

### Requirement: The code is short enough to be read aloud and typed

A join code SHALL be short, upper case, drawn from an alphabet without easily confused characters,
and set in two groups. Source: FR-2.26; **P-1 Kanalneutralität**; `domain/identity.md` §2.1, sixth
condition on the code.

#### Scenario: A code can be dictated
- **WHEN** a code is issued
- **THEN** it is short enough to read over the phone and contains no character that is easily
  mistaken for another

#### Scenario: Codes do not collide
- **WHEN** many links exist across many households
- **THEN** no two carry the same code, because a presented code is the only input to resolution

### Requirement: The moderating person governs the links

The screen where links are shared SHALL display the warning that whoever holds a link can vote and
that it belongs only in direct messages to flatmates; SHALL let a moderating person issue a new
link, choosing its validity and its maximum; and SHALL list the household's links — live and dead —
each showing its remaining validity, its count against its maximum, its code, the full invitation
URL, a way to extend it and a way to delete it. Administration and moderation SHALL have equal
access. Sources: FR-2.2, FR-2.3, FR-2.4, FR-2.5, FR-2.29; S-49; U-30 for the parity.

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

### Requirement: The join code never enters a log or a query string

A join code SHALL NOT appear in any log, including an access log, SHALL NOT be transmitted as a
query-string parameter, and SHALL NOT appear in an audit payload. Where it travels in a URL it
SHALL be a path segment. Sources: AC-2.18, C-2.3, **G-A5**.

#### Scenario: The invitation URL carries the code in its path
- **WHEN** the invitation URL is displayed or copied
- **THEN** the code is a path segment of it and appears in no query parameter

#### Scenario: Issuing and deleting are audited without the code
- **WHEN** a link is issued or deleted
- **THEN** the audit record names the action, the household and the actor, and carries no code

### Requirement: Links are scoped to their own household

A household's links SHALL be readable and writable only within that household, enforced
independently of the client. Source: C-2.10, **G-C7**.

#### Scenario: Another household cannot read them
- **WHEN** a session for one household lists links
- **THEN** no other household's link, code, expiry, maximum or count is returned

#### Scenario: Another household cannot change them
- **WHEN** a session for one household attempts to delete or extend another household's link
- **THEN** nothing changes
