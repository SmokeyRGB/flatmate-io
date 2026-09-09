# F4 — Screen the applications card by card · requirements

> **Feature:** [F4 — Screen the applications card by card, four ratings](../MVP%20Backlog%20Features/F4-screen-and-vote.md)
> **Band:** `v0.1` · **Scope lines:** S-09, S-10
> **Screens:** C1 Screening pass ⚡ — the most frequent action in the product
> **Status:** V1.0 · 2026-09-08
>
> **`requirements.md` only — what must be built, not how.**

---

## 1. Scope

An eligible resident works through every open application of the round, one card at a time,
giving each exactly one of four ratings whose weights are shown before use.

**In scope:** the deck and its stability · the four-point scale and its disclosure · one rating
per applicant · changing a rating while the round is open · progress and completion · excluding
the resident's own application.

**Out of scope:** the second pass at budget overrun (S-11/S-47, v0.2) · round-two voting and
veto (S-23/S-24, v0.2) · the ranking itself (F5) · swipe gestures as the only input · batch
rating · any wider rating scale · points-budget voting (a v1.1 option) · notes about candidates
(S-22, v0.2).

---

## 2. User stories

| ID | Story |
|---|---|
| **US-4.1** | As a resident, I want to go through the open applications card by card in one sitting, so that screening is one task and not twenty. |
| **US-4.2** | As a resident, I want to pick one of four ratings for each applicant, so that rating is a single tap and not an essay. |
| **US-4.3** | As a resident, I want to see what each rating is worth before I use it, so that I am not guessing at the arithmetic my vote feeds. |
| **US-4.4** | As a resident, I want to change my vote while the round is still open, so that a first impression is not binding. |
| **US-4.5** | As a resident, I want to see "nothing is waiting for you" when I am done, so that finishing is legible as finishing. |
| **US-4.6** | As a resident, I want to never be asked to vote on my own application, so that the product does not hand me a decision about myself. |
| **US-4.7** | As a resident, I want to pick up new arrivals next time rather than have the deck shift under me, so that the pass I started is the pass I finish. |

---

## 3. Functional requirements

### The deck

- **FR-4.1** The system shall present, to an eligible resident of an open round, the applications of that round that are open for screening, one at a time.
- **FR-4.2** The deck shall exclude any application linked to the viewing resident's own profile.
- **FR-4.3** The exclusion in FR-4.2 shall be applied before the data reaches the client, and shall not depend on client-side filtering.
- **FR-4.4** The deck's composition shall be fixed when a pass begins. Applications created after that moment shall not enter the pass in progress.
- **FR-4.5** Applications deleted during a pass shall be removed from the remaining deck without ending the pass.
- **FR-4.6** The system shall show progress through the pass — position and total.
- **FR-4.7** Each card shall show the applicant's name and whichever optional details were captured.

### Rating

- **FR-4.8** Each card shall offer exactly four ratings, labelled **No**, **Rather not**, **Like**, **Must have**.
- **FR-4.9** The system shall display the weight of each rating before it is used: 0, 1, 3, 5 respectively.
- **FR-4.10** The displayed weights shall be the weights frozen for this round when it opened, not the household's current settings.
- **FR-4.11** A resident shall hold at most one rating per application per voting stage. The screening pass is the invite stage.
- **FR-4.12** Selecting a rating shall record it immediately, without a separate submit step for the pass as a whole.
- **FR-4.13** A resident shall be able to change a previously given rating while the round is `open` and within the same voting stage.
- **FR-4.14** Withdrawing a rating shall be recorded as a withdrawal, not by removing the record.
- **FR-4.15** The system shall reject a rating when the round is not `open`, when the resident is not eligible to vote in it, or when the application is the resident's own.
- **FR-4.16** "Must have" shall carry the meaning "this is my favourite". No separate favourite-selection step shall exist after the pass.

### Completion

- **FR-4.17** When no application in the deck is unrated, the system shall state that nothing is waiting for this resident.
- **FR-4.18** After the last card the system shall present the ranking, and shall never present an empty surface.

---

## 4. Acceptance criteria

**AC-4.1 — The deck contains the round's open applications**
Given an open round with five applications open for screening and none of them mine, when I start a pass, then five cards are available.

**AC-4.2 — My own application is absent**
Given an open round containing an application linked to my own profile, when I start a pass, then that application is not among the cards.

