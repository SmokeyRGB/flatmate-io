# F3 — Capture an application · requirements

> **Feature:** [F3 — Capture an application, on the record](../MVP%20Backlog%20Features/F3-capture-an-application.md)
> **Band:** `v0.1` · **Scope lines:** S-08 (form half only), S-38, manual-delete half of S-33
> **Screens:** O3 Capture application · O4 Pipeline
> **Status:** V1.0 · 2026-09-08
>
> **`requirements.md` only — what must be built, not how.**

---

## 1. Scope

A moderator types an application into a form, records where the data came from, and sees all
applications of the round grouped by state.

**In scope:** the capture form with one required field · the two-axis record of technical path and
collection source · the Art. 14 notice and its copy-paste text · the pipeline view · deleting a
single application.

**Out of scope:** the paste-parser and everything attached to it, including discarding paragraphs
of a raw message (S-39, moved to v0.2 — see §8) · portal API · scraping · attachments and file
upload · AI parsing · **any AI judgement, summary, ranking or recommendation about an applicant**
· retention automation and its warning · linking a person's earlier application (S-40, v0.2) ·
subject-access export (S-34, v0.2 gate).

---

## 2. User stories

| ID | Story |
|---|---|
| **US-3.1** | As a moderator, I want to type an application into a form when it arrived by phone or in person, so that word-of-mouth applicants are not second-class. |
| **US-3.2** | As a moderator, I want to save an application with nothing but a name, so that a partial application is still an application. |
| **US-3.3** | As a moderator, I want contact, age and the message text to be optional, so that I record what I have rather than inventing the rest. |
| **US-3.4** | As a moderator, I want to record whether the details came from the applicant or from someone else, so that the household knows which information duty applies. |
| **US-3.5** | As a moderator, I want to be told about the one-month notice duty when the data came from a third party, so that I do not miss a deadline I did not know existed. |
| **US-3.6** | As a moderator, I want a ready text to send when that notice is due, so that the duty is dischargeable in practice. |
| **US-3.7** | As a moderator, I want to see every application grouped by its current state, so that I can tell what still needs doing. |
| **US-3.8** | As a moderator, I want to delete a single application without touching the rest of the round, so that a duplicate does not force me to start over. |

---

## 3. Functional requirements

### Capture

- **FR-3.1** The system shall allow an account holding the create-applicant permission to capture an application against an **open** casting round.
- **FR-3.2** The capture form shall require exactly one field: the applicant's name.
- **FR-3.3** The capture form shall offer as optional: age, email, phone, other contact, the applicant's message text, and further free attributes.
- **FR-3.4** The system shall record the technical intake path of every application. For this feature the value is always the manual form.
- **FR-3.5** The capture form shall not offer structured input fields for special categories of personal data — health, religion, ethnic origin, sexuality, political opinion, trade-union membership — in any language.
- **FR-3.6** On save, the application shall be created in state `new`.
- **FR-3.7** Every application creation, modification and deletion shall be recorded as an append-only audit entry naming the account and the acting profile.

### Collection source and the information duty

- **FR-3.8** The capture form shall require a collection source with exactly two values: from the data subject, or from a third party.
- **FR-3.9** The collection source shall be **visibly presented** in the form with "from the data subject" pre-selected, and the stored value shall never be implicit.
- **FR-3.10** The system shall not derive the collection source from the technical intake path.
- **FR-3.11** Where the collection source is a third party, the system shall display that the applicant must be informed within one month of capture.
- **FR-3.12** Where the collection source is a third party, the system shall provide a copy-paste text discharging that duty, available at capture time and afterwards from the application.
- **FR-3.13** The system shall not send that text. It is provided for the household to send through whichever channel the applicant used.

### Pipeline

- **FR-3.14** The pipeline shall list all applications of the selected round grouped by state.
- **FR-3.15** The pipeline shall show, per application, at least the applicant's name and the current state.
- **FR-3.16** Where a round has no applications, the pipeline shall state that rather than displaying an empty surface.

### Deletion

- **FR-3.17** The system shall allow deletion of a single application at any time, without affecting any other application or the round itself.
- **FR-3.18** Deleting an application shall delete the votes cast on it, in the same operation.
- **FR-3.19** Deletion shall require an explicit confirmation naming the applicant.
- **FR-3.20** Deletion shall be recorded as an audit entry; the entry shall not retain the applicant's personal data.

---

## 4. Acceptance criteria

**AC-3.1 — A name is enough**
Given the capture form, when I enter only an applicant name and save, then the application is created in state `new`.

**AC-3.2 — The name is required**
Given the capture form, when I save with the name empty, then no application is created and the name field is named as missing.

