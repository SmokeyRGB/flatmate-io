# F2 — Join in two fields · requirements

> **Feature:** [F2 — Join in two fields, and land on the one thing to do next](../features/F2-join-in-two-fields.md)
> **Band:** `v0.1` · **Scope lines:** S-03, S-49, S-48
> **Screens:** A3 Join by code ⚡ · B1 Start ⚡ · O16 Members (where the link is shared)
> **Status:** V1.0 · 2026-09-08
>
> **`requirements.md` only — what must be built, not how.**

---

## 1. Scope

A resident receives one household link, registers with a name and a password, and lands on a
screen showing the single next thing to do.

**In scope:** the household join link and its protections · one-step registration with two
required fields · optional email added later · staying signed in · the Start screen with exactly
one primary action and its reason · the participation counter · the task precedence rule.

**Out of scope:** per-person invitations · magic-link login (rejected: not device-bound) · SMS
verification · a mandatory email field · multi-step verification · any app-install or
notification prompt in the join path · passkey during registration · redeeming an applicant
invite token (that is S-42, v0.2).

---

## 2. User stories

| ID | Story |
|---|---|
| **US-2.1** | As a moderator, I want to copy one join link for the whole household, so that I am not managing one code per person. |
| **US-2.2** | As a moderator, I want a warning where I copy the link, so that I understand that whoever holds it can vote. |
| **US-2.3** | As a moderator, I want the link to expire and to have a usage cap, so that a forwarded link does not stay open forever. |
| **US-2.4** | As a resident, I want to see which household I am joining before I confirm, so that I know the link was not a mistake. |
| **US-2.5** | As a resident, I want to join with just a name and a password, so that joining is not harder than opening WhatsApp. |
| **US-2.6** | As a resident, I want to get to my first vote without an email address, so that nothing blocks me before I have done anything useful. |
| **US-2.7** | As a resident, I want to not be asked to install anything before my first vote, so that the product does not ask me for something first. |
| **US-2.8** | As a resident, I want to stay signed in on this device, so that I do not log in again every time a round moves. |
| **US-2.9** | As a resident, I want to add an email later, so that I can recover access if I lose my password. |
| **US-2.10** | As a resident, I want to see one screen that tells me what to do next, so that I do not have to work out what the group needs. |
| **US-2.11** | As a resident, I want to see exactly one main action, so that there is no decision before the decision. |
| **US-2.12** | As a resident, I want to see "5 of 7 have voted", so that I know whether the group is waiting on me. |
| **US-2.13** | As a resident, I want to see where the round stands rather than a blank screen when nothing is open. |

---

## 3. Functional requirements

### The join link

- **FR-2.1** Each household shall have exactly one join code, shared as a link. There shall be no per-person codes.
- **FR-2.2** The share screen shall display the warning: share this link only directly with flatmates; whoever holds it can vote.
- **FR-2.3** The join code shall have an expiry timestamp, changeable by the household, defaulting to 7 days from issue.
- **FR-2.4** The join code shall have a maximum use count, changeable by the household, pre-filled with the number of residents the household still expects.
- **FR-2.5** The join code shall remain rotatable, and rotating it shall invalidate the previous code.
- **FR-2.6** Every successful join shall increment the code's use count.
- **FR-2.7** The system shall reject a join attempt when the code is expired, when its use count has reached its maximum, or when it has been rotated.
- **FR-2.8** A rejected join attempt shall state which of the three reasons applies and shall direct the visitor to ask a flatmate for a current link.

### Registration

- **FR-2.9** Opening a join link shall display the household's name before any input is requested.
- **FR-2.10** The join form shall require exactly two fields: display name and password.
- **FR-2.11** The join form shall offer an email field that is visibly optional and may be submitted empty.
- **FR-2.12** The join form shall include a "stay signed in on this device" checkbox, pre-selected and clearable.
- **FR-2.13** The system shall not display an app-install prompt or an email request in the join form, nor on any screen between joining and the resident's first vote.
- **FR-2.14** The system shall not offer passkey registration during joining.
- **FR-2.15** Where an email address is present, verification shall be deferred and shall never prevent voting.
- **FR-2.16** The system shall not send deliberation-related content to an unverified email address, and shall not deliver notifications to one.
- **FR-2.17** A resident shall be able to add or change an email address later in their own settings, presented as restoring access if the password is lost.
- **FR-2.18** On successful join the system shall create the account, the resident profile and the membership, and shall place the resident on the Start screen.
- **FR-2.19** Every join shall be recorded as an append-only audit entry.

### The Start screen

- **FR-2.20** The Start screen shall display exactly one primary action at a time.
- **FR-2.21** The primary action shall be accompanied by the reason it is first.
- **FR-2.22** Where a round is open, the Start screen shall display how many eligible residents have cast at least one vote, against the round's participant count.
- **FR-2.23** Where no action is open for this resident, the Start screen shall display the round's current standing and shall not display an empty surface.
- **FR-2.24** The system shall select the primary action by exactly one precedence rule: actions with a real due date first, ordered by that date; actions without a due date after them, in a fixed order.
- **FR-2.25** No promotional or install-related element shall occupy the primary action position, and none shall be ordered above an action that has a due date.