**AC-4.3 — The exclusion is server-side**
Given an open round containing an application linked to my own profile, when the data behind the pass is requested directly rather than through the interface, then that application is not returned.

**AC-4.4 — The deck is stable during a pass**
Given I have started a pass over five cards, when a moderator captures a sixth application, then my current pass still contains five cards.

**AC-4.5 — New arrivals appear in the next pass**
Given a sixth application was captured during my previous pass, when I start a new pass, then that application is among the cards.

**AC-4.6 — Deletion during a pass does not break it**
Given I am on card 2 of five and a moderator deletes card 4, when I continue, then the pass completes over the four remaining cards without error.

**AC-4.7 — Four ratings, no more**
Given a card, when the rating options are enumerated, then exactly four exist: No, Rather not, Like, Must have.

**AC-4.8 — Weights are visible before use**
Given a card, when it is displayed, then the weight of each rating is visible without interaction.

**AC-4.9 — Displayed weights come from the round's frozen rules**
Given a round opened while "Like" was worth 3, when the household later changes "Like" to 4, then the pass in that round still displays and applies 3.

**AC-4.10 — One rating per applicant**
Given I have rated an applicant "Like", when I rate the same applicant "No", then exactly one rating exists for me on that applicant and its value is "No".

**AC-4.11 — Ratings persist without a submit step**
Given I rate one card and close the browser, when I return, then that rating is still recorded.

**AC-4.12 — Changing a rating is allowed while the round is open**
Given the round is `open` and I rated an applicant yesterday, when I change that rating, then the change is accepted.

**AC-4.13 — Rating is refused when the round is not open**
Given the round is `paused`, `closed` or `archived`, when I attempt to rate, then the attempt is refused and the reason names the round state.

**AC-4.14 — Rating is refused without eligibility**
Given my round participation records that I may not vote, when I attempt to rate, then the attempt is refused.

**AC-4.15 — Withdrawal is recorded, not erased**
Given I withdraw a rating, when the record is inspected, then the rating still exists marked as withdrawn.

**AC-4.16 — Progress is visible**
Given a pass over five cards, when I am on the third, then the interface shows my position and the total.

**AC-4.17 — Completion is stated**
Given I have rated every card in the deck, when the pass ends, then the interface states that nothing is waiting for me.

**AC-4.18 — The last card leads somewhere**
Given I rate the final card, when the pass ends, then the ranking is presented and no empty surface appears.

**AC-4.19 — No separate favourites step**
Given I have given several "Must have" ratings, when the pass ends, then no favourite-selection step is presented in this release.

---

## 5. Constraints

- **C-4.1** The scale is exactly four levels with weights **0 · 1 · 3 · 5**, non-linear on purpose because the decision boundary sits between "Rather not" and "Like". Source: **E-07**, `ADR-008`.
- **C-4.2** Wider scales are excluded, not merely deferred: people cluster in the middle of a 5- or 10-point scale and stop differentiating, which is the reason the scale is four. Source: S-10 out-of-scope list, check-in decision 3.
- **C-4.3** Displaying the weights is **P-3** (legitimacy before optimality), not decoration. A hidden formula is a defect.
- **C-4.4** The weights and every other voting rule come from the round's frozen copy, never from live household settings. Source: `04-Domaenenmodell.md`; the same rule governs F5's score.
- **C-4.5** At most one rating per `(application, resident profile, voting stage)`. Round two reuses the same structure at a different stage and is v0.2. Source: `04-Domaenenmodell.md` (`Vote`).
- **C-4.6** Revisability is part of the requirement itself — *"revidierbar innerhalb derselben `Vote.stage`, solange die `CastingRound` `open` ist"* — and not a later enhancement. Source: S-10, confirmed in §5.4.
- **C-4.7** "Must have" is the favourite signal; there is no separate favourites round. Source: **E-07**.
- **C-4.8** Swipe gestures must not be the only way to rate, and batch rating is excluded. Source: S-09 out-of-scope list.
- **C-4.9** The visibility invariant must be enforced independently of the client and verified through both the policy layer and direct data access. Source: S-31, S-36, `ADR-004`, **G-C7**.
- **C-4.10** No AI may rate, rank, summarise or recommend an applicant. Source: **P-5**.
- **C-4.11** Interface text may be promotional about the process, never evaluative about a person. Source: content rule **C-10**.
- **C-4.12** Every personal-data field declared in `data-inventory.yml` or the build fails. Source: S-37, `ADR-010`.

---

## 6. Edge cases

