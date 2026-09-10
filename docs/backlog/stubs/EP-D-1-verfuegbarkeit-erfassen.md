# EP-D.1 — "Tuesdays from 16:00" becomes a real time window · stub

> **Status:** stub · V0.1 · 2026-09-09
> **Band:** `v0.2`, token page `v1.1`
> **Scope lines:** S-17
> **Epic:** EP-D — Organize In-Person Casting
> **Not yet detailed.** This is a placeholder so the goal is visible and its scope lines are
> traceable. A full requirements packet gets written at the start of the band that carries it.

## What this goal is

*Goal: everyone's real availability is in the system as structured windows.* The stories ask for
entering "can / cannot" in a grid on a phone, writing "Tuesdays from 16:00" and confirming what
the app understood, never saving a guessed window without confirmation, entering an applicant's
preferred times by hand when no link was used, treating all slots as available by default until
something is entered, and revoking availability on short notice.

## Scope lines it carries

| Line | What it is | Band | Note |
|---|---|---|---|
| S-17 | `AvailabilityWindow` capture: structured "can / cannot" windows for residents and applicants, fully manual, plus a rule-based free-text-to-window parser with mandatory confirmation | `v0.2` (manual capture and data model) | The applicant-side **token page** — the convenience layer over this same data model — is `v1.1` |

## What already exists in v0.1

Nothing. Per `docs/backlog/roadmap.md`'s own lane count, EP-D has zero rows in v0.1 — none of
its three goals, including this one, has any part built yet.

## Before this is detailed

- This band depends on v0.1 shipping first — `02-SRD.md` §5.4 lists v0.1 as v0.2's dependency.
- `02-SRD.md` §5.4 gives an explicit reason the token page waits for `v1.1`: it is a convenience
  over a manual path that must exist and work completely first (P-1) — a product that starts with
  the link never finishes the manual path.
