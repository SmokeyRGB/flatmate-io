# Legal and Ethical Reality Check - Flatmate.io

## Scope and Sources
This assessment is based on specification files 01-06 of Flatmate.io.

- 01-Problem-Framing.md
- 02-SRD.md
- 03-PRD.md
- 04-Domaenenmodell.md
- 05-ADRs.md
- 06-Compliance-Anhang.md

This document is a product/compliance assessment, not legal advice.

---

## 1. Which personal data is processed (directly or indirectly)?

### Direct personal data
- Applicant profile data: name, age, contact email, phone, and other contact channels.
- Applicant free text: original message text, decision notes, rejection reasons, and subject statements.
- Resident/account data: account email, password hash, email verification status, membership role, moved_out status.
- Scheduling data: availability windows, appointments, location notes, and time constraints.
- Operational metadata: activity events, state changes, login/session data, sent/read notification timestamps.

### Evaluation-related personal data
- Votes, vetoes, and casting notes about applicants.
- Derived score and ranking position.
- Aggregated mood distribution and quorum-related participation status.

### Sensitive data risk (special category spillover)
- Applicant free text may include health, religion, ethnicity, sexual orientation, or union-related details.
- This is an explicit high-risk area in the specs, even if not requested by the product.

### Indirect/inferred personal data
- Inferred "fit" and selection probability from vote/rank patterns.
- Inferred behavior patterns from response speed and participation logs.

---

## 2. Who owns the generated output?

The specs clearly define data responsibility, but not full IP ownership wording.

### Responsibility by data domain
- Applicant decision outputs (scores, rankings, notes, access exports): Household is controller; Flatmate.io acts mainly as processor.
- Platform operation outputs (security logs, service operation, product metrics): Flatmate.io is own controller.

### Ownership gap
- The specs do not yet define explicit contractual IP ownership language for generated artifacts.
- This should be clarified in Terms and processor agreement text.

---

## 3. What licenses apply?

### Training data (if known)
- v1: no model training flow is specified; parsing is rule-based and scheduling is deterministic optimization.
- v2 possibility: specs require EU processing, AVV/subprocessor disclosure, and no training on applicant input.
- Final vendor/model license terms are unknown because no model vendor is fixed yet.

### Generated code
- No repository license file is currently defined in the Flatmate.io idea folder.
- Without an explicit license, default copyright applies.
- If AI-generated code is later reused broadly, provenance checks should be included before production release.

---

## 4. Who is liable if AI causes harm?

### Current v1 posture
- P-5 explicitly forbids AI-based evaluation/ranking/recommendation of people.
- Therefore direct AI decision harm is intentionally minimized in v1 scope.

### Liability split from specs
- Household: primary controller liability for applicant-data lawfulness and rights handling.
- Flatmate.io: processor liability for instruction-bound processing and security, plus own-controller liability for platform data.

### Critical legal caveat
- If role allocation is reclassified as joint controllership, liability and duties change significantly.

---

## 5. What would a regulator or lawyer ask first?

1. Is the Household/Flatmate.io role split valid, or is this joint controllership?
2. Does the household exemption truly not apply in this concrete scenario?
3. Is the click-through AVV legally sufficient (content and form)?
4. What is the lawful basis for incidental special-category data in applicant free text?
5. Is a DPIA required due to people evaluation and housing-access context?
6. Are retention/deletion claims technically enforceable across live data, logs, and backups?
7. Can the team prove that no prohibited AI decisioning is happening now or later?

---

# Compliance Checklist

## Open Risks
- High: Role model may be reclassified to joint controllership.
- High: Incidental special-category free-text handling may be challenged.
- High: AI-boundary drift risk if future features move from extraction to recommendation.
- Medium: 180-day retention rationale may be disputed in WG context.
- Medium: Tombstone/redaction strategy for audit logs may conflict with deletion expectations.
- Medium: Re-identification risk in small households despite author-redaction in exports.
- Medium: Landlord monetization scenario materially increases AGG and AI Act exposure.

## Assumptions
- Household is controller for applicant decision data.
- Flatmate.io is processor for applicant decision data and own controller for platform data.
- v1 remains non-AI for person evaluation and recommendation.
- Rule-based parsing and deterministic optimization remain inside current legal boundary.
- No tracking/fingerprinting is used; only necessary session mechanisms are used.

## Unknowns
- No explicit IP ownership clause for generated outputs in current specs.
- No final software license chosen for project artifacts.
- No final named subprocessor list (hosting/email vendors still TBD).
- DPIA requirement is unresolved.
- Final legal position on household exemption and special-category incidental processing is unresolved.
- Future model-vendor terms, retention guarantees, and no-training commitments are not yet contracted.

---

## Practical Next Actions (for Exercise follow-up)
1. Add explicit ownership clauses for generated outputs in Terms and AVV text.
2. Select and publish a project license for code and documentation.
3. Finalize named subprocessor list and disclosure process.
4. Decide and document DPIA go/no-go with legal review.
5. Create a release gate that blocks any feature violating P-5.