---

## 4. Acceptance criteria

**AC-2.1 — The household is named before input**
Given a valid join link, when I open it, then the household's name is displayed and no field has yet been requested.

**AC-2.2 — Two fields are enough**
Given the join form, when I enter a display name and a password and submit with the email field empty, then my account is created and I reach the Start screen.

**AC-2.3 — Email is visibly optional**
Given the join form, when I inspect the email field, then it is marked optional and submitting it empty produces no error.

**AC-2.4 — Nothing is asked before the first vote**
Given I have just joined, when I traverse every screen between joining and casting my first vote, then no app-install prompt and no email request appears on any of them.

**AC-2.5 — No passkey during registration**
Given the join form, when it is displayed, then no passkey enrolment is offered.

**AC-2.6 — Stay signed in is pre-selected**
Given the join form, when it is displayed, then the "stay signed in on this device" checkbox is selected and can be cleared.

**AC-2.7 — Expired code is refused with its reason**
Given a join code whose expiry has passed, when I open its link, then joining is refused, the reason given is expiry, and I am told to ask a flatmate for a current link.

**AC-2.8 — Usage cap is enforced**
Given a join code with a maximum of 3 uses and 3 successful joins, when a fourth person opens the link, then joining is refused and the reason given is the usage cap.

**AC-2.9 — Rotation invalidates the old link**
Given a join code that has been rotated, when someone opens the previous link, then joining is refused and the reason given is that the link was replaced.

**AC-2.10 — Verification never blocks voting**
Given I joined with an email address that I have not verified, when a round is open and it is my turn, then I can cast a vote.

**AC-2.11 — Unverified addresses receive nothing**
Given a resident with an unverified email address, when the system would send them anything, then nothing is delivered to that address.

**AC-2.12 — Exactly one primary action**
Given I am a resident with an open vote and any number of other pending items, when I open Start, then exactly one primary action is displayed.

**AC-2.13 — The reason is shown beside the action**
Given a primary action is displayed, when I read it, then the reason it is first is visible without interaction.

**AC-2.14 — The participation counter is present and correct**
Given an open round with 7 participants of whom 5 have cast at least one vote, when I open Start, then it shows 5 of 7.

**AC-2.15 — Empty state shows standing, not blankness**
Given I have completed everything asked of me, when I open Start, then the round's current standing is displayed and no empty surface appears.

**AC-2.16 — Install prompts never outrank real work**
Given an install-related element is eligible for display and an action with a due date exists, when I open Start, then the action occupies the primary position and the install element does not — including when the due date is today.

**AC-2.17 — Duplicate display name is refused at join**
Given a household with an active resident named "Jonas", when I join choosing the name "Jonas", then joining is refused with an inline message and I am invited to choose another name.

**AC-2.18 — The join code never appears in a log or a URL query**
Given any successful or failed join, when logs and request records are inspected, then the join code appears in neither, and it is never transmitted as a query-string parameter.

**AC-2.19 — Joining is auditable**
Given a successful join, when the audit record is inspected, then it names the new profile and the time of joining.

---

## 5. Constraints

- **C-2.1** Exactly two required fields. Adding a third — including a "confirm password" — contradicts S-03 and the reason it exists. Source: S-03, decision 1 of the check-in.
- **C-2.2** The install prompt and the email request must not appear in the join path. `03-PRD.md` §4.1.1 carries this as an acceptance criterion; `02-SRD.md` S-45 was reworded to match. Source: S-45 as corrected, PRD §4.1.1.
- **C-2.3** The join code must never be written to a log and never appear in a query string. Source: `GUARDRAILS.md` **G-A5**.
- **C-2.4** The join link is the **only remaining access control**, because S-03 removed the mandatory email and **U-22** removed the resident-visible member list and the right to remove members. Its protections are therefore a precondition, not an enhancement. Source: S-49.
- **C-2.5** These protections are **social visibility, not hardening**, and must never be presented as security. Source: `06-Compliance-Anhang.md` §10.3, S-05.
- **C-2.6** Display name doubles as the login handle and must be unique per household among profiles that are not `moved_out`. Source: `04-Domaenenmodell.md` (`ResidentProfile.display_name`).
- **C-2.7** Password is the primary and universal authentication method; passkey is an optional add-on that may be removed without losing access. Source: S-03, `ADR-007`.
- **C-2.8** Exactly one precedence rule governs the primary action. No second heuristic, no learned or AI-assisted prioritisation. Source: S-48, and **P-5** for the AI half.
- **C-2.9** Access must end the day a resident moves out, which constrains how long "stay signed in" can outlive membership. Source: S-32.
- **C-2.10** Authorization enforced independently of the client and verified through both the policy layer and direct data access. Source: S-36, `ADR-004`, **G-C7**.
- **C-2.11** Every personal-data field declared in `data-inventory.yml` or the build fails. Source: S-37, `ADR-010`.