**AC-3.3 — Optional fields accept nothing**
Given the capture form, when I save with age, all contact fields and the message text empty, then the application is created.

**AC-3.4 — Capture requires an open round**
Given no casting round of this household is `open`, when I open the capture form, then capture is unavailable and the reason states that no round is open.

**AC-3.5 — Permission is enforced**
Given I do not hold the create-applicant permission, when I attempt to capture an application by any route, then the attempt is refused.

**AC-3.6 — The collection source is visible and pre-selected**
Given the capture form, when it is displayed, then the collection source is visible with "from the data subject" pre-selected.

**AC-3.7 — The collection source is stored explicitly**
Given I save an application without touching the collection source, when the stored record is inspected, then the collection source holds "from the data subject" as an explicit value and not as an absent or null field.

**AC-3.8 — Third party triggers the notice**
Given the capture form, when I set the collection source to "from a third party", then the one-month information duty is displayed before I save.

**AC-3.9 — The notice text is available**
Given an application whose collection source is "from a third party", when I open it, then a copy-paste text discharging the Art. 14 duty is available.

**AC-3.10 — The system sends nothing**
Given the copy-paste text is displayed, when I look for a send action, then none exists.

**AC-3.11 — Source is not derived**
Given two applications captured through the same manual form, when one is marked "from a third party" and the other "from the data subject", then both retain the value chosen, and neither is overwritten by the intake path.

**AC-3.12 — No special-category fields exist**
Given the capture form, when every input is enumerated, then none of them is a structured field for health, religion, ethnic origin, sexuality, political opinion or trade-union membership.

**AC-3.13 — The pipeline groups by state**
Given a round with applications in states `new` and `screened`, when I open the pipeline, then the applications appear grouped under their respective states.

**AC-3.14 — Empty pipeline states itself**
Given a round with no applications, when I open the pipeline, then a message states that no applications exist and no empty surface is shown.

**AC-3.15 — Single deletion is isolated**
Given a round with three applications, when I delete one, then the other two and the round are unchanged.

**AC-3.16 — Deletion removes the votes with it**
Given an application carrying four votes, when I delete it, then those four votes no longer exist and no other application's votes are affected.

**AC-3.17 — Deletion is confirmed**
Given I trigger deletion, when the confirmation appears, then it names the applicant, and cancelling leaves the application intact.

**AC-3.18 — The audit entry keeps no personal data**
Given I delete an application, when the audit entry is inspected, then it records that a deletion occurred, by whom and when, and does not contain the applicant's name, contact details or message text.

---

## 5. Constraints

- **C-3.1** Exactly one required field. Source: S-08 — *"Name Pflicht; Kontakt, Alter, Freitext, weitere Angaben optional"*.
- **C-3.2** The collection source is required, visible and never derived from the technical path, and never silently defaulted. It decides Art. 13 against Art. 14 and therefore whether a one-month duty exists. Source: S-38.
- **C-3.3** No inviting structured fields for special categories. Source: content rule **C-5** in `03-PRD.md` §4.6.
- **C-3.4** The applicant's free-text message remains an **unavoidable** special-category risk, because applicants volunteer such things in prose. This risk is accepted and named, never designed in. Source: `04-Domaenenmodell.md` (`Application.message_raw`).
- **C-3.5** No applicant free text may be sent to a model without a legal basis and a data-processing agreement. Source: content rule **C-8**.
- **C-3.6** No AI may produce an evaluation, ranking, recommendation or pre-selection about an applicant — permanently, not just in the MVP. Source: **P-5**.
- **C-3.7** The manual form must exist and be complete before any parser is built. Source: **P-1**, `ADR-009`.
- **C-3.8** Every intake path must produce the same domain object. Nothing here may create a form-only shape that a later parser cannot fill. Source: `ADR-009`.
- **C-3.9** The application never contacts applicants. Source: S-16 and S-08 out-of-scope lists.
- **C-3.10** All eleven application states and their permitted transitions exist from the start, even though this slice only reaches `screened` and `invited`. Source: S-15, `ADR-002`.
- **C-3.11** Free text must always have a retention deadline attached. The automation is v0.2, but no field may be introduced here that is exempt from it. Source: content rule **C-6**, S-33.
- **C-3.12** Authorization enforced independently of the client, verified through both the policy layer and direct data access. Source: S-36, `ADR-004`, **G-C7**.
- **C-3.13** Every personal-data field declared in `data-inventory.yml` or the build fails. This feature introduces the most such fields in the slice. Source: S-37, `ADR-010`.

---

## 6. Edge cases

