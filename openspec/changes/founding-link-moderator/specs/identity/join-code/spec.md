## ADDED Requirements

### Requirement: Registration issues one founding link, and the founder is pointed at it

Registration SHALL issue exactly one founding link: a neutral, single-use join link, never bound
to a profile and never a reset link. A household SHALL have at most one founding link, and no other
issuing path SHALL create one. While the founding link is unused and still valid, the join-link
list on the members screen SHALL label it as the founder's own link, SHALL say it is not to be
passed on because joining through it makes the joiner moderator, and SHALL offer it as a link the
founder can follow directly. The household account's organisation screen SHALL, in the same period,
offer to join through it in one click. Sources: FR-2.4 (single use); the human decision of
2026-10-06.

#### Scenario: A new household has one founding link
- **WHEN** a household is registered
- **THEN** it has exactly one founding link, neutral, single use, valid for seven days

#### Scenario: A link issued later is never a founding link
- **WHEN** a moderator or the household account issues another join link
- **THEN** that link is not a founding link

#### Scenario: The members screen names the founding link while it can be used
- **WHEN** the household account opens the members screen and the founding link is unused and valid
- **THEN** that link is labelled as the founder's own link, with the hint that it is only for them
  because joining through it makes the joiner moderator, and it can be followed directly

#### Scenario: A spent founding link loses its label
- **WHEN** the founding link has been used, has expired or was deleted
- **THEN** it is listed like any other link, without the founder label or hint

#### Scenario: The organisation screen offers the founder to join
- **WHEN** the household account opens the organisation screen while the founding link is unused and
  valid
- **THEN** it is offered to join the household through that link in one click, with the same hint

#### Scenario: No founding offer once it is spent
- **WHEN** the founding link has been used, has expired or was deleted
- **THEN** the organisation screen shows no offer to join
