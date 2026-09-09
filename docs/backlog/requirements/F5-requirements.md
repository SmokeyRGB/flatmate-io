# F5 — A ranking you can check, hidden until you have voted · requirements

> **Feature:** [F5 — A ranking you can check, hidden until you have voted](../features/F5-ranking-hidden-until-you-vote.md)
> **Band:** `v0.1` · **Scope lines:** S-12, S-13, S-14, S-16, S-31
> **Screens:** D1 Ranking — "waiting for votes" ⚡ · D2 Candidate detail · D3 My own application
> **Status:** V1.0 · 2026-09-08
>
> **`requirements.md` only — what must be built, not how.** The formulas below are stated
> verbatim because they are **required behaviour**, not implementation choices.

---

## 1. Scope

Votes become a score, a quorum judgement and an ordering. Each resident sees a candidate's
results only after voting on that candidate. Candidates below quorum sit apart. Marking someone
invited yields a copy-paste text. A resident never sees the deliberation about themselves.

**In scope:** the score · quorum display and separation · the ordering and its tie-break · hidden
results until own vote · the four-rating distribution · the candidate detail view · marking a
candidate invited and its copy-paste text · the resident's own-application view · self-redaction
across every read path.

**Out of scope:** weighted votes, delegation, abstention as its own level · quorum as a hard block
· permanently anonymous voting · permanently hidden results · sending by the application · portal
batch contact · the veto (v0.2) · casting notes (v0.2) · the marker for votes from former members
(S-32, v0.2 — but see §7) · **any AI ranking, scoring, recommendation or best-fit suggestion,
permanently**.

---

## 2. User stories

| ID | Story |
|---|---|
| **US-5.1** | As a resident, I want to see a candidate's score only after I have voted on that candidate, so that the group's opinion does not become my anchor. |
| **US-5.2** | As a resident, I want to see the ranking sorted, so that the group's view is legible at a glance. |
| **US-5.3** | As a resident, I want to see how the score is worked out, not just the number, so that I can check it rather than trust it. |
| **US-5.4** | As a resident, I want to see candidates with too few votes in a separate "waiting for votes" section, so that one enthusiastic vote does not look like a front-runner. |
| **US-5.5** | As a resident, I want to see how the four ratings split for one candidate, so that a single number is not all I know about a person. |
| **US-5.6** | As a moderator, I want to mark a candidate as invited, so that the state of the process is recorded where everyone sees it. |
| **US-5.7** | As a moderator, I want a ready text including the data-protection notice, so that the household's information duty is dischargeable in practice. |
| **US-5.8** | As a moderator, I want to see every candidate's current stage in one place, so that nobody is forgotten between states. |
| **US-5.9** | As a resident, I want to never read a vote that was written about me, so that moving in does not start with reading the group's deliberation about me. |
| **US-5.10** | As a resident, I want to see only the factual part of my own application with an honest note why, so that the gap is explained rather than looking like a bug. |

---

## 3. Functional requirements

### 3.1 The score

- **FR-5.1** The system shall compute a candidate's score for a voting stage as follows:

```text
WEIGHTS = { no: 0, rather_not: 1, good: 3, definitely: 5 }   // default, deliberately non-linear

function score(application, stage, round) -> int | NO_SCORE
    weights = round.settings_snapshot.scale_weights     // NOT the current settings
    votes   = score_votes(application, stage)           // former members included
    if |votes| = 0:
        return NO_SCORE                                 // no score, not 0 — not the same thing
    mean = ( Σ_{v ∈ votes} weights[v.value] ) / |votes|
    return round_half_up( mean / max(weights.values) × 100 )   // 0…100
```

- **FR-5.2** Where a candidate has no votes at the stage, the system shall yield `NO_SCORE` and shall not yield `0`.
- **FR-5.3** `NO_SCORE` shall be displayed as the absence of a score, never as a numeral.
- **FR-5.4** The weights shall be read from the round's frozen rules, never from the household's current settings.
- **FR-5.5** The system shall present, on demand and without leaving the screen, how a displayed score was reached: the weight of each rating, the number of votes, and the arithmetic.

### 3.2 Quorum

- **FR-5.6** The system shall determine whether a candidate has reached quorum as follows:

```text
function quorum_reached(application, stage, round) -> bool
    quorum_numerator(application, stage)
      >= ceil( settings.quorum_share × quorum_denominator(round) )
```

