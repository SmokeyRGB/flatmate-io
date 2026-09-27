<!-- Moved verbatim from CLAUDE.md on 2026-09-28 (it had grown to 384 lines; the target is ~200).
     Loaded at session start like CLAUDE.md itself: no `paths:` frontmatter, by decision.
     Section names match what code comments and docs cite. -->

# Working under `openspec/` (OpenSpec)

This repo uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) to turn an idea into a change and
then into code. It replaced spec-kit on 2026-09-18; the records spec-kit produced are kept in
`archive/2026-09-spec-kit/` and nothing under `src/` was rebuilt — spec-kit only ever produced
paperwork *about* the code.

The workflow, as slash commands:

| Command | What it does |
|---|---|
| `/opsx:explore` | thinking partner — investigate, weigh options, clarify, before committing to a shape |
| `/opsx:propose` | creates `openspec/changes/<name>/` with proposal, design, delta specs and tasks. **Planning only** — it stops before touching code |
| `/opsx:apply` | works the tasks, edits real code |
| `/opsx:update` | revises an existing change's artifacts and keeps them coherent |
| `/opsx:sync` | folds a change's delta specs into `openspec/specs/` without archiving |
| `/opsx:archive` | merges the deltas and files the change under `changes/archive/` |

`openspec/config.yaml` carries the `context` and per-artifact `rules` the agent is required to
read. It deliberately **cites** the authoritative documents instead of restating them (Principle V)
— `docs/GUARDRAILS.md`, `docs/README.md` §2, `docs/SPEC-INDEX.md`. When you change a rule, change
it there; `config.yaml` should only ever gain a pointer.

Two gotchas: a `rules:` list item containing `": "` parses as a YAML map and OpenSpec then drops
that artifact's whole rule set with a single-line warning, so keep them quoted; and `openspec
doctor` is the quickest check that the config still parses.

## Governance (carried over from spec-kit's constitution, which is now archived)

- **Hard floor — never violate, never route around:** G-C (authorization/visibility), G-D
  (protected `[GUARDED]` tests in `test/guarded.manifest.json`), G-L (the P-5 AI boundary). If a
  task seems solvable only by violating one of these, that's a finding to report and stop for —
  not something to work around. Disabling a check is itself a change needing human approval (G-G3).
- **Confirmed tier:** the 9 ADRs marked `Bestätigt — verbindlich für v0.1` and the precedence
  order — challengeable with a written rationale, but the decision stands until a human confirms
  a change. The strongest argument is showing that the ADR's own **Aufgabebedingung** is now met.
- **Explicitly open tier:** the 5 `Vorschlag — anfechtbar` ADRs and tool choices — challenge is
  invited, still routed through the same process, never changed unilaterally.
- A challenge is filed in the same shape as this repo's ADRs (Kontext · Optionen ·
  Entscheidung · Konsequenzen · Aufgabebedingung); status of any open question lives **only** in
  `docs/review-log.md` §Offene-Punkte-Register.
- IDs/ADR numbers are permanent — a refuted record becomes `Verworfen — ersetzt durch …`, never
  deleted or renumbered.
- A change under `openspec/` must never silently redefine anything in `docs/`. Where they
  genuinely conflict, that's a finding to report, not something to resolve inside a proposal.
- `openspec/` may cite `docs/` but `docs/` must never point into `openspec/` (handover gate,
  Rule 7).

## Specs are frozen records; `openspec/specs/` is derived

spec-kit's constitution held that *"a spec, once implemented, is a frozen record, superseded by a
new ADR — never a living or bidirectionally-updated contract."* OpenSpec's `openspec/specs/` is the
opposite: continuously merged truth. Both survive, under one reading —
**`openspec/changes/archive/<name>/` is the frozen record** and is never edited; `openspec/specs/`
is a derived index of current behaviour, not a source. Human decision, 2026-09-18, recorded in the
commit that made the move.

`openspec/specs/` is seeded **lazily** — a capability spec is written the first time a change
touches that capability, describing implemented behaviour and citing its `FR-n.m`. It is never
seeded by copying `docs/backlog/requirements/` prose; that would duplicate an authoritative source
and rot against it.

A fix made after `/opsx:archive` that changes specified behaviour updates `openspec/specs/` in
the same commit. The archived copy stays as it was (it is the frozen record), so the current spec
is the only place the new behaviour is written down. PR #23's reset redesign left the current
spec promising "all or none" for a round.
