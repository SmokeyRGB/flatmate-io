# EP-A.2 — What is next, and who is waiting on me · stub

> **Status:** stub · V0.1 · 2026-09-09
> **Band:** `v0.2`
> **Scope lines:** S-44, S-29
> **Epic:** EP-A — (Late) Joining a Casting Round
> **Not yet detailed.** This is a placeholder so the goal is visible and its scope lines are
> traceable. A full requirements packet gets written at the start of the band that carries it.

## What this goal is

*Goal: after three days away, I know the one thing to do next and why, without thinking.* The
goal's stories ask for a soft deadline with a visible countdown ("see how much time is left when
the round has a deadline") and a running participation count ("see '5 of 7 have voted' so I know
whether the group is waiting on me"). The single-next-action screen itself ("see one screen that
tells me what to do next") is already built in v0.1.

## Scope lines it carries

| Line | What it is | Band | Note |
|---|---|---|---|
| S-44 | Optional soft per-phase deadline (`CastingRound.phase_deadline_at`), shown as "vote by X" / time remaining; blocks nothing, feeds the dashboard's CTA ordering | `v0.2` | — |
| S-29 | Participation loop as a first-class feature: "5 of 7 have voted", open-item badges, digest | `v0.2` | — |

## What already exists in v0.1

The precedence rule that decides which single task the dashboard shows first — **S-48** — is
already built and owned by `F2` (`FR-2.20`–`FR-2.25`, `AC-2.12`–`AC-2.16`). It runs on a fixed
order today because only one task type (voting) is open in v0.1; S-44 is the piece that gives it
a due date to sort by once more task types exist.

## Before this is detailed

- This band depends on v0.1 shipping first — `02-SRD.md` §5.4 lists v0.1 as v0.2's dependency.
- S-44 only has work to do once several task types can be open at the same time; `02-SRD.md` §5.4
  explains this is exactly why S-44 sits in v0.2 rather than v0.1, where S-48 still falls back to
  its fixed order.