- **FR-5.7** The quorum share shall default to `0.5`, meaning **at least half** and not more than half: 7 eligible voters require 4; 6 require exactly 3.
- **FR-5.8** The quorum denominator shall be the round's participant entries that may vote.
- **FR-5.9** Quorum shall be **display only**. No state transition shall be prevented, delayed or triggered by it.
- **FR-5.10** Candidates below quorum shall appear in a separate section, labelled with how many votes they have against how many are needed, and shall have neither a rank position nor a score displayed.

### 3.3 Ordering

- **FR-5.11** The system shall order candidates that have reached quorum by the following keys, ascending:

```text
( veto_penalty(a, stage),                  // 1. vetoed block sinks   (always 0 in v0.1)
  − score(a, stage, round),                // 2. score descending
  − count_value(a, stage, 'definitely'),   // 3. more "Must have" wins
    count_value(a, stage, 'no'),           // 4. fewer "No" wins
  − |score_votes(a, stage)|,               // 5. broader vote base wins
    a.created_at,                          // 6. who applied first
    a.id )                                 // 7. pure determinism anchor
```

- **FR-5.12** The ordering shall be fully deterministic: two candidates shall never be presented in an unstable order across two reads of unchanged data.
- **FR-5.13** The veto key shall remain part of the ordering even though no veto exists in this release.
- **FR-5.14** The ranking shall be sortable by the resident, without altering the stored ordering rule.

### 3.4 Hidden results

- **FR-5.15** The system shall support a household setting that hides results until the viewing resident has voted, and it shall default to enabled.
- **FR-5.16** While that setting is enabled and the viewing resident has not cast a vote on a candidate **at the current voting stage**, the system shall withhold from that resident, for that candidate: the score, the vote distribution, the vote count, and the rank position.
- **FR-5.17** The withholding in FR-5.16 shall be applied before the data reaches the client, on every read path including aggregates and exports.
- **FR-5.18** A candidate whose results are withheld shall still be listed, so that the resident knows the candidate exists.
- **FR-5.19** Casting a vote on a candidate shall reveal that candidate's results to the voting resident immediately.

### 3.5 Candidate detail

- **FR-5.20** The candidate detail view shall show how the four ratings split for that candidate, as counts per rating level.
- **FR-5.21** The distribution shall be shown in addition to the score, not instead of it.
- **FR-5.22** The candidate detail view shall show the candidate's current state.
- **FR-5.23** The system shall show every candidate's current state in one place.

### 3.6 Marking a candidate invited

- **FR-5.24** The system shall allow an account holding the change-status permission to move a candidate to `invited`.
- **FR-5.25** On marking a candidate `invited`, the system shall provide a copy-paste text that includes the data-protection notice.
- **FR-5.26** The system shall not send that text, and shall offer no send action anywhere.
- **FR-5.27** The state change shall be recorded as an append-only audit entry naming the account and the acting profile.
- **FR-5.28** Marking a candidate `invited` shall not require quorum and shall not be blocked by its absence.

### 3.7 The resident's own application

- **FR-5.29** Where an application is linked to the viewing resident's own profile, the system shall permanently withhold from that resident every vote on it, its distribution, its aggregate and its rank position.
- **FR-5.30** The withholding in FR-5.29 shall apply on every read path — interface, aggregates, exports — and shall not depend on the round's state or the hidden-results setting.
- **FR-5.31** The system shall show that resident the factual part of their own application together with a note explaining why the rest is not shown.
- **FR-5.32** The note in FR-5.31 shall state the reason plainly and shall not present the omission as an error or an absence of data.

---

## 4. Acceptance criteria

**AC-5.1 — Score arithmetic, worked**
Given a candidate with four votes — No, Like, Like, Must have — and default weights, when the score is computed, then the mean is (0+3+3+5)/4 = 2.75, and the score is `round_half_up(2.75/5 × 100)` = **55**.

**AC-5.2 — Single "Must have" scores 100**
Given a candidate with exactly one vote of "Must have", when the score is computed, then it is **100**.

**AC-5.3 — Single "No" scores 0**
Given a candidate with exactly one vote of "No", when the score is computed, then it is **0** — which is a real score, distinct from `NO_SCORE`.

**AC-5.4 — No votes is not zero**
Given a candidate with no votes, when the score is computed, then the result is `NO_SCORE`, and the interface shows no numeral for it.

**AC-5.5 — Frozen weights are used**
Given a round opened while "Like" was worth 3, when the household changes "Like" to 4 and the score is recomputed, then the score still uses 3.

**AC-5.6 — The arithmetic is inspectable**
Given a displayed score, when I ask how it was reached, then the weight of each rating, the vote count and the calculation are shown without leaving the screen.

