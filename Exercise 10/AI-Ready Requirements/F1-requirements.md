# F1 — Open a casting round · requirements

> **Feature:** [F1 — Open a casting round for the rooms you are actually casting for](../MVP%20Backlog%20Features/F1-open-a-casting-round.md)
> **Band:** `v0.1` · **Scope lines:** S-01, S-02, S-04, S-05, S-06, S-07, S-35, S-50
> **Screens:** A1 Household registration · O1 Organisation dashboard ⚡ · O2 Create round · O14 Rooms · O16 Members · O20 Household settings
> **Status:** V1.1 · 2026-09-09
>
> **This document is `requirements.md` only — what must be built, not how.** Architecture,
> schema shape and implementation order are out of scope for this exercise (`design.md` /
> `tasks.md`). Where an existing decision constrains behaviour it appears under
> **Constraints** with its source, not as a design instruction.

---

## 1. Scope

A household account exists, creates resident profiles, defines rooms, and opens a casting round
that freezes both its voter list and its voting rules.

**In scope:** household registration · resident profile creation and identity switching ·
membership and permissions · rooms with their own state · casting round with room selection,
voter snapshot and frozen rules · procedure lock while a round is open · the administration
boundary.

**Out of scope:** room plans, floor plans, rent, tenancy agreements · organisations above
households · SSO · ownership transfer as its own mechanism · role hierarchies or user-defined
roles · parallel rounds offered in the UI · anything about applications, votes or scheduling.

---

## 2. User stories

| ID | Story |
|---|---|
| **US-1.1** | As a household, I want to register with an email and a password, so that one account owns the rooms and the join code. |
| **US-1.2** | As a household, I want to be told that this email is shared with my flatmates, so that I do not use my private address unknowingly. |
| **US-1.3** | As the household account, I want to create a resident profile for myself, so that I can take part in the casting and not only administer it. |
| **US-1.4** | As the household account, I want to switch between administration and my resident identity, so that it is always clear which hat I am wearing. |
| **US-1.5** | As a moderator, I want to add the rooms we are casting for, so that the round matches reality. |
| **US-1.6** | As a moderator, I want each room to carry its own state, so that filling one room does not end the round for the others. |
| **US-1.7** | As a moderator, I want to open a round for the rooms we are actually casting for, so that nobody votes on an unavailable room. |
| **US-1.8** | As a resident, I want to see who is taking part in this round, so that "5 of 7" means something. |
| **US-1.9** | As a moderator, I want the voting rules frozen when the round opens, so that the result cannot be recomputed under different rules. |
| **US-1.10** | As a moderator, I want changes to the voting procedure blocked while a round is open, so that no result is disputable afterwards. |
| **US-1.11** | As administration, I want one list of who belongs to the household with their status, so that the record stays accurate. |
| **US-1.12** | As a moderator, I want to read that list without being able to change it, so that responsibility stays with administration. |

---

## 3. Functional requirements

### Household and identity

- **FR-1.1** The system shall register a household from an email address and a password. Both are required.
- **FR-1.2** The registration screen shall display a notice that the email address will be shared with the household's residents, before submission.
- **FR-1.3** The system shall allow the household account to create resident profiles. Each profile has a display name.
- **FR-1.4** A resident profile's display name shall be unique within the household among profiles that are not `moved_out`.
- **FR-1.5** The household account shall be able to create a resident profile **for itself** and act as that resident.
- **FR-1.6** The system shall allow an account with a resident profile to switch between the administration context and the resident context, and shall always show which context is active.
- **FR-1.7** The household account, when acting without a resident profile, shall not be able to cast a vote.
- **FR-1.8** Membership shall carry voting eligibility and a role as **independent** attributes, plus individually grantable permissions (create applicant, change status, close round, confirm appointments).

### Resident list (administration)

- **FR-1.25** The household resident list shall show, per member: display name, join date, contact detail if present, and status.
- **FR-1.26** The resident list shall offer the actions: remove member, set `moved_out`, reactivate, and share or rotate the join code.
- **FR-1.27** The resident list and its actions shall be **fully available to administration**, **read-only to a profile with moderator rights**, and **not reachable at all — by any route —** by a profile without moderator rights.
- **FR-1.28** The resident list shall be a screen distinct from the round participant list (FR-1.19); neither shall link to the other's data.
- **FR-1.29** When administration is the only member of the household, the resident-list screen shall lead with the join-code action instead of displaying an empty list.
- **FR-1.30** Every removal, `moved_out` and reactivation on the resident list shall be recorded as an append-only audit entry naming both the account and the acting profile.

