# MVP Backlog — Flatmate.io

**Five features that together make one working product.** Not five features that could each be
demoed alone — the point of the cut is that a real household can run the first half of a casting
round end to end without falling back to WhatsApp.

> **Status:** V1.0 · 2026-09-08 · Samuel Zink (@SmokeyRGB)
> **Band:** `v0.1` in `02-SRD.md` §5.4 — the vertical slice
> **Source of truth:** `02-SRD.md` §5.3 (scope lines `S-*`), `03-PRD.md`, `04-Domaenenmodell.md`
> (formulas), `07-Screen-Inventar.md` (screens), `GUARDRAILS.md` (enforcement)
> **Language:** English, following the Exercise 10 precedent. `ADR-012` keeps identifiers English
> anyway, so the seam is small.

---

## The five features

| # | Feature | Scope lines | Screens |
|---|---------|-------------|---------|
| [F1](F1-open-a-casting-round.md) | Open a casting round for the rooms you are actually casting for | S-01, S-02, S-04, S-06, S-07, S-35 | A1, O1 ⚡, O2, O14 |
| [F2](F2-join-in-two-fields.md) | Join in two fields, and land on the one thing to do next | S-03, S-49, S-50, S-48 | A3 ⚡, B1 ⚡ |
| [F3](F3-capture-an-application.md) | Capture an application, on the record | S-08 (form half), S-38, S-39 | O3, O4 |
| [F4](F4-screen-and-vote.md) | Screen the applications card by card, four ratings | S-09, S-10 | C1 ⚡ |
| [F5](F5-ranking-hidden-until-you-vote.md) | A ranking you can check, hidden until you have voted | S-12, S-13, S-14, S-16, S-31 | D1 ⚡, D2, D3 |

All **four** ⚡ screens that `07-Screen-Inventar.md` marks *"Kernbildschirm — hier entscheidet
sich das Produkterlebnis"* (B1, C1, D1, O1) sit inside these five features. The slice is about
15 of 41 screens but 4 of 4 core ones.

**End-to-end chain:** F1 creates the round → F2 gets the residents in → F3 puts applications in
one place → F4 collects the votes → F5 turns them into a ranking. Remove any one and the chain
breaks.

---

## Feature 0 — the substrate, which is not optional

These are not user stories and nobody would put them in a pitch. They are in the MVP because
`02-SRD.md` §5.4 says they cannot be retrofitted:

> *"Beide bestimmen jede Abfrage im System. Nachträglich eingezogen müsste jede bestehende
> Abfrage angefasst werden — und bei AI-gestützter Implementierung ist genau das der Weg, auf
> dem eine vergessene Bedingung zum Datenleck wird."*

| Line | What | Why it cannot wait |
|------|------|--------------------|
| **S-36** | Authorization enforced **twice**: central policy objects **and** Postgres row-level security (`ADR-004`) | Retrofitting means touching every query. `GUARDRAILS.md` **G-C7** requires the invariant to be tested through the policy layer *and* through raw SQL — *"sonst ist ADR-004 eine Illusion"* |
| **S-31** | Visibility invariant over `Application.became_resident_id`, doubly enforced | Same, and it is the difference between this product and a WhatsApp group |
| **S-15** | `Application` transition table, all 11 states, backward transitions audited (`ADR-002`) | Retrofitting means migrating booleans to states |
| **S-37** | `data-inventory.yml` as a **CI gate** (`ADR-010`) | It *is* a gate. Added late it meets a schema already full of undeclared columns — `04-Domaenenmodell.md` §9 has drifted three times for exactly this reason |
| **S-27** | Append-only `ActivityEvent` log (log only; the feed UI is v0.2) | S-15's audited backward transitions have nowhere to be recorded without it |

**Build S-15's full transition table even though the slice only reaches `invited`.** The table is
declarative; writing 11 states costs almost nothing, and migrating flags to states later costs a
lot.

---

## What is deliberately NOT in the MVP

