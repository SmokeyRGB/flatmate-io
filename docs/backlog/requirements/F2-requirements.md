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
| **US-2.1** *(amended 2026-09-21)* | As a moderator, I want one link to be enough for the whole household, so that I am never *forced* to manage a code per person — while still being able to issue a second link when I have a reason to. |
| **US-2.2** | As a moderator, I want a warning where I copy the link, so that I understand that whoever holds it can vote. |
| **US-2.3** *(amended 2026-09-21)* | As a moderator, I want each link to expire and to have its own usage cap, so that a forwarded link does not stay open forever. |
| **US-2.14** *(new 2026-09-21)* | As a moderator, I want to see the links I have issued — the live ones and the dead ones — so that I can tell what is still open and who came in through what. |
| **US-2.15** *(new 2026-09-21)* | As a resident whose link will not open, I want to be able to type the code by hand, so that a broken link is not the end of the road. |
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

- **FR-2.1** *(amended 2026-09-21)* A household shall be able to hold **several join links at once**, each issued separately and each carrying its own expiry, usage limit and use count. The system shall never *require* a code per person: one link shared into the household's group chat shall always be enough on its own.
  The superseded wording — *"Each household shall have exactly one join code, shared as a link. There shall be no per-person codes"* — stated the cardinality of the single-rotating-code model rather than the intent **US-2.1** gives it, which is that nobody is *forced* into per-person administration. Source: **O-18** resolved 2026-09-21, `review-log.md` §Offene-Punkte-Register; `domain/identity.md` §2.1 `JoinCodeIssuance`. The personal invitation of an **accepted applicant** remains a different mechanism in v0.2 (`ApplicationInviteToken`, S-42).
