# EP-E.1 — Round two, with a veto that ranks instead of deletes · stub

> **Status:** stub · V0.1 · 2026-09-09
> **Band:** `v0.2`
> **Scope lines:** S-23, S-24
> **Epic:** EP-E — Decide, Offer, Welcome the New Flatmate
> **Not yet detailed.** This is a placeholder so the goal is visible and its scope lines are
> traceable. A full requirements packet gets written at the start of the band that carries it.

## What this goal is

*Goal: the group decides on an offer, and one person can say a strong no without blocking
everyone.* The stories ask for voting on the people actually met with the same four ratings,
seeing the round-two ranking in the same layout as round one, placing a veto with a reason,
seeing that a veto ranks a candidate low rather than deleting them, losing the ability to veto
once an offer has gone out, and being told honestly that an anonymous veto in a five-person
household is not really anonymous.

## Scope lines it carries

| Line | What it is | Band | Note |
|---|---|---|---|
| S-23 | Round-2 vote over screened candidates, same four-level scale as round 1 | `v0.2` | — |
| S-24 | `Veto`: ranks low instead of deleting; configurable reason requirement, per-round budget (default 1), opt-in anonymity with an honest group-size notice, locked at the `offer_made` phase boundary | `v0.2` | — |

## What already exists in v0.1

The four-level rating scale and its screening pattern that S-23 reuses for round two are already
built and owned by `F4` (`FR-4.8`–`FR-4.16`, `AC-4.7`–`AC-4.15`). Nothing of the veto (S-24)
exists yet.

## Before this is detailed

- This band depends on v0.1 shipping first — `02-SRD.md` §5.4 lists v0.1 as v0.2's dependency,
  and S-23 specifically needs the round-1 ranking (`F4`, `F5`) it runs a second pass over.
- The veto is one of the five features `docs/HYPOTHESES.md` names under its build freeze —
  solver, calendar, veto, notifications and PWA are held back until the prototype round reports,
  because each serves an assumption nobody has tested (H-D2: "real notes and vetoes land in the
  system, not the group chat").
