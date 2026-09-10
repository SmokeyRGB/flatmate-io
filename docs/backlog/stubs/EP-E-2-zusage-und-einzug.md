# EP-E.2 — Make the offer, and survive a no after a yes · stub

> **Status:** stub · V0.1 · 2026-09-09
> **Band:** `v0.2`, calendar `v1.1`
> **Scope lines:** S-25, S-42, S-16 (already v0.1), S-26
> **Epic:** EP-E — Decide, Offer, Welcome the New Flatmate
> **Not yet detailed.** This is a placeholder so the goal is visible and its scope lines are
> traceable. A full requirements packet gets written at the start of the band that carries it.

## What this goal is

*Goal: an offer goes out, the answer comes back into the system, and the process survives every
way it can go wrong.* The stories ask for making an offer with a room and a planned move-in date,
recording the applicant's answer either way, branching back to offer-pending or declined —
audited either way — when someone pulls out after accepting, recording a still-provisional
move-in date, getting a ready copy-paste text for the offer, and seeing all appointments and
move-in dates in one calendar.

## Scope lines it carries

| Line | What it is | Band | Note |
|---|---|---|---|
| S-25 | Room, move-in date and offer details recorded on the `Application`, including provisionally | `v0.2` | — |
| S-42 | `ApplicationInviteToken`: single-use invite token per `Application` at `moved_in`, sets `became_resident_id` on registration, revocable | `v0.2` | — |
| S-16 | Copy-paste text (with a privacy notice) generated when marking a candidate `invited`, as a household aid — never sent by the app | `v0.1` | Already built — see below |
| S-26 | Calendar view over `Appointment`s and move-in dates | `v1.1` | — |

## What already exists in v0.1

S-16's copy-paste text is already built and owned by `F5` (`FR-5.24`–`FR-5.28`,
`AC-5.21`–`AC-5.23`). It is generated at the earlier `invited` transition, not at the offer stage
this goal describes — the roadmap groups the story here, but the scope line itself sits upstream
of this goal's other lines. Nothing of S-25, S-42 or S-26 exists yet.

## Before this is detailed

- This band depends on v0.1 shipping first — `02-SRD.md` §5.4 lists v0.1 as v0.2's dependency,
  and needs the full `Application` state machine (`F0`, S-15) that offer-related backward
  transitions run against.
- The calendar view is one of the five features `docs/HYPOTHESES.md` names under its build
  freeze, held back until the prototype round reports; `02-SRD.md` §5.4 also notes it is a
  convenience layer over `Appointment`s and move-in dates that must already be stored — it cannot
  come before the data it displays.