- **FR-2.2** The share screen shall display the warning: share this link only directly with flatmates; whoever holds it can vote.
- **FR-2.3** *(amended 2026-09-21 — now per link)* Every join link shall carry its own expiry timestamp, defaulting to 7 days from the moment it was issued, and shall be extendable by a further 7 days in a single action. Source: **O-15** (*„mit einem Tippen verlängerbar"*), `domain/identity.md` §2.1 `JoinCodeIssuance.expires_at`.
- **FR-2.4** *(corrected 2026-09-21, amended the same day — now per link)* Every join link shall carry its own maximum use count, chosen when the link is issued and defaulting to **1**, a single-use link. A maximum of **0** shall mean the link is closed. The default is a security choice, not a guess at household size (**O-15**, updated 2026-09-16, which **replaced** the earlier "number of residents the household still expects" default rather than supplementing it); whoever shares a link into a group chat raises the number by hand at the moment they issue it.
  FR-2.4's earlier **founding-link exception** — pre-filling the first link with the number of expected residents — stands as a suggested value in `domain/identity.md` §2.1 but is **not built in v0.1**, because nothing captures that number. Decision of 2026-09-21, `review-log.md` §Offene-Punkte-Register.
- **FR-2.5** *(amended 2026-09-21)* Every join link shall be deletable on its own. Deleting one shall invalidate it immediately, shall leave every other link untouched, and shall not affect memberships already created through it. Deleting every live link achieves what rotating the single code previously did, so rotation as a separate mechanism falls away. Source: `screens/O-organisation.md` O16; `domain/identity.md` §2.1 `JoinCodeIssuance.deleted_at`. **G-A5**'s requirement that the code be revocable by the organising person is satisfied more directly than before, not weakened.
- **FR-2.6** *(amended 2026-09-21)* Every successful join shall increment the use count of **the link it was made with**, and shall record which link that was, so that the household can later see who joined through which link. Source: `domain/identity.md` §2.1 `Membership.joined_via_issuance_id` — the field O-18 named as the join back to the issuance.
- **FR-2.7** The system shall reject a join attempt when the code is expired, when its use count has reached its maximum, or when it has been rotated.
- **FR-2.8** *(corrected 2026-09-21)* A rejected join attempt shall show exactly **one** message that does not distinguish between FR-2.7's three reasons — the link is not valid — and shall direct the visitor to ask a flatmate for a current link. Naming the reason would disclose whether a code ever existed and whether it was merely used up; and telling a stranger *why* a link failed is an answer they have not earned. *(Rationale corrected 2026-09-21, the same day it was written: the second reason given here — that a deleted link cannot be told apart from one that never existed, **O-18** being open — **no longer holds.** O-18 was resolved that day, and `JoinCodeIssuance` now records every link ever issued, so the system can tell the difference perfectly well. It still must not say. The requirement is unchanged; one of its two supports was removed, and the remaining one carries it alone.)* Decision recorded in `review-log.md` §Offene-Punkte-Register.

- **FR-2.26** *(new 2026-09-21)* The join code shall be short enough to be read aloud over the phone and typed from a note by hand: upper case, drawn from an alphabet without characters that are easily confused with one another, and set in two short groups (shape: `UAMPN-QACVZ`). A `uuid` does not satisfy this. Source: **P-1 Kanalneutralität** — *anything that can arrive via a link must also be enterable by hand* — and `domain/identity.md` §2.1, sixth condition on the code.
- **FR-2.27** *(new 2026-09-21)* There shall be a way to enter a join code by hand, without a link. This is what makes FR-2.26 worth anything and what P-1 actually asks for; a code that is typeable but has nowhere to be typed satisfies nothing.
- **FR-2.28** *(new 2026-09-21)* The number of code-redemption attempts from one source shall be limited. This is not an optional hardening measure but the other half of FR-2.26: a short code has less entropy than a `uuid`, and checking a code is an oracle **against the whole estate** rather than against one household — a guess is tested against every live link at once, so the search space divides by the number of links in existence. Harmless at one household, not at ten thousand. Source: `domain/identity.md` §2.1; decision of 2026-09-21 in `review-log.md` §Offene-Punkte-Register.
- **FR-2.29** *(new 2026-09-21)* The screen where links are issued shall list the household's links — the live ones and the dead ones — each showing its expiry, its use count against its maximum, and why it is no longer usable where that applies. Source: **O-18** resolved 2026-09-21; `screens/O-organisation.md` O16.

### Registration

- **FR-2.9** Opening a join link shall display the household's name before any input is requested.
- **FR-2.10** The join form shall require exactly two fields: display name and password.
- **FR-2.10a** Where the password field enforces any requirement (length, character classes), that requirement shall be visible in or beside the field before or while the resident types — never enforced silently with no visible reason for a rejection.
- **FR-2.11** The join form shall offer an email field that is visibly optional and may be submitted empty.
- **FR-2.12** The join form shall include a "stay signed in on this device" checkbox, pre-selected and clearable.
- **FR-2.13** *(corrected 2026-09-21)* The system shall not display an app-install prompt, nor any element that **asks for** an email address, in the join form or on any screen between joining and the resident's first vote. The optional field of FR-2.11 is not such an element: a field that is visibly optional and may be submitted empty makes no request of anyone. Source: `03-PRD.md` §4.1.1, which already draws exactly this line („weder das PWA-Install-Banner noch die Resident-E-Mail-**Nachfrage**") and carries the optional field as an acceptance criterion of its own. The earlier wording read as forbidding the field itself, and so contradicted FR-2.11.
- **FR-2.14** The system shall not offer passkey registration during joining.
- **FR-2.15** Where an email address is present, verification shall be deferred and shall never prevent voting.
- **FR-2.16** The system shall not send deliberation-related content to an unverified email address, and shall not deliver notifications to one.
- **FR-2.17** A resident shall be able to add or change an email address later in their own settings, presented as restoring access if the password is lost.
- **FR-2.18** On successful join the system shall create the account, the resident profile and the membership, and shall place the resident on the Start screen.
- **FR-2.19** Every join shall be recorded as an append-only audit entry.

### The Start screen

- **FR-2.20** The Start screen shall display exactly one primary action at a time.
- **FR-2.21** The primary action shall be accompanied by the reason it is first.
- **FR-2.22** *(corrected 2026-09-21)* Where a round is open, the Start screen shall display how many eligible residents have cast at least one vote, against the **quorum denominator**: participations with `removed_at = null` **and** `can_vote = true` **and** profile `status = 'active'`. Not the round's raw participant count — a participant with `can_vote = false` never belonged in it, and a resident who moves out mid-round leaves both sides of the fraction rather than one. Source: `domain/invarianten.md` §5.3 **V-3**, part (b) (`quorum_denominator`, `quorum_numerator`), and **S-32**: „die Person fällt aber aus **Zähler und Nenner**". Reducing the denominator alone lets the participation rate exceed 100 %, which §5.3 rejects by name.
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

**AC-2.7 — An expired code is refused** *(corrected 2026-09-21)*
Given a join code whose expiry has passed, when I open its link, then joining is refused with FR-2.8's single invalid-link message, no reason is named, and I am told to ask a flatmate for a current link.

**AC-2.8 — The usage cap is enforced** *(corrected 2026-09-21)*
Given a join code with a maximum of 3 uses and 3 successful joins, when a fourth person opens the link, then joining is refused, and what they read is character-for-character what AC-2.7 produces.

**AC-2.9 — A deleted link is refused** *(corrected 2026-09-21, amended the same day)*
Given a join link that has been deleted, when someone opens it, then joining is refused with that same single message. It does not say the link was deleted — that wording confirms the link was once real. The system *can* now tell the difference, since `JoinCodeIssuance` keeps the row (**O-18** resolved 2026-09-21); it withholds it on purpose rather than for want of the data.

**AC-2.10 — Verification never blocks voting**
Given I joined with an email address that I have not verified, when a round is open and it is my turn, then I can cast a vote.

**AC-2.11 — Unverified addresses receive no deliberation content and no notifications** *(corrected 2026-09-21)*
Given a resident with an unverified email address, when the system would send deliberation-related content or deliver a notification, then nothing reaches that address. The verification mail itself is outside this scope and must stay deliverable — "anything" forbade that too, which made FR-2.17 (adding an address later) unimplementable: an address can never become verified if nothing may be sent to it. Scope taken from FR-2.16, which names these two things and no others.

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

**AC-2.20 — Password requirements are visible, not silently enforced**
Given the join form enforces a password requirement, when I start typing a password, then the requirement is visible without needing to submit first and without needing to fail once to see it.

**AC-2.21 — A moved-out account cannot authenticate** *(citation corrected 2026-09-21)*
Given a resident profile with `moved_out_on` set, when that account attempts to sign in, then authentication is refused and any pre-existing session for that profile has already been revoked. **Two sources, not one.** The access half is `domain/invarianten.md` §5.3 **V-3** (a): `status = 'moved_out'` makes `can_see_round` and `can_vote` false for every round, immediately. The session half is `domain/identity.md` §2.1, `Session.revoked_at`, whose third named trigger is „`ResidentProfile.moved_out_on` wird gesetzt". V-3 says nothing about authentication, so the earlier lone citation pointed at a rule that does not carry this criterion. Both are restated here as a redundant tripwire in the requirements package the login flow is actually built against, per the two-layer testing principle already applied to visibility invariants (G-C7).
**AC-2.22 — Several links coexist** *(new 2026-09-21)*
Given a household with one live link, when a moderator issues a second with a different expiry and a different maximum, then both are usable, each against its own limits, and neither affects the other's count.

**AC-2.23 — Deleting one link leaves the others alone** *(new 2026-09-21)*
Given a household with two live links, when one is deleted, then it is refused on its next use, the other still works, and every membership created through the deleted link is unchanged.

**AC-2.24 — The code can be typed by hand** *(new 2026-09-21)*
Given a code read off a note as lower case, with a space in it and no hyphen, when it is entered by hand, then it is accepted — normalised before lookup per EC-2.15.

**AC-2.25 — Guessing is limited** *(new 2026-09-21)*
Given repeated redemption attempts with wrong codes from one source, when the limit is reached, then further attempts are refused without being checked against any link.

**AC-2.26 — The history answers who came in through what** *(new 2026-09-21)*
Given a link through which two residents joined and which is now used up, when a moderator opens the link list, then the link is still listed, shows 2 of 2 used, and names the two residents who joined through it.

---

## 5. Constraints

- **C-2.1** Exactly two required fields. Adding a third — including a "confirm password" — contradicts S-03 and the reason it exists. Source: S-03, decision 1 of the check-in.
- **C-2.2** The install prompt and the email request must not appear in the join path. `03-PRD.md` §4.1.1 carries this as an acceptance criterion; `02-SRD.md` S-45 was reworded to match. Source: S-45 as corrected, PRD §4.1.1.
- **C-2.3** The join code must never be written to a log and never appear in a query string. Source: `GUARDRAILS.md` **G-A5**.
- **C-2.4** *(premise corrected 2026-09-21)* The join link is the **only remaining access control**, because S-03 removed the mandatory email and **U-22** removed the resident-visible member list and the right to remove members. **U-30** (2026-09-17) has since given residents a reduced „Wer wohnt hier" view back (screen `B5`), so the visibility half of that premise no longer holds — but the conclusion does, and O16 says so in as many words: B5 is „eine Erkennungshilfe für Bewohnende, kein Ersatz für die Ablauf-/Nutzungsgrenze", and it restores no removal right. The protections stay a precondition, not an enhancement. Source: S-49, `08-UX-Entscheidungen.md` U-30, `screens/O-organisation.md` O16.
- **C-2.5** These protections are **social visibility, not hardening**, and must never be presented as security. Source: `06-Compliance-Anhang.md` §10.3, S-05.
- **C-2.6** Display name doubles as the login handle and must be unique per household among profiles that are not `moved_out`. Source: `domain/identity.md` §2.1 (`ResidentProfile.display_name`) — the living authority. *(Citation corrected 2026-09-21: this pointed at `04-Domaenenmodell.md`, which is the frozen snapshot.)*
- **C-2.7** Password is the primary and universal authentication method; passkey is an optional add-on that may be removed without losing access. Source: S-03, `ADR-007`.
- **C-2.8** Exactly one precedence rule governs the primary action. No second heuristic, no learned or AI-assisted prioritisation. Source: S-48, and **P-5** for the AI half.
- **C-2.9** *(corrected 2026-09-21)* Access must end **the moment** a resident moves out — „sofort, auf alle Runden, ohne Übergangsfrist" — not at the end of that day. That is what constrains "stay signed in", and it is satisfied only by server-side revocation (`Session.revoked_at`), never by waiting for a session to expire: a 90-day session outlives any same-day deadline. Source: **S-32** (`02-SRD.md` §5.3: „`moved_out` entzieht sofort den Zugriff"), `domain/invarianten.md` §5.3 **V-3** (a), `domain/identity.md` §2.1 `Session.revoked_at`.
- **C-2.10** Authorization enforced independently of the client and verified through both the policy layer and direct data access. Source: S-36, `ADR-004`, **G-C7**.
- **C-2.11** Every personal-data field declared in `data-inventory.yml` or the build fails. Source: S-37, `ADR-010`.
- **C-2.12** *(new 2026-09-21)* The short code (FR-2.26) and the attempt limit (FR-2.28) are **one decision, not two**. Shortening the code is what P-1 requires; the attempt limit is what keeps the shortened code defensible. Shipping the first without the second would weaken the only remaining access control (C-2.4) rather than making it usable. Source: decision of 2026-09-21, `review-log.md` §Offene-Punkte-Register.

