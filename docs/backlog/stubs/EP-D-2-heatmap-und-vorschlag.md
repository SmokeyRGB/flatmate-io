# EP-D.2 — "Tue 17:00 — 5 of 7 can make it" · stub

> **Status:** stub · V0.1 · 2026-09-09
> **Band:** `v0.2`, solver `v1.1`
> **Scope lines:** S-18, S-21 (slot reactions), S-19 + S-20
> **Epic:** EP-D — Organize In-Person Casting
> **Not yet detailed.** This is a placeholder so the goal is visible and its scope lines are
> traceable. A full requirements packet gets written at the start of the band that carries it.

## What this goal is

*Goal: the group lands on a time that works and can see why it works, including when the
automatic solver is unavailable.* The stories ask for a heatmap of how many residents can make
each slot, greying out slots an applicant cannot make anyway, placing slots by hand, setting
house rules once ("not before 18:00", "at most N castings a day"), and pressing "calculate a
proposal" to read why those slots were picked.

## Scope lines it carries

| Line | What it is | Band | Note |
|---|---|---|---|
| S-18 | Availability grid with heatmap ("4/7 can"), manual `Slot` placement, per-applicant feasibility check **without** a solver | `v0.2` | — |
| S-21 | Slot reactions: residents react to individual `Slot`s (👍 / "cannot"), moderator confirms the `Appointment` | `v0.2` | Slot-reaction half only — appointment confirmation itself belongs to the next goal |
| S-19 | "Calculate a proposal": deterministic constraint solver behind a swappable solver port; household preferences as weights and constraints | `v1.1` | — |
| S-20 | Explainability as a mandatory feature: naming which soft terms were violated, relaxing hard constraints in a fixed order when unsolvable, and never returning a silent failure at the time limit | `v1.1` | Travels with S-19 — the solver and its explanation are one scope line pair |

## What already exists in v0.1

Nothing. Per `docs/backlog/roadmap.md`'s own lane count, EP-D has zero rows in v0.1.

## Before this is detailed

- This band depends on v0.1 shipping first — `02-SRD.md` §5.4 lists v0.1 as v0.2's dependency.
- The solver (S-19, S-20) is one of the five features `docs/HYPOTHESES.md` names under its build
  freeze — solver, calendar, veto, notifications and PWA are held back until the prototype round
  reports. `02-SRD.md` §5.4 adds that the solver is also the single most expensive architecture
  decision in the project (`ADR-005`), and building it before a full manual round exists is the
  ordering the phase cut was written to rule out.
- S-18's solver-free feasibility check must exist and work completely before the solver is built
  on top of it — `02-SRD.md` §7 names it as the required fallback if the solver is ever
  unavailable.
