# EP-B.3 — Know where the data came from (remainder) · stub

> **Status:** stub · V0.1 · 2026-09-09
> **Band:** `v0.2` gate, partly `v1.1`
> **Scope lines:** S-33 (automation half), S-34, S-41 (data model half)
> **Epic:** EP-B — Every Application in One Place
> **Not yet detailed.** This is a placeholder so the goal is visible and its scope lines are
> traceable. A full requirements packet gets written at the start of the band that carries it.

## What this goal is

*Goal: for any applicant we can say where the data came from, and, if they request it, hand it
over.* This stub covers the **remainder** of that goal after the v0.1 slice: automatic retention
with its warning, producing a data export for one applicant, and the data model behind an
applicant's own counter-statement.

## Scope lines it carries

| Line | What it is | Band | Note |
|---|---|---|---|
| S-33 | Retention automation: 180-day default, 14-day advance warning with extend/delete-now/archive, household-adjustable | `v0.2` gate | Automation half only — manual per-`Application` deletion is already v0.1, owned by `F3` |
| S-34 | "Produce a data export" per `Application`: export of everything held on that person | `v0.2` gate | — |
| S-41 | `Application.subject_statement` — the applicant's own counter-statement, inheriting the parent record's retention | `v0.2` (data model) | Interface for writing/reading it is `v1.1` |

## What already exists in v0.1

Manual per-`Application` deletion (the other half of S-33) is already built and owned by `F3`
(`FR-3.17`–`FR-3.20`, `AC-3.15`–`AC-3.18`). The two-axis capture of collection source
(`data_subject` / `third_party`) that this goal's other stories describe — including the
one-month third-party notice duty — is also already fully in v0.1 as **S-38**, owned by `F3`.

## Before this is detailed

- `02-SRD.md` §5.4 names this an explicit **gate before the first real household**: retention
  automation, the export, a click-through data-processing agreement, a published Art. 13 privacy
  page and a sub-processor list are meant to land together, not piecemeal.
- The legal role construction behind this gate — household as controller, Flatmate.io as
  processor — is `docs/HYPOTHESES.md`'s H-F1, which resolves to the launch-blocking `Q-1`–`Q-4`
  legal questions in `06-Compliance-Anhang.md` §13; those need legal review before this can be
  built with confidence.
- S-41's interface half is `v1.1` and depends on this data model landing first — `02-SRD.md` §5.4
  places `v1.1` as depending on `v1` (the end of `v0.2`).