**AC-5.7 — Quorum at an odd denominator**
Given 7 participants who may vote and a quorum share of 0.5, when a candidate has 3 votes, then quorum is not reached; at 4 votes it is.

**AC-5.8 — Quorum at an even denominator**
Given 6 participants who may vote and a quorum share of 0.5, when a candidate has 3 votes, then quorum **is** reached — at least half, not more than half.

**AC-5.9 — Below quorum means no rank and no score**
Given a candidate below quorum, when I view the ranking, then that candidate appears in the waiting section with its vote count and required count, and shows neither a rank position nor a score.

**AC-5.10 — Quorum blocks nothing**
Given a candidate below quorum, when a moderator marks that candidate `invited`, then the transition succeeds.

**AC-5.11 — Score tie broken by "Must have" count**
Given two candidates at quorum with equal scores, when one has more "Must have" ratings, then that one ranks higher.

**AC-5.12 — Next tie broken by fewer "No"**
Given two candidates with equal score and equal "Must have" counts, when one has fewer "No" ratings, then that one ranks higher.

**AC-5.13 — Next tie broken by a broader vote base**
Given two candidates equal on score, "Must have" and "No" counts, when one has more votes in total, then that one ranks higher.

**AC-5.14 — Final tie-break is deterministic**
Given two candidates identical on every preceding key and created at the same instant, when the ranking is read twice without any data change, then the order is identical both times.

**AC-5.15 — Results hidden before my own vote**
Given hidden results are enabled and I have not voted on a candidate, when I open the ranking, then that candidate is listed and its score, distribution, vote count and rank position are not shown to me.

**AC-5.16 — Hiding is server-side**
Given the conditions of AC-5.15, when the data behind the ranking is requested directly rather than through the interface, then the withheld values are absent from the response.

**AC-5.17 — Voting reveals immediately**
Given I have not voted on a candidate, when I cast a vote on that candidate, then that candidate's score, distribution, vote count and rank position become visible to me.

**AC-5.18 — Revealing is per candidate, not per round**
Given I have voted on candidate A but not candidate B, when I open the ranking, then A's results are visible to me and B's are not.

**AC-5.19 — Stage-scoped reveal**
Given I voted on a candidate at the invite stage, when a later stage exists and I have not voted at it, then that later stage's results are withheld from me.

**AC-5.20 — The distribution is shown alongside the score**
Given a candidate at quorum whose results are visible to me, when I open the candidate detail, then the count of each of the four ratings is shown in addition to the score.

**AC-5.21 — Invited yields the text**
Given I hold the change-status permission, when I mark a candidate `invited`, then a copy-paste text containing the data-protection notice is provided.

**AC-5.22 — Nothing is sent**
Given the copy-paste text is displayed, when I look for a send action anywhere in the flow, then none exists.

**AC-5.23 — The transition is auditable**
Given a candidate was marked `invited`, when the audit entry is inspected, then it names the account and the acting profile.

**AC-5.24 — My own application is redacted to me**
Given an application linked to my own profile, when I open it, then I see its factual part and no vote, no distribution, no aggregate and no rank position.

**AC-5.25 — Own-application redaction is server-side and unconditional**
Given the conditions of AC-5.24, when the data is requested directly, and regardless of the round's state or the hidden-results setting, then the withheld values are absent from the response.

**AC-5.26 — The redaction is explained**
Given I open my own application, when the redacted area is displayed, then a note states plainly why the rest is not shown, and it does not read as an error or as missing data.

**AC-5.27 — Redaction survives the aggregate**
Given an application linked to my own profile with four votes on it, when I request any aggregate that includes that application, then no value derived from those votes reaches me.

**AC-5.28 — Interface copy stays on the process**
Given any text on the ranking screen, when it is reviewed, then it makes no evaluative statement about a person, and every claim about several candidates maps to a threshold that actually exists.

---

## 5. Constraints