| ID | Case | Required behaviour |
|---|---|---|
| **EC-3.1** | Two applicants with the same name | Both are created. They are different people; no deduplication and no warning |
| **EC-3.2** | The same person applies twice in one round | Both applications exist independently. Linking them is S-40 (v0.2); until then this is the known gap in the visibility invariant — see R-3.3 |
| **EC-3.3** | An applicant is also a current resident | Permitted at capture. The visibility invariant only protects applications explicitly linked to a resident profile, and linking is v0.2 |
| **EC-3.4** | A very long message text is pasted into the free-text field | Accepted up to a stated limit; the limit is shown before it is hit rather than on rejection |
| **EC-3.5** | The collection source is changed from data subject to third party after saving | The one-month duty is displayed from the moment of the change, and the copy-paste text becomes available |
| **EC-3.6** | The collection source is changed from third party to data subject | Permitted and audited; the previously displayed duty does not disappear from the audit trail |
| **EC-3.7** | An application is deleted while a resident is mid-screening | The card disappears from that resident's deck; the pass continues with the remaining cards and does not error |
| **EC-3.8** | An application is deleted after the ranking has been displayed | The ranking recomputes without it; no placeholder or gap remains |
| **EC-3.9** | The round is closed while the capture form is open | Save is refused with the reason that the round is no longer open |
| **EC-3.10** | Only whitespace is entered as the name | Treated as empty; refused per AC-3.2 |
| **EC-3.11** | Two moderators capture the same applicant simultaneously | Both applications are created. This is EC-3.1 and needs human resolution, not a technical one |

---

## 7. Risks & assumptions

### Assumptions

- **A-3.1** Applications per round are in the low tens, so the pipeline needs no search, filtering or pagination.
- **A-3.2** The moderator has the applicant's message in front of them and can retype or paste it into the free-text field. The parser's absence costs time, not information.
- **A-3.3** The slice runs on **synthetic data**, so the Art. 14 duty is exercised as a rehearsal. With real applicants, the v0.2 gate — privacy notice page, retention automation, subject-access export, data-processing agreement — applies before capture.
- **A-3.4** Applications belong to a round; there is no household-level applicant pool.

### Risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| **R-3.1** | The collection source gets a silent default or is derived from the intake path | The household believes it owes Art. 13 when it owes Art. 14, and misses a statutory one-month deadline | C-3.2, AC-3.7 and AC-3.11 as protected tests |
| **R-3.2** | The duty is displayed but never dischargeable | The household knows it has an obligation and cannot meet it — worse than not knowing | FR-3.12 ships the text in the same step, not "later" |
| **R-3.3** | An unlinked earlier application from a person who later moves in | Deliberation about them stays visible to them. `03-PRD.md` is explicit that this *"leckt genau das, was die Invariante verhindern soll — ohne Fehlermeldung"* | Known and accepted for the slice. **Do not run a second round on real data before S-40/S-42 exist.** Recorded as R3 in the MVP README |
| **R-3.4** | Special-category data arrives in the free text | Unavoidable, and it lands in the most sensitive field in the model | C-3.4 accepts it; C-3.5 and C-3.6 keep models away from it; C-3.11 keeps it on a deletion clock |
| **R-3.5** | Deletion cascade is implemented as a soft delete | The record survives the household's intent to remove it, and the retention story becomes untrue | FR-3.18 is a real deletion. A recycle bin with indefinite restore is on S-33's out-of-scope list |
| **R-3.6** | A form-only shape is built that a later parser cannot populate | `ADR-009` channel neutrality breaks and the parser becomes a second intake model | C-3.8, checked when the parser is specified in v0.2 |

---

## 8. Review

**Still MVP-sized?** Yes, and it became smaller during refinement: **S-39** (discarding paragraphs
of a raw message before saving) was moved out of this feature and out of `v0.1` entirely. Its own
wording ties it to the parser step — *"im Paste-Parser-Schritt"* — and in a form-only path there is
no raw message to discard paragraphs from. `02-SRD.md` §5.4 has been corrected.

**Anything unclear or missing?** Two decisions this document had to make, both flagged rather than
buried:

1. **Deleting an application deletes its votes** (FR-3.18). No scope line states this. The
   alternative — orphaned votes, or a soft delete — would either corrupt F5's arithmetic or make
   the deletion untrue. Recorded here as a decision needing confirmation, not as an established
   rule.
2. **The free-text length limit** (EC-3.4) has no value anywhere in the spec chain. A limit is
   needed, because unbounded text in the most sensitive field is its own risk. **Not invented
   here** — it needs a number.

**Too complex?** No. The one part that looks like overhead — the two-axis collection source — is
the cheapest thing in the feature to build and the most expensive thing to retrofit, because it
must be recorded at the moment of capture or not at all.