---

## 6. Edge cases

| ID | Case | Required behaviour |
|---|---|---|
| **EC-2.1** *(amended 2026-09-21)* | Two people open the last remaining use of the same link simultaneously | Exactly one join succeeds; the other is refused with FR-2.8's single invalid-link message. With `max_uses` defaulting to **1**, this is the ordinary invitation rather than a rarity, so the increment has to be one conditional statement that both decides and counts, never a read followed by a write |
| **EC-2.2** *(corrected 2026-09-21)* | A resident joins while a round is open | They become a household member **and are added to every currently open round automatically**, marked `joined_after_open` rather than as part of the opening snapshot. The counter's denominator grows accordingly. A moderator may still add someone by hand (`added_manually`) as a correction path for cases the automatic route missed. Source: F1 **FR-1.18**, revised 2026-09-17. The previous wording here — not added, moderator must add explicitly, denominator unchanged — cited FR-1.18 as it read *before* that revision, and contradicted the behaviour already enforced by the `membership_auto_join_open_rounds` trigger |
| **EC-2.3** | A resident joins when no round is open | Join succeeds; Start shows that no round is running |
| **EC-2.4** | An already-registered, signed-in resident of this household opens the join link | No second account or profile is created; they are taken to Start with a note that they are already a member |
| **EC-2.5** | An already-registered resident of a **different** household opens the link | Refused, with an explanation. One account per household membership is the slice's assumption (A-2.4) |
| **EC-2.6** | A resident loses their password and never added an email | Recovery is impossible; a moderator must create a fresh profile. Stated plainly rather than hidden — the reason the email pitch exists at all |
| **EC-2.7** *(corrected 2026-09-21)* | Expiry and usage cap are both exhausted | No reason is shown at all — the same single invalid-link message as every other refusal (FR-2.8). The case needs no precedence rule between the two reasons, because the message never held one |
| **EC-2.8** *(amended 2026-09-21)* | A link is issued with a usage cap of 0 | Treated as "closed": every attempt on that link is refused with FR-2.8's single invalid-link message, while the household's other links are unaffected. Needs no separate code path — `uses < max_uses` is already false at zero |
| **EC-2.9** *(amended 2026-09-21)* | A moderator deletes the link while a resident is mid-registration | The in-flight registration is refused on submit, with FR-2.8's single invalid-link message. Validation therefore runs at submit, not only when the link is opened |
| **EC-2.10** *(corrected 2026-09-21)* | A resident clears the "stay signed in" checkbox | `Session.remember_me` is stored as `false` and `Session.expires_at` becomes a **short server-side** lifetime — 12 h — instead of 90 days; they can sign in again with name and password. Not "ends with the browser session": a session cookie has no server-side expiry, so closing the browser would discard the cookie while leaving the session row valid for anyone holding the token. Source: `domain/identity.md` §2.1, `Session.expires_at` |
| **EC-2.11** *(corrected 2026-09-21)* | Display name differing only by surrounding **whitespace** | Trimmed first, then treated as a collision and refused per AC-2.17. **Letter case is deliberately not part of this rule:** no authoritative source asks for case-folding, and neither the uniqueness index nor the existing duplicate check folds case, so the edge case described behaviour nobody had specified. Making "jonas" collide with "Jonas" would be a new decision, not an edge case — and it belongs in `domain/identity.md` beside `ResidentProfile.display_name`, not here |
| **EC-2.12** | A round is open but this resident has no eligibility to vote | Start shows the round's standing, not a vote action |
| **EC-2.13** *(new 2026-09-21)* | A household has no live link at all — every one is deleted, expired or used up | Not an error state. O16 leads with issuing a new link rather than an empty list; the history stays visible beneath it |
| **EC-2.14** *(new 2026-09-21)* | Someone guesses at codes on the join route | Attempts are limited per source (FR-2.28). The limit is on the route, not on a link, because a guess is tested against every live link at once |
| **EC-2.15** *(new 2026-09-21)* | A resident types the code with the wrong case, extra spaces, or without the hyphen | Accepted. The code is normalised before lookup — upper-cased, whitespace stripped, separator optional — because a code that must be typed by hand (FR-2.26) cannot also demand exactness. This is the one place casing is folded deliberately; **EC-2.11** (display names) still does not fold case |

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

