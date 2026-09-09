# F1 — Open a casting round for the rooms you are actually casting for

> **Band:** `v0.1` · **Scope lines:** S-01, S-02, S-04, S-06, S-07, S-35
> **Screens:** A1 Household registration · **O1 Organisation dashboard ⚡** · O2 Create round ·
> O14 Rooms · O20 Household settings

---

## MVP backlog item

**Feature:** Open a casting round for named rooms, with a frozen list of who may vote.

**User problem:** A casting starts as a message in a group chat. Nobody can say which rooms are
actually being cast for, who is taking part, or which rules apply — so every later question
("who still has to vote?", "does this count?") gets re-litigated from scratch.

**Expected outcome:** One round exists as a real object. It names its rooms, it knows who may
vote, and it froze its own rules at the moment it opened — so the ranking that comes out of it
cannot be argued away afterwards.

**Description:** A household registers with email and password. From that account a moderator
creates `ResidentProfile`s, defines `Room`s, and opens a `CastingRound`. Opening the round takes
a snapshot of the eligible voters (`RoundParticipation`) and freezes the voting rules
(`settings_snapshot`). Rooms carry their own state, so filling one does not end the round.

---

## Epic readiness

**What problem are we solving?** A casting round has no home and no boundaries, so its outcome
has no standing.

**For whom?** The moderating resident — a resident wearing a second hat, not a separate persona.
`07-Screen-Inventar.md` puts 20 of 41 screens on the Organisation surface, and almost all of them
are this person's work.

**What changes if we succeed?** Every later feature has something to hang off. The participation
denominator becomes a real number instead of a guess, which is what makes **E-24** measurable at
all.

**What are we *not* doing?** No room plans, floor plans, rent amounts or tenancy agreements
(S-07 out-of-scope). No organisations above households, no SSO, no ownership transfer as its own
mechanism (S-01). No role hierarchy or freely definable roles (S-04). No parallel rounds offered
in the UI — technically permitted, deliberately not surfaced.

---

## Activities → Steps → User stories

### Activity 1 — Register the household

**Steps:** enter email and password → read the shared-address note → account exists

- As a household, I want to **register with an email and a password**, so that there is one
  account that owns the rooms and the join code.
- As a household, I want to be **told that this address is shared with my flatmates** before I
  use my private one, so that I do not discover it later.

### Activity 2 — Become a resident yourself

**Steps:** create own `ResidentProfile` → switch identity → act as a resident

- As the household account, I want to **create a `ResidentProfile` for myself**, so that I can
  take part in the casting and not only administer it.
- As the household account, I want to **switch between administration and my resident identity**,
  so that it is always clear which hat I am wearing when I act.
- As a household, I want to **understand that the admin account cannot vote**, so that I do not
  wait for a vote that will never arrive.

### Activity 3 — Define the rooms

**Steps:** add rooms → give each a state

- As a moderator, I want to **add the rooms we are casting for**, so that the round matches
  reality.
- As a moderator, I want each room to **carry its own state**, so that filling one room does not
  end the round for the others.

### Activity 4 — Open the round

**Steps:** name the rooms in scope → open → snapshot voters → freeze rules

- As a moderator, I want to **open a round for the rooms we are actually casting for**, so that
  nobody votes on a room that is not available.
- As a resident, I want to **see who is taking part in this round**, so that "5 of 7" means
  something.
- As a moderator, I want the **voting rules frozen when the round opens**, so that the ranking
  cannot be recomputed under different rules afterwards.
- As a moderator, I want **changes to the voting procedure blocked while a round is open**, or
  loudly logged if they happen through an administrative path, so that no result is disputable
  after the fact.

---

## What the implementation must get right

**`CastingRound.status`** is deliberately thin: `draft` · `open` · `paused` · `closed` ·
`archived`. Process phases live per `Application`, not per round. Do not add round-level phase
states.

**`Room.status`**: `planned` · `open` · `promised` · `occupied` · `on_hold` · `not_available`.

**`RoundParticipation`** is one row per profile per round, with `can_vote` and a `source` of
`snapshot_at_open` or `added_manually`. It carries round visibility (**V-2**) and it is the
**denominator** for both participation and quorum.

**`settings_snapshot`** freezes `scale_weights`, `quorum_share`, `hide_results_until_voted` and
the favourite-budget settings at open. **F5's scoring reads the snapshot, never the current
`HouseholdSettings`.** This is the single most commonly mis-implemented detail in the chain.

**S-50 — the administration boundary.** An account without an active `ResidentProfile` reaches
household administration only: rooms, members, join code, procedure rules, retention. It does
**not** reach `CastingRound`, `Application`, `Slot`, `Appointment` or `CastingNote`. Two named
exceptions stay with administration: retention actions, and subject-access **export without
insight into contents**. This is about accountability, not access protection — whoever knows the
household credentials can still create a profile and act. Build it anyway; it is cheapest while
there is only one surface.

**S-04 — permissions are orthogonal, not hierarchical.** `Membership` carries `is_resident`
(voting eligibility) and `role`, plus individually assignable permissions. Do not build a role
hierarchy.

---

## Risks

| Risk | Consequence | Handling |
|------|-------------|----------|
| The snapshot is taken lazily instead of at open | Someone joining mid-round silently changes the denominator, and the ranking moves with no visible cause — **P-3** violated | Write `RoundParticipation` rows in the same transaction as the `draft → open` transition |
| `settings_snapshot` is read through to live settings | Changing a weight retroactively rewrites every score | Copy the values, do not reference them. Cover it with a protected test |
| Admin-only account is used to run the whole casting | S-50 blocks it, and the household concludes the product is broken | Make the "create yourself a resident profile" step part of the registration flow, not a setting buried in administration |
