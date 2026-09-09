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

## Why the paths inside are wrong, and why they stay wrong

Every file in here refers to its siblings as `Exercise 10/…`, because that is where they lived
when they were written. Those paths no longer resolve.

**They are not going to be corrected.** These are statements about where things were on a
particular day, not pointers meant to be followed. Rewriting them to satisfy a link checker would
make the archive claim a history it does not have. `tools/check-refs.sh` therefore excludes
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
which does the same job per scope line and is checked by `tools/done-check.sh`.

The epics themselves were renamed `EP-A` … `EP-E` in `docs/backlog/roadmap.md`, because the bare
letters collided with the screen-group prefixes in `docs/07-Screen-Inventar.md` while naming
disjoint sets of screens.
