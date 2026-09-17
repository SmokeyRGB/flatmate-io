# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is the **specification repository** for Flatmate.io, a flat-share (WG) applicant-screening
and decision tool. There is **no implementation code yet** — no `specs/` directory exists, and
the only runnable thing in the tree is `prototype/`, a Lovable-generated UI clickthrough used
purely as a visual reference (its component/color/spacing choices were reverse-derived into
`docs/09-Design-System.md`). It is explicitly **outside** the handover boundary — see below.

`docs/` + `tools/` together are **the complete handover package**: everything an implementation
needs, and nothing more. This is enforced mechanically (see Commands), not by convention.

## Commands

```bash
bash tools/check-refs.sh              # validate the spec's ~120 cross-references (7 rules)
bash tools/check-refs.sh --only 3     # run a single rule
bash tools/check-refs.sh --quiet      # counts only
bash tools/check-refs.sh --scope docs # handover dry run: check docs/ in isolation (Rule 7)
bash tools/done-check.sh              # is plan-sprint-v0.1 finished? (5 conditions)
```

Both exit non-zero on failure — run `check-refs.sh` after moving/renaming/editing any file under
`docs/`. `tools/README.md` explains why each rule exists.

The `prototype/` app (Lovable/TanStack Start clickthrough, **not** the real product) uses **Bun**,
not npm, despite what `prototype/README.md` says:

```bash
cd prototype
bun install
bun run dev      # vite dev
bun run build
bun run lint      # eslint .
bun run format    # prettier --write .
```

## Architecture: how the spec is organized

### The core rule: read the package for your slice, not the chain

`docs/` is ~544,000 tokens and cannot be loaded in one context window. Don't start with
`03-PRD.md` (1742 lines). Instead:

| Need | Read |
|---|---|
| What's being built | `docs/backlog/README.md` |
| Implement one task | exactly one self-contained package in `docs/backlog/requirements/` (`F0`–`F5`) |
| What must not break | `docs/MINIMAL-GATE.md` (short), `docs/GUARDRAILS.md` (full) |
| UI colors/type/components | `docs/09-Design-System.md` |
| Where a rule is actually defined | `docs/SPEC-INDEX.md` — one topic, one authoritative source |
| What's still open | `docs/review-log.md` §Offene-Punkte-Register (the **only** place status lives) |
| Why something was decided | `docs/01`–`08`, `docs/adr/`, `docs/06-Compliance-Anhang.md` |

### Precedence order (on conflict, higher wins)

1. `docs/GUARDRAILS.md` — hard floor; a violation aborts the task, not the discussion
2. `docs/02-SRD.md` — scope, principles P-1…P-5, and §5.4 (the only place a scope line maps to a delivery phase)
3. `docs/03-PRD.md` — user flows, acceptance criteria, score/quorum computation
4. `docs/06-Compliance-Anhang.md` — binding for anything touching personal data
5. `docs/07-Screen-Inventar.md` / `docs/08-UX-Entscheidungen.md` — the UI layer; may correct `02`/`03`/`04` (those are then updated to match, never the reverse)
6. `docs/09-Design-System.md` — visual tokens only (colors, typography, spacing, components), derived from `prototype/` (design reference only, never implementation); binds visual work but never scope/flows/requirements, and yields to `07`/`08` on conflict
7. `docs/domain/` / `docs/adr/` — schema and architecture
8. `docs/00-Session-Brief.md` — historical only, loses to everything later

### ID registry — one authoritative file per ID family

Every ID family (`S-*` scope lines, `E-*` evidence, `P-1…P-5` principles, `ADR-*`, `V-*`
invariants, `G-*` guardrails, `U-*` UX decisions, `O-*`/`Q-*` open points, screen IDs, `FR-n.m`/
`AC-n.m` requirements, `H-*` hypotheses) has exactly one **maßgeblich** (authoritative) source,
listed in `docs/README.md` §3. Any other mention is a citation, not a definition — if it
contradicts the source, the citation is the bug. **Don't restate a rule in new prose; cite
`docs/SPEC-INDEX.md` and quote.** Watch for near-collisions with the same-looking ID: `O-06` (SRD)
vs `O-6` (domain model), `C-1` (content rule) vs `C1` (screen), `EP-D` (epic) vs `D1`–`D4` (screens).