---

## 6. Edge cases

| ID | Case | Required behaviour |
|---|---|---|
| **EC-2.1** | Two people open the last remaining use of a code simultaneously | Exactly one join succeeds; the other is refused with the usage-cap reason |
| **EC-2.2** | A resident joins while a round is open | They become a household member but are **not** added to the open round's participant snapshot; a moderator must add them explicitly (F1 FR-1.18). The counter's denominator is unchanged |
| **EC-2.3** | A resident joins when no round is open | Join succeeds; Start shows that no round is running |
| **EC-2.4** | An already-registered, signed-in resident of this household opens the join link | No second account or profile is created; they are taken to Start with a note that they are already a member |
| **EC-2.5** | An already-registered resident of a **different** household opens the link | Refused, with an explanation. One account per household membership is the slice's assumption (A-2.4) |
| **EC-2.6** | A resident loses their password and never added an email | Recovery is impossible; a moderator must create a fresh profile. Stated plainly rather than hidden — the reason the email pitch exists at all |
| **EC-2.7** | Expiry and usage cap are both exhausted | One reason is shown, not two; expiry takes precedence in the message |
| **EC-2.8** | The household sets the usage cap to 0 | Treated as "closed": every join attempt is refused with the usage-cap reason |
| **EC-2.9** | A moderator rotates the code while a resident is mid-registration | The in-flight registration is refused on submit with the replaced-link reason |
| **EC-2.10** | A resident clears the "stay signed in" checkbox | The session ends with the browser session; they can sign in again with name and password |
| **EC-2.11** | Display name differing only by surrounding whitespace or letter case | Treated as a collision; refused per AC-2.17 |
| **EC-2.12** | A round is open but this resident has no eligibility to vote | Start shows the round's standing, not a vote action |

---

## 7. Risks & assumptions

### Assumptions

- **A-2.1** Residents receive the link through a channel they already use — the household's group chat. No delivery mechanism is built.
- **A-2.2** The moderator is willing to re-share a link when it expires. Expiry is a nuisance the household accepts in exchange for the link being the only control.
- **A-2.3** Residents will accept a password because the alternative — an emailed magic link — was rejected for not being device-bound.
- **A-2.4** One account belongs to one household in the slice. Multiple households per account is out of scope (S-02).
- **A-2.5** The slice runs on synthetic data, so no notification channel exists and FR-2.16 is satisfied trivially by sending nothing at all.

### Risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| **R-2.1** | A resident votes once, clears cookies, and cannot get back in | Reads as data loss; the household reverts to WhatsApp — the exact failure the product exists to prevent | EC-2.6 made explicit; the email is offered after the first vote, framed as recovery. Some residents will be single-session in the slice and that is accepted |
| **R-2.2** | The link is forwarded outside the flat | A non-resident votes and the denominator is wrong | Expiry, usage cap, warning — and C-2.5, so nobody mistakes this for protection |
| **R-2.3** | "Stay signed in" outlives membership | A moved-out resident retains access, breaking S-32 | C-2.9: revocation on `moved_out` must be server-side, not dependent on session expiry |
| **R-2.4** | The install prompt creeps into the join path during later UX work | Directly attacks the participation metric, and the specs already argued this once | C-2.2 plus AC-2.4 as a protected test that walks the whole path |
| **R-2.5** | Onboarding is cheap but Start is unclear, so residents arrive and stall | Participation dies one screen later than expected, and the metric cannot tell the two apart | FR-2.21's reason text; the household-level observation metric "activated residents" separates the two failures |

---

## 8. Review

**Still MVP-sized?** Yes. This is the smallest feature of the five by requirement count, and
deliberately so — its whole purpose is the absence of steps.

**Anything unclear or missing?** One genuine blocker and one gap:

1. **P-O-08 — how long does "stay signed in" last?** Still open in `03-PRD.md` §8, and it needs
   an answer before this ships, because FR-2.12 pre-selects the checkbox. Recommendation: a
   long-lived device-bound session with server-side revocation, so that C-2.9 is satisfied by
   revocation rather than by a short lifetime. **Not decided here** — it is a product decision.
2. **The number pre-filled into the usage cap** (FR-2.4) requires the household to have stated
   how many residents it expects, and no scope line says where that number is captured.
   Recommendation: ask for it once during F1's household registration.

**Too complex?** No, but note that FR-2.24's precedence rule does almost nothing in this slice:
with only one open task type it always falls through to the fixed order. It is specified in full
anyway because v0.2 adds four more task types, and because retrofitting a precedence rule after
the fact means revisiting every call site. If a reviewer wants to cut something, this is the
honest candidate — and the argument against cutting it is cost of change, not present value.
