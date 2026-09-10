# EP-A.3 — What happened while I was away · stub

> **Status:** stub · V0.1 · 2026-09-09
> **Band:** `v0.2`
> **Scope lines:** S-27 (feed interface only), S-28
> **Epic:** EP-A — (Late) Joining a Casting Round
> **Not yet detailed.** This is a placeholder so the goal is visible and its scope lines are
> traceable. A full requirements packet gets written at the start of the band that carries it.

## What this goal is

*Goal: I can reconstruct what the WG decided while I was offline, in one screen.* The stories ask
for one feed that answers "what happened while I was away", showing outcomes rather than every
small action, letting a resident jump from a feed entry straight to the thing it is about, and
never showing an entry for something the reader is not allowed to open.

## Scope lines it carries

| Line | What it is | Band | Note |
|---|---|---|---|
| S-27 | `ActivityEvent` feed (append-only), every event naming the account **and** the acting profile | `v0.2` | Only the feed **interface** — the append-only log itself is v0.1, owned by `F0` |
| S-28 | `Notification` channel resolution (Web Push preferred, then email fallback if set, then in-app); digest as the default | `v0.2` | — |

## What already exists in v0.1

The append-only log that S-27 reads from is already built and owned by `F0` (`FR-0.13`–`FR-0.15`,
`AC-0.11`). What is missing is the screen that renders it as a readable "while you were away"
feed and the notification channel resolution that surfaces it outside the app.

## Before this is detailed

- This band depends on v0.1 shipping first — `02-SRD.md` §5.4 lists v0.1 as v0.2's dependency.
- S-28 (notifications) is one of the five features `docs/HYPOTHESES.md` names under its build
  freeze — solver, calendar, veto, notifications and PWA are held back until the prototype round
  reports, because each serves an unproven assumption. The feed's own visibility rule must still
  respect the same self-redaction invariant (S-31) that the rest of the product enforces — no
  feed entry may name a candidate that the viewer is not allowed to see.
