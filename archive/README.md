# archive/ — superseded artifacts, kept as a record

> **Status:** V0.1 · 2026-09-09 · Samuel Zink (@SmokeyRGB)
> **Rule:** nothing in here is edited again. Not to fix a path, not to satisfy a linter.

## What is in here

`2026-09-story-map/` — the user story map and its workshop scaffolding, superseded on
2026-09-09 when the backlog was re-derived from the Miro board into `docs/backlog/roadmap.md`.

| File | What it was |
|---|---|
| `01-create-story-map-prompt.md` | the prompt that produced the map |
| `02-User-Story-Map.md` | the map itself, V1.3 — 5 activities × 3 epics |
| `03-Story-Map-Review-Notes.md` | review notes on the map |
| `04-Feature-Themes-Board-Example.html` | a rendered board example |
| `05-Correction-Pass-Prompt.md` | the prompt for a correction pass over the map |
| `06-Correction-Pass-Findings.md` | what that pass found |
| `Now,next,later board.jpg` | photo of the physical board |

`2026-09-spec-kit/` — the records spec-kit produced before the project moved to OpenSpec on
2026-09-18. The workflow is gone; what it *learned* is not, so the judgement-bearing artifacts are
kept and the generated scaffolding is not.

| Folder | What it was |
|---|---|
| `constitution.md` | spec-kit's project constitution (v1.1.0, ratified 2026-09-16). Its governance — the hard floor, the confirmed/open ADR tiers, the challenge protocol — now lives in `CLAUDE.md`; the rules it restated were always owned by `docs/GUARDRAILS.md` and `docs/README.md` §2 |
| `assessments/` | one full idea-assessment chain (intake → research → problem → concept → decision) for the remove-resident modal, which produced feature 003 |
| `bugs/` | **22** bugs, each with its assess → fix → test record — the debugging history of F0 and F1, including why `activity_event`'s redaction exception is shaped the way it is, why `acting_profile_id` needs a database trigger, and two rounds on the auto-join trigger |

Not kept: `specs/001`–`003` (the per-feature `spec`/`plan`/`tasks`/`research`/`quickstart` sets)
and `.specify/`'s templates, scripts and workflow definitions. Those are generated scaffolding,
recoverable from git history, and describe work that is already merged and tested.

## Why the paths inside are wrong, and why they stay wrong

Every file in here refers to its siblings as `Exercise 10/…`, because that is where they lived
when they were written. Those paths no longer resolve.

**They are not going to be corrected.** These are statements about where things were on a
particular day, not pointers meant to be followed. Rewriting them to satisfy a link checker would
make the archive claim a history it does not have. `tools/check-refs.ts` therefore excludes
`archive/**` by design, and this table is the translation instead:

| Path as written inside | Where that file is now |
|---|---|
| `Exercise 10/01-create-story-map-prompt.md` | `archive/2026-09-story-map/01-create-story-map-prompt.md` |
| `Exercise 10/02-User-Story-Map.md` | `archive/2026-09-story-map/02-User-Story-Map.md` |
| `Exercise 10/03-Story-Map-Review-Notes.md` | `archive/2026-09-story-map/03-Story-Map-Review-Notes.md` |
| `Exercise 10/04-Feature-Themes-Board-Example.html` | `archive/2026-09-story-map/04-Feature-Themes-Board-Example.html` |
| `Exercise 10/06-Correction-Pass-Findings.md` | `archive/2026-09-story-map/06-Correction-Pass-Findings.md` |
| `00-Session-Brief.md` | `docs/00-Session-Brief.md` |

## One thing not to run

`05-Correction-Pass-Prompt.md` instructs an agent to *"apply fixes only to files under
`Exercise 10/`"*. That folder no longer exists, and when it did, the instruction was aimed at the
story map and the feature themes — both of which are in this archive now. **Do not re-run that
prompt.** It was written for material that has been superseded, and its scope line would resolve
to nothing.

## What survived the map, and where it went

The map's **Appendix A — Traceability** was the only artifact linking board vocabulary to the
`S-` scope lines every specification uses. That mapping is now carried by `docs/COVERAGE.md`,
which does the same job per scope line and is checked by `tools/done-check.ts`.

The epics themselves were renamed `EP-A` … `EP-E` in `docs/backlog/roadmap.md`, because the bare
letters collided with the screen-group prefixes in `docs/07-Screen-Inventar.md` while naming
disjoint sets of screens.
