# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Flatmate.io is a flat-share (WG) applicant-screening and decision tool. The repo holds both the
**specification** (`docs/`, the handover package described below) and a **real Next.js
implementation** (`src/`, `tests/`, `drizzle/`, `scripts/`) being built slice-by-slice from it via
spec-kit (`specs/001-f0-foundations`, `specs/002-f1-casting-round`, …). `prototype/` is a separate
Lovable-generated clickthrough used purely as a visual reference for `docs/09-Design-System.md` —
**never copy its code**, and it is explicitly outside the `docs/` handover boundary.

`docs/` + `tools/` together are **the complete spec handover package**: everything an
implementation slice needs, and nothing more. This is enforced mechanically (see Commands), not by
convention.

## Commands

Implementation (Next.js app, run from repo root, **npm** not bun/pnpm):

```bash
npm run dev       # next dev
npm run build     # next build
npm run lint       # eslint
npm test          # vitest run
npx vitest run tests/unit/casting/room-transitions.test.ts   # single file
npx vitest run -t "test name substring"                       # single test by name
npm run verify     # the full gate: lint + session-context + import-boundary + rls-coverage + guarded-tests lints, then vitest run
npm run seed:demo # tsx --env-file=.env.local scripts/seed-demo-household.ts
```

`npm run verify` is what CI/pre-push effectively require — run it, not just `npm test`, before
treating a change as done. The four custom lints under `scripts/lint/` are hand-written checks
(not eslint plugins), each enforcing one guardrail mechanically:

| Script | Guardrail | What it checks |
|---|---|---|
| `import-boundary.ts` | G-C1 / FR-0.1 | only `src/db/` and each module's own `repository.ts` may import the raw Postgres/Drizzle client |
| `session-context.ts` | G-C8 / FR-0.4 | bare `SET` is never allowed; `SET LOCAL` for session context only in `src/db/session-context.ts` |
| `rls-coverage.ts` | G-C7 | RLS invariants must be tested twice — through the policy layer and via raw SQL bypassing it |
| `guarded-tests.ts` | G-D | every entry in `test/guarded.manifest.json` (G-D1…G-D15) stays honest: `pending`/`implemented` must match reality |

Husky's pre-commit hook runs `gitleaks protect --staged` (G-A1) — install gitleaks locally or the
hook hard-fails the commit.

Spec cross-reference checks (validate `docs/`, unrelated to the app):

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

## Architecture: the implementation

- **Bounded contexts** (ADR-001), each its own directory under `src/modules/`: `identity`,
  `casting`, `audit` exist today (F0/F1 slices); `deliberation`, `scheduling`, `notifications` are
  not built yet. Each module owns a `schema.ts` (Drizzle tables), `repository.ts` (the only file
  outside `src/db/` allowed to touch the raw client), and, where relevant, a `transitions.ts` for
  its state machine. Cross-module access goes through a module's exported functions, never its
  schema/repository directly — `import-boundary.ts` only enforces the raw-client rule, so respect
  the module boundary by convention too.
- **`src/db/`**: `client.ts` (the one place the raw Postgres/Drizzle client is constructed) and
  `session-context.ts` (the one place `SET LOCAL` sets RLS session context inside a transaction).
- **`src/app/`**: Next.js App Router route groups — `(auth)` (sign-in, register, claim) and `(org)`
  (dashboard, members, rooms, rounds, settings, who-lives-here) — each with server actions
  (`actions.ts`) calling into module repositories, never the DB client directly.
- **Tests** (`tests/`, Vitest, `vitest.config.ts`): `tests/unit/<module>/`, plus
  `tests/integration/policy/` and `tests/integration/raw-sql/` — the two-sided RLS check G-C7
  demands. `test/guarded.manifest.json` tracks which G-D invariants have real test coverage;
  update it in the same commit as the test, never mark `implemented` speculatively. Tests hit a
  real Supabase instance (no mocking DB/auth calls per F0 precedent) — expect real network latency
  (`testTimeout: 20000`).
- **`drizzle/`**: generated migrations from `drizzle.config.ts`, which points at the three modules'
  `schema.ts` files as the source of truth.
- **`.specify/`**: spec-kit state — `memory/constitution.md` (MUST/MUST NOT restatement of the
  guardrails below, spec-kit's binding source of truth), `bugs/` (per-bug assessment folders from
  `speckit-bug-assess`), and the templates/workflows spec-kit itself uses. `specs/<NNN-slug>/`
  holds each slice's `spec.md`/`plan.md`/`tasks.md`, generated by the `speckit-*` skills below —
  `specs/` may cite `docs/`, but `docs/` must never point into `specs/` (Rule 7, the handover
  gate).

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

### The stack (ADR-006, confirmed) — now in use, see Architecture below

Next.js/TypeScript, Postgres, Drizzle, Supabase EU with Supabase Auth. Six bounded contexts
(ADR-001): `identity`, `casting`, `deliberation`, `scheduling`, `audit`, `notifications` — three
built so far. Tooling per `tools/README.md`: Vitest (RLS tests run twice per G-C7), gitleaks
(pre-commit via husky + CI). `dependency-cruiser` and `license-checker-rseidelsohn` are recorded
decisions not yet wired in; the import-boundary/session-context/rls-coverage/guarded-tests checks
that exist today are hand-written scripts under `scripts/lint/`, not those tools.

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