### Rooms

- **FR-1.9** The system shall allow a moderator to create, rename and remove rooms within the household.
- **FR-1.10** Each room shall have exactly one state from: `planned`, `open`, `promised`, `occupied`, `on_hold`, `not_available`.
- **FR-1.11** Changing one room's state to `occupied` shall not change the state of the casting round or of any other room.

### Casting round

- **FR-1.12** The system shall allow a moderator to create a casting round in state `draft` and select which rooms it covers.
- **FR-1.13** A casting round shall have exactly one state from: `draft`, `open`, `paused`, `closed`, `archived`.
- **FR-1.14** On the transition `draft → open`, the system shall record one round-participation entry per eligible resident profile, each marked as originating from the opening snapshot, and each carrying whether that profile may vote.
- **FR-1.15** On the transition `draft → open`, the system shall store a copy of the voting rules in force at that moment: the four rating weights, the quorum share, the hidden-results setting, and the favourite-budget settings.
- **FR-1.16** FR-1.14 and FR-1.15 shall take effect together with the state change, or not at all.
- **FR-1.17** The round-participation entries shall be the denominator for all participation and quorum displays for that round.
- **FR-1.18** The system shall allow a moderator to add a resident to an open round after opening, marked as added manually rather than from the snapshot.
- **FR-1.19** All residents taking part in a round shall be able to see a list of the round's participants, showing names only.
- **FR-1.20** The system shall record every casting-round and room state change as an append-only audit entry naming both the account and the acting profile.

### Procedure lock

- **FR-1.21** While any casting round of the household is `open`, the system shall reject changes to the rating weights, the favourite-budget factor, the quorum share and the hidden-results setting.
- **FR-1.22** If such a change nevertheless occurs through an administrative path, the system shall record it as an audit entry and display it as a notice on the affected round.

### Administration boundary

- **FR-1.23** An account acting without an active resident profile shall reach household administration only — rooms, members, join code, procedure rules, retention — and shall not reach casting rounds, applications, votes, slots, appointments or casting notes.
- **FR-1.24** Two exceptions to FR-1.23 remain available to administration: retention actions, and producing a subject-access export **without displaying its contents**.

---

## 4. Acceptance criteria

**AC-1.1 — Registration requires both fields**
Given the registration screen, when I submit with an empty email or an empty password, then the account is not created and the missing field is named.

**AC-1.2 — The shared-address notice precedes submission**
Given the registration screen, when it is first displayed, then the notice that the email will be shared with residents is visible without scrolling or interaction.

**AC-1.3 — Duplicate display name is refused**
Given a household with an active profile named "Jonas", when a moderator creates another profile named "Jonas", then creation is refused with an inline message naming the collision.

**AC-1.4 — Duplicate of a moved-out name is allowed**
Given a household whose only "Jonas" profile is `moved_out`, when a moderator creates a profile named "Jonas", then creation succeeds.

**AC-1.5 — The administration context cannot vote**
Given I am signed in and acting without a resident profile, when I attempt to cast a vote by any route, then the attempt is refused and no vote is recorded.

**AC-1.6 — The active context is always visible**
Given I have a resident profile, when I am in either context, then the interface states which context is active.

**AC-1.7 — Filling one room leaves the round running**
Given an open round covering rooms A, B and C, when room A becomes `occupied`, then the round remains `open` and rooms B and C keep their states.

**AC-1.8 — Opening a round snapshots the voters**
Given a household with 7 eligible residents and a round in `draft`, when the moderator opens the round, then exactly 7 round-participation entries exist, each marked as originating from the snapshot.

**AC-1.9 — Opening a round freezes the rules**
Given a household whose quorum share is 0.5 and a round that has just been opened, when the household later changes its quorum share to 0.7, then the open round still evaluates against 0.5.

**AC-1.10 — Snapshot and state change are atomic**
Given a round in `draft`, when opening it fails part-way for any reason, then the round is still `draft` and no round-participation entries and no frozen rules exist for it.

