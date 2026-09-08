# F3 — Capture an application, on the record

> **Band:** `v0.1` · **Scope lines:** S-08 (form half only), S-38, plus the manual-delete half of S-33
> **Screens:** O3 Capture application · O4 Pipeline

---

## MVP backlog item

**Feature:** Type an application into a form, recording where the data came from, and see all
applications in one place.

**User problem:** Applications arrive by four channels and end up copy-pasted into a group chat,
where they scroll away. Nobody can say how many there are, which have been dealt with, or — when
an applicant eventually asks — where their data came from and what the household owes them.

**Expected outcome:** Every application is the same record regardless of how it arrived, with a
human confirming it and the collection source on the record. The household can answer "what do
you hold about me?" from the system rather than from memory.

**Description:** A form with exactly one required field: the applicant's name. Everything else —
contact, age, the message text — is optional. A visible, non-default choice records whether the
details came from the applicant or from a third party, because that decides Art. 13 against
Art. 14 and, in the third-party case, a one-month duty to inform. A pipeline view groups
applications by state. Any single application can be deleted without touching the round.

---

## Epic readiness

**What problem are we solving?** Applications have no shared home, and the legal position of the
data in them is unrecorded at the moment it is created — which is the only moment it is cheap to
record.

**For whom?** The moderating resident doing the intake, and — indirectly and most importantly —
the applicant, who is the one person in this system with no account and no say.

**What changes if we succeed?** The screening in F4 has something to screen. And the household
can discharge its Art. 13/14 duty as controller, which is the premise the whole privacy
architecture rests on.

**What are we *not* doing?** No paste-parser (that is v0.2, and **P-1** requires this manual path
to exist first). No portal API, no scraping, no attachments or file upload. No AI parsing — and
never AI *judgement* about the applicant (**P-5**, permanently excluded). No automatic derivation
of the collection source from the technical path, and no silent default.

---

## Activities → Steps → User stories

### Activity 1 — Enter an application

**Steps:** open the form → type what you have → save

- As a moderator, I want to **type an application into a form** when it arrived by phone or in
  person, so that word-of-mouth applicants are not second-class.
- As a moderator, I want to **save an application with nothing but a name**, so that a partial
  application is still an application rather than a blocked form.
- As a moderator, I want **contact, age and the message text to be optional**, so that I record
  what I actually have instead of inventing the rest.

### Activity 2 — Record where the data came from

**Steps:** choose the collection source → be told what follows from it → get the text to send

- As a moderator, I want to **record whether the details came from the applicant or from someone
  else**, so that the household knows which information duty applies.
- As a moderator, I want to **be told about the one-month notice duty** when the data came from a
  third party, so that I do not miss a deadline I did not know existed.
- As a moderator, I want a **ready text to send** when that notice is due, so that the duty is
  dischargeable in practice and not just on paper.

### Activity 3 — See them all in one place

**Steps:** open the pipeline → see states → act on one

- As a moderator, I want to **see every application grouped by its current state**, so that I can
  tell at a glance what still needs doing.
- As a moderator, I want to **delete a single application without touching the rest of the
  round**, so that a duplicate or a mistake does not force me to start over.

---

## What the implementation must get right

**One required field.** `applicant_name`. Optional: `age`, `contact_email`, `contact_phone`,
`contact_other`, `message_raw`, `attributes` (jsonb).

**Two axes, not one.** They are separate fields and must not be derived from each other:

| Field | Meaning | Values |
|---|---|---|
| `Application.source` | the **technical** intake path | manual form, paste-parser, link, portal |
| `Application.collected_from` | the **legal** collection source | `data_subject` · `third_party` |

`collected_from` is **required, visible, and has no silent default**. `03-PRD.md` carries the
acceptance criterion: it is shown in the capture form pre-selected as `data_subject`, and the
value is *"nicht nur implizit gesetzt"*. Third party ⇒ Art. 14 ⇒ inform the applicant **within
one month**, with a copy-paste snippet offered at that point.

**No inviting structured fields for Art. 9 categories** (content rule **C-5**). No dropdown for
religion, health, origin, sexuality, politics or union membership — not even a well-meant one.
`message_raw` remains an unavoidable Art. 9 risk because applicants volunteer such things in
prose; that risk is accepted and named, not designed in.

**`Application.state`** starts at `new` and reaches `screened` and `invited` within this slice.
Build the whole 11-state transition table anyway (see Feature 0) — the table is declarative, and
retrofitting states over booleans is not.

**Manual delete is in scope; the automation is not.** `S-33`'s per-application delete ships here,
because otherwise test data cannot be cleared. The 180-day automation with its 14-day warning is
part of the v0.2 gate.

**Every personal-data column must be declared in `data-inventory.yml`** or CI fails (**S-37**,
`ADR-010`). This feature adds the most personal-data columns of any in the slice, so it is where
the gate earns its place.

---

## Correction this feature forced on the specs

**S-39 (discard paragraphs before saving) has been moved from v0.1 to v0.2.** Its own wording ties
it to the parser — *"im Paste-Parser-Schritt kann der Haushalt einzelne Absätze der Rohnachricht
verwerfen"* — and in a form-only path there is no raw message to discard paragraphs from: whoever
types the text simply does not type them. Keeping S-39 in v0.1 would have meant building an
interaction with no input. `02-SRD.md` §5.4 has been updated.

---

## Risks

| Risk | Consequence | Handling |
|------|-------------|----------|
| `collected_from` gets a silent default | The household believes it owes Art. 13 when it owes Art. 14, and misses a one-month statutory deadline | Required field, visible, no derivation from `source`. Cover with a protected test |
| The one-month notice is shown but never actionable | The duty is documented and undischarged, which is worse than not knowing | Ship the copy-paste snippet in the same step, not "later" |
| An applicant re-applies and the old record is not linked | Deliberation about them stays visible after they move in — the **R3** hole in the README | Known and accepted for the slice. Do not run a second round on real data before S-40/S-42 exist |
| Free-text carries Art. 9 data | Unavoidable, and it sits in the most sensitive field in the model | Retention clock applies to it (v0.2 gate); no AI is ever pointed at it without a legal basis and a processing agreement (**C-8**) |
