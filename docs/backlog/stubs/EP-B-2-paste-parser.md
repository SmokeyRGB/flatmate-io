# EP-B.2 — Paste it or type it, same card either way (parser half) · stub

> **Status:** stub · V0.1 · 2026-09-09
> **Band:** `v0.2`
> **Scope lines:** S-08 (parser half), S-39, S-40
> **Epic:** EP-B — Every Application in One Place
> **Not yet detailed.** This is a placeholder so the goal is visible and its scope lines are
> traceable. A full requirements packet gets written at the start of the band that carries it.

## What this goal is

*Goal: every application becomes the same record regardless of channel, with a human always
confirming.* This stub covers the **parser half** of that goal: pasting a message so name, age,
contact and text get pulled out, discarding a paragraph before it is saved, getting the pasted
text back unharmed if the parser finds nothing, and linking a person's earlier application to
their new one. The manual-form half of the same goal is already built.

## Scope lines it carries

| Line | What it is | Band | Note |
|---|---|---|---|
| S-08 | `Application` capture: rule-based paste-parser with mandatory human confirmation | `v0.2` | Parser half only — the manual-form half is already v0.1, owned by `F3` |
| S-39 | Discard individual paragraphs of the raw message before the `Application` is created | `v0.2` | Belongs to the parser step specifically — a typed form has no raw message to discard paragraphs from |
| S-40 | Explicit action to link an applicant's earlier application to their new one; also prompted when a `ResidentProfile` is created from an `Application` | `v0.2` | Procedural half of the visibility invariant S-31 — outside the invite-token path (S-42), which sets the link automatically |

## What already exists in v0.1

The manual-form half of S-08 is already built and owned by `F3` (`FR-3.1`–`FR-3.7`,
`AC-3.1`–`AC-3.5`, `AC-3.12`). Nothing of the parser, S-39 or S-40 exists yet.

## Before this is detailed

- This band depends on v0.1 shipping first — `02-SRD.md` §5.4 lists v0.1 as v0.2's dependency.
- `02-SRD.md` §7 names free-text applications as unavoidably containing Art. 9 special-category
  data, with no automatic filtering allowed (P-5); S-39's manual paragraph-discard is the only
  product-side lever for that risk, so it cannot ship separately from the parser it sits inside.
- `docs/HYPOTHESES.md` flags H-F4, "rule-based parsers are good enough", as unproven and placed
  in v0.2 — worth checking before the parser's matching rules are locked down.
