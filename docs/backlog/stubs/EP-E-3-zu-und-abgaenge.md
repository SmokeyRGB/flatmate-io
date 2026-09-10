# EP-E.3 — People come and go, the round does not leak · stub

> **Status:** stub · V0.1 · 2026-09-09
> **Band:** `v0.2`
> **Scope lines:** S-32, S-42, S-30 + S-45
> **Epic:** EP-E — Decide, Offer, Welcome the New Flatmate
> **Not yet detailed.** This is a placeholder so the goal is visible and its scope lines are
> traceable. A full requirements packet gets written at the start of the band that carries it.

## What this goal is

*Goal: the round survives its own membership changing, without anyone reading what they should
not.* The stories ask for never reading a vote, veto or note written about oneself, sending one
invite link that lets an accepted applicant become a flatmate on their own, losing access to the
round the day one moves out, knowing one's votes still count after leaving, and closing the round
once every room is taken.

## Scope lines it carries

| Line | What it is | Band | Note |
|---|---|---|---|
| S-32 | Round visibility via `RoundParticipation`; `moved_out` revokes access immediately; the cast vote still counts in the score but drops out of the participation/quorum counter and denominator, marked in the UI | `v0.2` | — |
| S-42 | `ApplicationInviteToken`: single-use invite token per `Application` at `moved_in`, sets `became_resident_id` on registration, revocable | `v0.2` | — |
| S-30 | Installable PWA, mobile-first; the service worker caches only the app shell, never applicant or deliberation data, with one named exception (an outbox for a resident's own not-yet-sent votes) | `v0.2` | — |
| S-45 | Visible, persistent install prompt outside the join path itself; a more reserved resident-email pitch | `v0.2` | — |

## What already exists in v0.1

The visibility invariant this goal's "never read a vote, veto or note about me" story restates —
**S-31** — is already built and owned by `F5` (`FR-5.29`–`FR-5.32`, `AC-5.24`–`AC-5.27`). It is a
permanent invariant, not something this v0.2 goal introduces; this goal extends it to a
membership that changes over time.

## Before this is detailed

- This band depends on v0.1 shipping first — `02-SRD.md` §5.4 lists v0.1 as v0.2's dependency.
- The PWA (S-30, S-45) is one of the five features `docs/HYPOTHESES.md` names under its build
  freeze — solver, calendar, veto, notifications and PWA are held back until the prototype round
  reports.
- `06-Compliance-Anhang.md` §13's `Q-12` (whether the service worker is consent-free under §25
  TDDDG) is answered "yes" there but still an open legal question worth re-checking before this
  is detailed.