| ID | Case | Required behaviour |
|---|---|---|
| **EC-4.1** | The round has no applications open for screening | The pass is not offered; the resident is told nothing is waiting |
| **EC-4.2** | The only application in the round is the resident's own | Same as EC-4.1 from that resident's point of view — the deck is empty and that is stated, not shown as an error |
| **EC-4.3** | The resident is a household member but not a round participant | The pass is not offered; the round's standing is shown instead |
| **EC-4.4** | The round is paused mid-pass | Further ratings are refused per AC-4.13; ratings already recorded stand |
| **EC-4.5** | The round is closed mid-pass | As EC-4.4. Nothing already recorded is rolled back |
| **EC-4.6** | The same resident rates from two devices at once | The last write wins and exactly one rating exists; no duplicate is created |
| **EC-4.7** | A resident rates, then their eligibility is withdrawn | The rating stands. Its treatment in the arithmetic is F5's concern, not this feature's |
| **EC-4.8** | A resident rates every applicant "Must have" | Permitted in this release. The correction pass that responds to it is v0.2 |
| **EC-4.9** | A resident rates every applicant "No" | Permitted. No prompt, no nudge, no commentary — that would be evaluative about people |
| **EC-4.10** | An application is captured and deleted during the same pass | It never appears in the pass |
| **EC-4.11** | The frozen weights are missing or malformed for a round | The pass is refused rather than falling back to defaults, because falling back would silently change the arithmetic |
| **EC-4.12** | A resident reopens the pass after completing it | The already-rated cards are shown with their ratings, changeable per FR-4.13 |

---

## 7. Risks & assumptions

### Assumptions

- **A-4.1** Applications per round are in the low tens, so a pass is completable in one sitting and needs no save-and-resume beyond ratings persisting individually.
- **A-4.2** Residents rate on a phone, one card filling the screen. Mobile-first is a given (**P-2**), and no desktop-specific interaction is required.
- **A-4.3** A partial pass is a normal outcome, not a failure. Every recorded rating counts on its own.
- **A-4.4** Nobody moves out during the slice, so EC-4.7's arithmetic branch never fires in practice — it is specified because F5 needs it later.

### Risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| **R-4.1** | The pass is long enough that residents abandon it midway | Participation concentrates on the first cards. The second-order metric "median votes per application" is designed to expose exactly this | FR-4.6 progress, FR-4.4 stable order, and per-card persistence so partial work is never lost |
| **R-4.2** | Weights are displayed from live settings while the score uses the frozen copy, or vice versa | **P-3** breaks silently: the number a resident was shown is not the number that was used | C-4.4 and AC-4.9 as a protected test spanning F4 and F5 |
| **R-4.3** | Own-application exclusion is done in the client | The row is still fetched, so the invariant is one bug from leaking, and it fails without an error | FR-4.3 and AC-4.3, which tests the data path rather than the interface |
| **R-4.4** | A resident sees the group's result before rating and adjusts | Anchoring, which is the effect hidden results exist to prevent | Out of scope here and handled in F5: results reveal only after the resident's own vote |
| **R-4.5** | Four options feel too coarse and residents disengage | The core assumption behind decision 3 of the check-in is wrong | Untestable before the prototype. The weights live in the round's rules, so the scale is measurable against itself rather than hard-wired |

---

## 8. Review

**Still MVP-sized?** Yes. This is the smallest surface in the slice — one screen, four buttons —
and the highest-traffic one. Nothing here is deferrable: remove revisability and S-10 is
incomplete; remove weight disclosure and **P-3** breaks; remove own-application exclusion and the
product does something it exists not to do.

**Anything unclear or missing?** One item, and it is a real dependency:

- **The exact wording of the rating labels and the weight disclosure is not fixed anywhere.**
  `03-PRD.md` **P-O-04** ("wording of all notice texts") is still open, and this screen is the
  most-used surface in the product. The German labels are settled — *Nein · Eher nicht · Finde
  gut · Unbedingt* — and `03-PRD.md` gives *"= dein Favorit"* for the top level. The English
  labels used here follow the Miro board. **How the weights are phrased is not decided** and
  should come out of the clickable prototype rather than be invented in this document.

**Too complex?** No — and one thing was deliberately kept simple: FR-4.12 records each rating on
selection, with no submit step for the pass. That removes an abandonment point at the cost of
making EC-4.6 (two devices) a real case, which AC-4.10 covers.