**Anything unclear or missing?** *(reviewed 2026-09-21 — both items below were recorded here as
open; both had been decided in the register, which is the only place a status lives. Corrected
rather than deleted, per the register's own rule 1.)*

1. ~~**P-O-08 — how long does "stay signed in" last?**~~ **Closed.** 90 days, sliding; ends on
   password change, on an admin reset, and on `moved_out_on`. Maßgeblich: `04-Domaenenmodell.md`
   §10.2 (**O-13**). `Session.remember_me` already carries it. Not a blocker for this slice.
2. ~~**The number pre-filled into the usage cap**~~ **Settled for v0.1 (2026-09-21): the
   founding-link prefill is deferred, not built.** Since **O-15** (2026-09-16) the general
   default is a single-use link, so the expected-resident count is needed **only** for the
   founding link (FR-2.4), and nothing captures it today — F1's household registration does not
   ask for it. F2 does not add a household-level "expected residents" field either: a link
   carries its own `max_uses` and nothing else, and whoever shares one into a group chat sets
   that number by hand as they issue it. That meets O-15's intent — a link should not be redeemable
   by more people than were meant to use it — without a field whose only reader would be one
   prefill. What it costs is named rather than hidden: the **suggested value** in
   `domain/identity.md` §2.1 and `screens/O-organisation.md` O16 stays a suggestion with no
   source in v0.1. Maßgeblich: `review-log.md` §Offene-Punkte-Register.
3. ~~**O-18 — the join code has no issuance history**~~ **Resolved 2026-09-21, in favour of the
   history.** Recorded here the same day it was raised in this packet, because resolving it
   changed the packet rather than merely answering it. A household now issues **many** links
   (`domain/identity.md` §2.1 `JoinCodeIssuance`), each with its own expiry, maximum and counter,
   each deletable, all of them kept after death so O16 can answer *"who joined through which
   link"*. FR-2.1, FR-2.3–FR-2.6, AC-2.9 and EC-2.1/2.8/2.9 were amended to match, and FR-2.26–
   FR-2.29 are new. **One consequence worth naming:** FR-2.8's single refusal message had two
   supports, and this removed one of them — the system can now tell a deleted link from one that
   never existed, and withholds the difference on purpose rather than for want of the data. The
   requirement stands on the remaining support. Maßgeblich: `review-log.md`
   §Offene-Punkte-Register.

**Too complex?** No, but note that FR-2.24's precedence rule does almost nothing in this slice:
with only one open task type it always falls through to the fixed order. It is specified in full
anyway because v0.2 adds four more task types, and because retrofitting a precedence rule after
the fact means revisiting every call site. If a reviewer wants to cut something, this is the
honest candidate — and the argument against cutting it is cost of change, not present value.