| Not now | Why | Lands in |
|---------|-----|----------|
| Paste-parser for applications | **P-1**: every convenience sits over a complete manual path, and the manual path must exist first. F3 ships the form only | v0.2 |
| Scheduling: availability grid, heatmap, slot placement, appointment confirmation | Past the slice. The check-in defers it explicitly: *"before I continue building e.g. complex appointment solver mechanisms"* | v0.2 |
| Casting notes and the post-casting reminder | No casting happens in the slice | v0.2 |
| Round 2, `Veto`, the offer, move-in, invite token | The decision half of the journey | v0.2 |
| Second pass over your own "Must have" cards | Needs a real over-budget situation to be worth anything | v0.2 |
| Retention **automation** with its 14-day warning | The slice runs on synthetic data. Manual per-application delete **is** in F3 | v0.2 (gate) |
| Notifications, digest, Web Push, participation badges | In-app state is enough while one household is watching | v0.2 |
| Installable PWA and the install nudge | A browser tab is enough to test participation | v0.2 |
| Activity feed **UI** | The append-only log is in Feature 0; the screen is not | v0.2 |
| Soft round deadline and its countdown | Optional, blocks nothing, and with one open task type S-48 has nothing to sort | v0.2 |
| **Solver** — "calculate a proposal" and its explainability | The single most expensive decision in the project (`ADR-005`), and pure convenience over hand-placed slots | v1.1 |
| Calendar view | Convenience over data already stored | v1.1 |
| Applicant availability token page, `subject_statement` UI, points-budget option, donation email | Already v1.1 in §5.4 | v1.1 |
| Browser extension, AI extraction, calendar sync, landlord persona, freemium | Already v1.2 / v2 | v1.2 / v2 |
| **Any AI judgement about a person** — summaries, rankings, recommendations, pre-selection | **P-5**, permanently excluded. Not a scheduling decision | never |

---

## The gate before real applicants

The slice runs on **synthetic data**. Before the first real household, four things must ship —
they are v0.2, but they belong in this document because discovering them at launch would be
expensive:

- Click-through **AVV** (data processing agreement), versioned, acceptance logged as an `ActivityEvent`
- Per-household **Art. 13 privacy notice page**, unreachable via any code path while `draft` (**G-C9**)
- **S-33** retention automation with its 14-day warning — `06-Compliance-Anhang.md` calls deletion *"im Prinzip nicht optional"*
- **S-34** subject-access export, and the still-open sub-processor list the AVV depends on

`06-Compliance-Anhang.md` marks **Q-1 … Q-4** as *"launch-blockierend"*. They do not block
building against synthetic data. They do block pointing this at someone's real applicants.

---

## Biggest risks

| # | Risk | Why it is at the top | Mitigation in the MVP |
|---|------|---------------------|-----------------------|
| **R1** | **Participation does not happen.** The core metric is >80 % of eligible residents casting at least one vote (**E-24**) | It is the entire product thesis. Everything else is means | F2 removes every step before the first vote: no email, no install, no verification. F4 targets one sitting, four taps |
| **R2** | **The visibility invariant leaks.** A resident reads a vote written about them | `03-PRD.md` is blunt about the failure mode: it *"leckt genau das, was die Invariante verhindern soll — ohne Fehlermeldung"*. It fails silently | Doubly enforced (S-36), tested through policy **and** raw SQL (**G-C7**), with its own screen D3 in F5 |
| **R3** | **`became_resident_id` is set by hand**, so the invariant protects only *linked* applications | An older, unlinked application from the same person carries deliberation about them and leaks it | The regular path (invite token, S-42) sets it at registration — but that is v0.2. In the slice this is a known hole: do not run a second round on real data before S-40/S-42 exist |
| **R4** | **Hidden results may not raise participation** — the assumption is untested | One of the three decisions presented at the check-in, with no interview data behind it yet | S-14 is a setting with a default, not a hard-wired rule, so it can be measured against itself |
| **R5** | **Solo capacity against the scope.** `review-log.md` §Multi-Rollen-Review logs an open 🔴: *"Keine Aufwandsschätzung, nirgends"* | The v0.1/v0.2 split in §5.4 **is** the counter-check that gap demands — but it is a cut, not an estimate | Five features, one form path, no solver, no notifications, no PWA |
| **R6** | **Seven ADRs the slice rests on are still `Vorschlag — anfechtbar`** | ADR-001, -002, -004, -006, -008, -010, -012. A later contest invalidates code, not a paragraph | Confirm them, or record the objection, before the first line of code |