**AC-1.11 — A resident joining later does not change the denominator**
Given an open round with 7 participants, when an eighth resident joins the household, then the round's participation and quorum displays still divide by 7 until a moderator adds them explicitly.

**AC-1.12 — Manual addition is distinguishable**
Given an open round, when a moderator adds a resident to it, then that entry is marked as added manually and not as part of the opening snapshot.

**AC-1.13 — Procedure changes are blocked while open**
Given a round in state `open`, when I attempt to change a rating weight, then the change is refused and the reason names the open round.

**AC-1.14 — A procedure change through an administrative path is surfaced**
Given a rating weight was changed while a round was open, when any resident views that round, then a notice states that the procedure was changed, and an audit entry exists.

**AC-1.15 — Procedure changes are allowed when no round is open**
Given all rounds are `draft`, `closed` or `archived`, when I change the quorum share, then the change is accepted.

**AC-1.16 — The administration boundary holds**
Given I am acting without a resident profile, when I request a casting round, application, vote, slot, appointment or casting note by any route, then access is refused.

**AC-1.17 — Export without insight is permitted to administration**
Given I am acting without a resident profile, when I produce a subject-access export, then the export is produced and its contents are not displayed to me.

**AC-1.18 — The participant list shows names only**
Given I am a resident in an open round, when I open the participant list, then I see the participants' names and no actions, contact details or join dates.

**AC-1.19 — State changes are attributable**
Given any casting-round or room state change, when I inspect the audit record, then it names both the account and the acting profile.

**AC-1.20 — Moderator access to the resident list is read-only**
Given a profile with moderator rights, when it opens the resident list, then the list is shown and no action controls appear.

**AC-1.21 — No route reaches the resident list without moderator rights**
Given a profile without moderator rights, when it requests the resident list by any route, then the request is refused.

**AC-1.22 — The empty state leads with the join code**
Given a household where administration is the only member, when administration opens the resident list, then the join-code action is shown and no empty list is displayed.

**AC-1.23 — Removal is attributable**
Given a member is removed from the resident list, when I inspect the audit record, then it names both the account and the acting profile.

---

## 5. Constraints

- **C-1.1** The frozen voting rules must be a **copy**, not a reference to live settings. Source: `04-Domaenenmodell.md` (`CastingRound.settings_snapshot`); consumed by F5's score function.
- **C-1.2** Casting-round state is deliberately **thin** — the five states in FR-1.13 and no others. Process phases belong to the individual application, not the round. Adding round-level phase states contradicts `04-Domaenenmodell.md` §8.6, where the round's phase hint is derived and never stored.
- **C-1.3** Voting eligibility and role are **orthogonal**. No hierarchy, no role templates, no permission presets. Source: S-04, E-04.
- **C-1.4** The administration boundary (FR-1.23) is about **accountability, not access protection** — whoever knows the household credentials can create a profile and act. It must not be described anywhere as a security boundary. Source: S-50.
- **C-1.5** Authorization must be enforced independently of the client, and verified both through the application's policy layer and through direct data access. Source: S-36, `ADR-004`, `GUARDRAILS.md` **G-C7** — *"sonst ist ADR-004 eine Illusion"*.
- **C-1.6** Every personal-data field introduced here must be declared in `data-inventory.yml` with purpose, legal basis, retention and category, or the build fails. Source: S-37, `ADR-010`.
- **C-1.7** The audit log is append-only. Entries are never updated or deleted; personal payload is redacted at end of retention. Source: S-27, `ADR-003`.
- **C-1.8** Documents are written in German, identifiers in English. Source: `ADR-012`. (These exercise deliverables are English by the Exercise 10 precedent.)
- **C-1.9** The application never sends messages to applicants. Nothing in this feature may introduce outbound applicant contact. Source: S-16 out-of-scope list.
- **C-1.10** With the resident-visible list and its removal right gone (**U-22**, superseding **U-16**), only **two** of the four original structural duplicate-protection mechanisms survive: the join entry in the `ActivityEvent` feed, and the resident count in the quorum denominator. The join-link protections (**S-49**, owned by F2) are therefore a **precondition** of S-05, not an enhancement. Source: `02-SRD.md` §5.3 (S-05, S-49); `07-Screen-Inventar.md` O16.

---

## 6. Edge cases