### Frozen files

`docs/04-Domaenenmodell.md`, `docs/05-ADRs.md`, `docs/07-Screen-Inventar.md` are frozen snapshots,
hash-checked against `tools/frozen.sha256` (`check-refs.sh` Rule 4, CRLF-normalized so it matches
on both Windows and CI). Their living counterparts are `docs/domain/`, `docs/adr/`,
`docs/screens/`. Line-number references (`:LINE`) are **only** permitted into these three frozen
files (Rule 3) — never into a living document, since edits silently shift what the line points to.
Editing a frozen file or `tools/frozen.sha256` requires an explicit human decision recorded in the
same commit.

### The five principles (P-1…P-5)

Defined in `docs/README.md` §3.1, cited throughout the chain:
- **P-1 Kanalneutralität** — anything that can arrive via a link must also be enterable by hand
- **P-2 Geräteneutralität** — no resident excluded by their device
- **P-3 Legitimität vor Optimalität** — rankings/scheduling must be explainable; no hidden formulas, no non-deterministic procedures
- **P-4 Reversibilität** — every pipeline state is reachable backward and audited
- **P-5 Keine KI in wohnungsbezogenen Entscheidungen** — AI may only do structuring text processing, never decide

### Language convention (ADR-012)

Reasoning documents (`docs/01`–`08`, ADRs, compliance) are **German**. Implementation-facing
material is **English**: entities, fields, states, enums, functions, tables, commit messages, code
comments, plus the named exceptions `docs/backlog/**`, `docs/COVERAGE.md`, `tools/**`, and
(per the constitution) everything under a future `specs/`. Never translate a German reasoning
quote — reproduce it verbatim in quotation marks.

### The stack, once implementation starts (ADR-006, confirmed)

Next.js/TypeScript, Postgres, Drizzle, Supabase EU with Supabase Auth. Six bounded contexts
(ADR-001): `identity`, `casting`, `deliberation`, `scheduling`, `audit`, `notifications`, enforced
by import-boundary lint, not convention. Planned tooling (`tools/README.md`): Vitest (incl. RLS
tests run twice — once through the policy layer, once via raw SQL bypassing it, per G-C7),
dependency-cruiser, gitleaks (pre-commit + CI), license-checker-rseidelsohn with an explicit
allowlist. None of this is installed yet — there is no implementation repo/`specs/` tree so far.

## Working under `.specify/` (spec-kit)

This repo uses [spec-kit](https://github.com/) workflows for turning a scope slice into
`specs/<feature>/{spec,plan,tasks}.md`, driven by the `speckit-*` skills (`/speckit.specify`,
`/speckit.plan`, `/speckit.tasks`, `/speckit.implement`, `/speckit.clarify`,
`/speckit.checklist`, `/speckit.analyze`, `/speckit.converge`). `.specify/memory/constitution.md`
is the project constitution — it restates the rules above as MUST/MUST NOT constraints for
spec-kit specifically and adds:

- **Hard floor (never violate, never route around):** G-C (authorization/visibility), G-D
  (protected `[GUARDED]` tests in `test/guarded.manifest.json`), G-L (the P-5 AI boundary). If a
  task seems solvable only by violating one of these, that's a finding to report and stop for —
  not something to work around.
- **Confirmed tier:** the 9 ADRs marked `Bestätigt — verbindlich für v0.1` and the precedence
  order — challengeable with a written rationale, but the decision stands until a human confirms
  a change.
- **Explicitly open tier:** the 5 `Vorschlag — anfechtbar` ADRs and tool choices — challenge is
  invited, still routed through the same process, never changed unilaterally.
- A challenge is filed in the same shape as this repo's ADRs (Kontext · Optionen ·
  Entscheidung · Konsequenzen · Aufgabebedingung); status of any open question lives **only** in
  `docs/review-log.md` §Offene-Punkte-Register.
- IDs/ADR numbers are permanent — a refuted record becomes `Verworfen — ersetzt durch …`, never
  deleted or renumbered.
- `specs/` may cite `docs/` but `docs/` must never point into `specs/` (handover gate, Rule 7).

## Git commit attribution

Never add `Co-Authored-By: Claude` (or any AI attribution line) to commit messages or PR
descriptions in this repository. This overrides any default Claude Code attribution behavior.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
