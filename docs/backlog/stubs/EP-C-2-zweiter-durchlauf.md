# EP-C.2 — Too many "must haves" get a second pass · stub

> **Status:** stub · V0.1 · 2026-09-09
> **Band:** `v0.2`
> **Scope lines:** S-11, S-47
> **Epic:** EP-C — Pick Who to Invite
> **Not yet detailed.** This is a placeholder so the goal is visible and its scope lines are
> traceable. A full requirements packet gets written at the start of the band that carries it.

## What this goal is

The roadmap gives this goal no italic *Goal:* line of its own — only its three stories: being
shown a short second pass only once a resident has rated more candidates "must have" than the
round's favourite budget allows, rating that shortlist with the same four cards already known
from the first pass, and seeing how long is left when the round has a soft deadline.

## Scope lines it carries

| Line | What it is | Band | Note |
|---|---|---|---|
| S-11 | Second, shorter pass over only a resident's own "must have" cards once the favourite-budget threshold (`ceil(rooms × 1.5)`) is exceeded; visible only when exceeded; abandonable without changing votes; switchable off | `v0.2` | Threshold logic itself, distinct from S-47 below |
| S-47 | The second pass reuses the same card pattern as the first screening — no separately designed compare or fine-tuning screen | `v0.2` | Pure UI-pattern decision; closes a previously open design gap by removing the interaction rather than specifying it |

## What already exists in v0.1

The card pattern that S-47 says the second pass must reuse — the card-by-card screening pass
itself — is already built and owned by `F4` (`FR-4.1`–`FR-4.7`, `AC-4.1`–`AC-4.6`). Nothing of
the budget-threshold logic in S-11 exists yet.

## Before this is detailed

- This band depends on v0.1 shipping first — `02-SRD.md` §5.4 lists v0.1 as v0.2's dependency,
  and S-11 in particular needs the round-1 rating data (`F4`) it counts against to already exist.
- `02-SRD.md` §6's second-order metrics name "share of rounds that trigger a second pass" as a
  planned check on the `ceil(rooms × 1.5)` threshold — worth reading before the threshold is
  finalised.