- **C-5.1** `NO_SCORE` and `0` are different values with different meanings and must remain distinguishable through every layer. Source: `04-Domaenenmodell.md` §8.1 — *"kein Score, keine 0 — das ist nicht dasselbe"*.
- **C-5.2** Scoring reads the round's frozen rules, never live settings. Source: §8.1, and F1 FR-1.15.
- **C-5.3** The score is a **mean**, not a sum, so that candidates with different vote counts stay comparable. Source: **E-07**.
- **C-5.4** The weights are non-linear by design; the numbers 0 · 1 · 3 · 5 are not an arbitrary scale. Source: `ADR-008`.
- **C-5.5** Quorum is display, never a block. A high threshold was explicitly rejected because an empty ranking demotivates the participation it depends on. Source: S-13.
- **C-5.6** Quorum means **at least** half at the default share, including on even denominators. Source: `03-PRD.md` §4.2.4 — *"Nicht „mehr als die Hälfte" — bei geradem Nenner ist es genau die Hälfte"*.
- **C-5.7** The ordering must be fully deterministic; the application id exists in the tie-break purely to guarantee that. Source: §8.3.
- **C-5.8** The veto key stays in the ordering tuple even while inert, so that the sort does not change shape when v0.2 adds the veto. Source: S-24 staging.
- **C-5.9** Hidden results are enforced server-side on every read path, never merely hidden in the client. Source: S-14, `03-PRD.md` §4.2.4.
- **C-5.10** Hidden results are a **setting with a default**, not a hard-wired rule — the underlying assumption is untested and must remain measurable. Source: S-14, check-in assumption 2.
- **C-5.11** The visibility invariant over the resident's own application is **permanent** and independent of round state, stage and settings. Source: S-31.
- **C-5.12** It is enforced twice — through the policy layer and through the data layer — and must be tested through both. Source: `ADR-004`, **G-C7** — *"sonst ist ADR-004 eine Illusion"*.
- **C-5.13** The aggregate is covered by a policy rule of its own, because row-level rules do not reach it. Source: **V-4**, `ADR-004`.
- **C-5.14** No notification, feed entry or export may become a path around the invariant. Source: S-28 visibility clause, `GUARDRAILS.md` **G-D7**/**G-D8**.
- **C-5.15** The application never sends messages to applicants; the invite text is an aid for the household. Source: S-16.
- **C-5.16** Interface text may be promotional about the **process**, never evaluative about a **person**. Every statement about several candidates must map to a real threshold and be recomputable on demand. Source: content rule **C-10**.
- **C-5.17** No AI may produce a score, ranking, recommendation or best-fit suggestion about a person — permanently. The ranking here is lawful because it aggregates human votes under disclosed rules. Source: **P-5**, and **C-10**'s reasoning.
- **C-5.18** Every personal-data field declared in `data-inventory.yml` or the build fails. Source: S-37, `ADR-010`.

---

## 6. Edge cases

| ID | Case | Required behaviour |
|---|---|---|
| **EC-5.1** | A candidate has one vote of "Must have" and the denominator is 7 | Score is 100 **and** the candidate is below quorum, so it appears in the waiting section with no rank and no score shown. This is precisely the case the section exists for |
| **EC-5.2** | Every candidate is below quorum | The ranking is empty and states why; the waiting section holds them all. No placeholder ordering is invented |
| **EC-5.3** | No candidate has any votes | All are `NO_SCORE` and all are below quorum |
| **EC-5.4** | The resident has voted on nothing | Every candidate is listed with results withheld; the list itself is not hidden |
| **EC-5.5** | The frozen weights are missing or malformed for a round | The ranking is refused with a stated reason rather than falling back to defaults, because a fallback would silently change every score |
| **EC-5.6** | All frozen weights are zero | `max(weights)` is zero and the division is undefined. Treated as EC-5.5: refused, not divided |
| **EC-5.7** | The quorum denominator is zero | Cannot occur — F1 refuses to open a round with no eligible residents (F1 EC-1.3). If encountered, the ranking is refused with a stated reason |
| **EC-5.8** | Quorum share is set to 1.0 | Every eligible resident must vote before any candidate is ranked. Permitted; the household is warned that the ranking will stay empty until participation is complete |
| **EC-5.9** | A candidate is deleted while the ranking is displayed | The ranking recomputes without it; no gap or placeholder remains |
| **EC-5.10** | A resident changes a vote after seeing the result | Permitted. The anchor they saw was their own opinion, which is the point of hiding results in the first place |
| **EC-5.11** | The only candidate at quorum is the viewing resident's own application | It is withheld from them entirely, so their ranking is empty and states why. It remains visible and ranked for everyone else |
| **EC-5.12** | A candidate reaches quorum, then a vote is withdrawn and it falls below | It moves back into the waiting section, and its rank and score stop being shown |
| **EC-5.13** | Two candidates identical on all seven tie-break keys | Impossible: the id is unique, so the seventh key always resolves. Asserted rather than handled |
| **EC-5.14** | A resident is marked ineligible after voting | Their vote remains in the score. Its removal from the quorum numerator and denominator is S-32's behaviour and arrives in v0.2 (see §7) |

---

## 7. Risks & assumptions

### Assumptions

- **A-5.1** Nobody moves out during the slice, so the former-member branch of `score_votes()` never fires. It is specified now because building the function without it means rewriting it later.
- **A-5.2** Only one voting stage exists in the slice — the invite stage. Stage-scoping is nonetheless required (FR-5.16, AC-5.19) because round two reuses the same structures in v0.2.
- **A-5.3** Candidate counts are low tens, so the ranking is computed on read without caching, and no pagination is needed.
- **A-5.4** The household accepts a ranking produced from human votes as legitimate provided the arithmetic is inspectable. This is **P-3** taken as a premise; the prototype tests it.
- **A-5.5** The slice runs on synthetic data, so the invite text is exercised as a rehearsal. With real applicants, the v0.2 gate applies first.

### Deferred behaviour worth specifying now

**S-32 — votes from former members.** The marker *"1 Stimme von einem ehemaligen Mitglied"*
arrives in v0.2, but the arithmetic is asymmetric and easy to get wrong later, so it is recorded
here: a former member's vote **stays in the score**, and drops out of **both the numerator and
the denominator** of participation and quorum displays. Building `score_votes()` and
`quorum_denominator()` without anticipating this means changing both functions in v0.2.

### Risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| **R-5.1** | `NO_SCORE` rendered as `0` | An unvoted candidate appears unanimously rejected and the household acts on it | C-5.1 with AC-5.3 and AC-5.4 as a paired protected test — the pair is what catches it, not either alone |
| **R-5.2** | Hidden results enforced only in the interface | The score is one network request away, and the product's central assumption is silently void | FR-5.17, AC-5.16 tests the data path rather than the screen |
| **R-5.3** | Self-redaction leaks through an aggregate | The affected person reads the group's opinion about them — worse than the original bug, and it fails without an error | C-5.13's separate aggregate rule, AC-5.27 |
| **R-5.4** | Self-redaction protects only *linked* applications | An earlier unlinked application from the same person leaks everything | Known gap for the slice, inherited from F3 R-3.3. Linking is S-40/S-42 in v0.2. **Do not run a second round on real data before then** |
| **R-5.5** | Quorum implemented as a block on transitions | The ranking stays empty early and demotivates the participation it depends on — the documented reason a 2/3 threshold was rejected | FR-5.9, AC-5.10 |
| **R-5.6** | Live settings leak into scoring | Changing a weight silently rewrites history and the ranking becomes indefensible | C-5.2, AC-5.5, shared with F1 R-1.1 and F4 R-4.2 |
| **R-5.7** | The ranking is read as advice about people | Drifts across the line **P-5** exists to hold, and into AGG territory if a landlord tier ever ships | C-5.16, C-5.17, AC-5.28, plus tap-to-recompute on every number |
| **R-5.8** | Hidden results do not increase participation | One of the three decisions presented at the check-in is wrong | C-5.10 keeps it a setting, so it is measurable against itself rather than assumed |

---

## 8. Review

**Still MVP-sized?** Yes, though it is the largest of the five and unavoidably so: this is where
the votes become a decision, and it carries the two things the specs are most insistent about —
the arithmetic being inspectable (**P-3**) and the visibility invariant holding (**S-31**).
Nothing here is deferrable. Remove the waiting section and one vote looks like a mandate; remove
the reveal rule and the product's second assumption is untested; remove the own-application
redaction and the product does the specific thing it exists not to do.

**Anything unclear or missing?** Three items, all flagged rather than invented:

1. **The wording of the redaction note** (FR-5.31/FR-5.32) is the most delicate copy in the
   product — it is read by someone who has just moved in, about deliberation concerning
   themselves. `03-PRD.md` **P-O-04** is still open. This should come from the prototype, not
   from this document.
2. **Whether the score is recomputed on read or stored** is a `design.md` question and
   deliberately left open here. The requirement is only that FR-5.12's determinism holds and that
   C-5.2's frozen weights are used.
3. **The behaviour at `quorum_share = 1.0`** (EC-5.8) is my inference from S-13's structure, not
   a documented decision. It needs confirmation, or a stated maximum below 1.0.

**Too complex?** The seven-key tie-break is the obvious candidate to challenge, and it survives
scrutiny: keys 1–5 all encode a stated product rule, key 6 is fairness to whoever applied first,
and key 7 exists solely so the order never wobbles between two reads. Cutting keys 3–5 would make
ties fall through to application order, which would silently favour early applicants — a fairness
regression rather than a simplification.