| ID | Case | Required behaviour |
|---|---|---|
| **EC-1.1** | Opening a round with no rooms selected | Refused; the reason names the missing selection |
| **EC-1.2** | Opening a round when every covered room is `occupied` or `not_available` | Refused; a round with nothing to cast for cannot open |
| **EC-1.3** | Opening a round with zero eligible residents | Refused; the denominator would be zero and every quorum evaluation undefined |
| **EC-1.4** | Opening a round with exactly one eligible resident | Permitted. Quorum of `ceil(0.5 × 1)` = 1 is satisfiable |
| **EC-1.5** | A second round is opened while one is already open | Permitted at the data level, **not offered in the UI**: one round is marked active, others are reachable only through a round list, and any round view shows exactly one round |
| **EC-1.6** | A room is removed while a round covering it is open | Refused while the round is open; the room may be set `not_available` instead |
| **EC-1.7** | The last moderator becomes unavailable | Administration may create itself a resident profile and appoint moderators — a named actor, never direct access to deliberation content |
| **EC-1.8** | A resident is made ineligible to vote mid-round | Their round-participation entry records it; already-cast votes are unaffected by this feature (F5 governs their arithmetic) |
| **EC-1.9** | Two moderators open the same `draft` round simultaneously | Exactly one opening takes effect; exactly one set of snapshot entries and frozen rules exists |
| **EC-1.10** | Household registers with an address already used by another household | Permitted. Households are not deduplicated by email |
| **EC-1.11** | A moderator attempts to set `moved_out` on the household account's own resident profile (FR-1.5), where it is the last such profile | Refused. FR-1.27 already limits a moderator to read-only on the resident list; this names the case by which that boundary keeps EC-1.7's fallback — administration creating itself a resident profile — from being needed in the first place |

---

## 7. Risks & assumptions

### Assumptions

- **A-1.1** One household runs one casting round at a time. Parallel rounds exist for edge cases (the landlord persona, v2) and are deliberately not surfaced.
- **A-1.2** The person registering the household also lives there, so FR-1.5 is the normal path rather than an exception.
- **A-1.3** Room count is small — single digits — so no pagination, bulk import or hierarchy is needed.
- **A-1.4** The slice runs on synthetic data, so no data-processing agreement, privacy-notice page or retention automation is required **for this feature to be built**. They gate the first real household (v0.2).

### Risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| **R-1.1** | Frozen rules implemented as a reference to live settings | Changing a weight silently rewrites every historical score; the ranking becomes indefensible and **P-3** breaks | C-1.1 plus a protected test that changes a weight after opening and asserts the round is unaffected |
| **R-1.2** | The snapshot is written lazily rather than at open | The denominator drifts, the ranking moves with no visible cause | FR-1.16 atomicity, covered by AC-1.10 |
| **R-1.3** | A household tries to run the whole casting from the admin account | S-50 blocks it and the product reads as broken | Make FR-1.5 part of the registration flow, not a setting buried in administration |
| **R-1.4** | Round state accumulates process phases over time | Contradicts the derived phase hint and reintroduces the "Rundenphase" confusion the specs already removed | C-1.2, enforced at review |
| **R-1.5** | The administration boundary is described as a security feature | Creates false confidence in a control that is explicitly not one | C-1.4 applies to interface copy and documentation alike |

---

## 8. Review

**Still MVP-sized?** Yes, with one honest caveat: this is the least user-visible of the five
features and the most requirement-dense, because it establishes the round object everything else
depends on. Nothing here can be deferred without breaking F3–F5 — the frozen rules feed F5's
score, and the participant snapshot feeds every quorum display.

**Anything unclear or missing?** Two items, both deliberately left open rather than invented:

1. **Who may open a round** is expressed as a grantable permission (FR-1.8) but the default
   assignment is not specified anywhere in the spec chain. Recommend: the household account's own
   resident profile holds it initially, and it is grantable from there.
2. **Room renaming after votes exist** is not addressed by any scope line. Recommend permitting
   it — a room is a label here, not a scoring input — but it needs a decision rather than an
   assumption.

**Too complex?** The procedure lock (FR-1.21/FR-1.22) is the one part that could be argued down.
It exists because **E-25** and S-35 both require it, and because without it every ranking is
retroactively disputable — which is the legitimacy problem the product is built to solve. Keep it,
but note that FR-1.22's "administrative path" is only reachable at all because C-1.4 says the
boundary is not a security boundary.
