# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Flatmate.io is a flat-share (WG) applicant-screening and decision tool. The repo holds both the
**specification** (`docs/`, the handover package described below) and a **real Next.js
implementation** (`src/`, `tests/`, `drizzle/`, `scripts/`) being built slice-by-slice from it via
OpenSpec (`openspec/`). `prototype/` is a separate
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
npm run verify     # the full gate: eslint + tsc + nine guardrail lints + check-refs, then vitest run
npm run seed:demo # tsx --env-file=.env.local scripts/seed-demo-household.ts
```

`npm run verify` is what CI and a husky `pre-push` hook require — run it, not just `npm test`,
before treating a change as done. It type-checks (`next typegen && tsc --noEmit`; vitest alone does
not enforce strict mode). Both `eslint` and `tsc` ignore `.claude/**`: that directory holds tool
state and worktree copies of the repository, never source (human approval 2026-09-26, G-G3). The
nine hand-written guardrail lints under `scripts/lint/`, plus a further check that runs inside
vitest, are listed in `.claude/rules/guardrail-lints.md`.

Husky's pre-commit hook runs `gitleaks protect --staged` (G-A1) — install gitleaks locally or the
hook hard-fails the commit. Husky's `pre-push` hook runs `npm run verify` against
`flatmate-io-dev` before every push (F2 plan, section 7, decision 2) — the only bypass is
`git push --no-verify`, and CI's run against `flatmate-io-dev` is the backstop for that case.

Spec cross-reference checks (validate `docs/`, unrelated to the app):

```bash
node tools/check-refs.ts              # validate the spec's ~120 cross-references (7 rules)
node tools/check-refs.ts --only 3     # run a single rule
node tools/check-refs.ts --quiet      # counts only
node tools/check-refs.ts --scope docs # handover dry run: check docs/ in isolation (Rule 7)
node tools/done-check.ts              # is plan-sprint-v0.1 finished? (6 conditions)
```

Both exit non-zero on failure — run `check-refs.ts` after moving/renaming/editing any file under
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
  `session-context.ts` (the one place the RLS session context is set: `withSessionContext`
  opens the transaction and sets it with one transaction-local `set_config(…, true)` statement,
  equivalent to `SET LOCAL`, G-C8).
- **`src/app/`**: Next.js App Router route groups — `(auth)` (sign-in, register, claim) and `(org)`
  (dashboard, members, rooms, rounds, settings, who-lives-here) — each with server actions
  (`actions.ts`) calling into module repositories, never the DB client directly.
- **Tests** (`tests/`, Vitest, `vitest.config.ts`): `tests/unit/<module>/`, plus
  `tests/integration/policy/` and `tests/integration/raw-sql/` — the two-sided RLS check G-C7
  demands — and `tests/integration/schema/` (catalog checks against the migrated database, the
  live half of the data-inventory gate). `test/guarded.manifest.json` tracks which G-D invariants
  have real test coverage; update it in the same commit as the test, never mark `implemented`
  speculatively. Tests hit a
  real Supabase instance (no mocking DB/auth calls per F0 precedent), never production;
  `tests/setup.ts` throws if `DATABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` names the production
  ref. Which instance depends on where the run happens
  (openspec/changes/ci-local-database): a local run and the husky `pre-push` hook, plus CI's
  `verify-hosted` job (push to `main` only), hit **`flatmate-io-dev`**; CI's `verify` job (every
  pull request and every push to `main`) hits a disposable Supabase stack built fresh inside the runner, from
  `scripts/db/bootstrap-roles.sql` and `drizzle/` only, and reaches neither `flatmate-io-dev` nor
  production. Expect real network latency against dev: the suite takes ~80–90 s from the
  human's machine. The PR `verify` job takes ~4 min end to end (median 242 s of 3 runs,
  2026-09-27: ~90 s stack start-up, ~100 s `npm run verify`), against 6 min 17 s when it still
  ran against dev. `verify-hosted` still talks to the EU from a US runner, so `testTimeout` and
  `hookTimeout` stay at `60000`. Teardown belongs in `afterEach`, not in a `finally` inside the
  test — a timeout aborts before `finally` runs, which used to orphan households — and
  `tests/setup.ts` adds a global sweep as a net beneath each file's own cleanup, never as a
  replacement for it.
- **`drizzle/`**: generated migrations from `drizzle.config.ts`, which points at the three modules'
  `schema.ts` files as the source of truth.
- **`openspec/`**: the delivery workflow. `config.yaml` carries the project context and per-artifact
  rules the agent must read; `changes/<name>/` holds an in-flight change (`proposal.md`,
  `design.md`, `tasks.md`, and delta specs under its own `specs/`); `changes/archive/` holds
  completed ones; `specs/<capability>/` is current truth, written lazily on first touch rather than
  seeded from `docs/` — copying requirement prose out of `docs/backlog/requirements/` would be a
  Principle V violation, not a convenience. `openspec/` may cite `docs/`, but `docs/` must never
  point into `openspec/` (Rule 7, the handover gate).

## Implementation hazards specific to this repo

Moved to `.claude/rules/implementation-hazards.md`, which loads with this file. The section names
are unchanged, so a comment citing `CLAUDE.md "<section>"` still finds them there: **An invariant
holds only where it is enforced** (raw SQL as `app_runtime`, a `SECURITY DEFINER` function, a
concurrent request, a sibling entry) · **The relationship a predicate joins through must itself be
enforced** · **No transaction spans Postgres and Supabase Auth** · **Every writer of the same state,
pairwise** · **Migrations** · **Tests that can fail**.

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

Every ID family has exactly one authoritative source (`docs/README.md` §3). Don't restate a rule;
cite `docs/SPEC-INDEX.md` and quote. The families and the near-collisions to watch for:
`.claude/rules/spec-ids.md`.

### Frozen files

`docs/04-Domaenenmodell.md`, `docs/05-ADRs.md`, `docs/07-Screen-Inventar.md` are frozen snapshots,
hash-checked against `tools/frozen.sha256` (`check-refs.ts` Rule 4, CRLF-normalized so it matches
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
everything under `openspec/`. Never translate a German reasoning quote — reproduce it verbatim in
quotation marks.

### The stack (ADR-006, confirmed) — now in use, see Architecture below

Next.js/TypeScript, Postgres, Drizzle, Supabase EU with Supabase Auth. Six bounded contexts
(ADR-001): `identity`, `casting`, `deliberation`, `scheduling`, `audit`, `notifications` — three
built so far. Tooling per `tools/README.md`: Vitest (RLS tests run twice per G-C7), gitleaks
(pre-commit via husky + CI). `dependency-cruiser` and `license-checker-rseidelsohn` are recorded
decisions not yet wired in; the import-boundary/session-context/rls-coverage/guarded-tests checks
that exist today are hand-written scripts under `scripts/lint/`, not those tools.

## Working under `openspec/` (OpenSpec)

The workflow (`/opsx:explore`, `propose`, `apply`, `update`, `sync`, `archive`), `config.yaml` and
its gotchas, the governance carried over from spec-kit, and why `openspec/changes/archive/` is the
frozen record while `openspec/specs/` is derived: `.claude/rules/openspec.md`, which loads with
this file.

## Git commit attribution

Never add `Co-Authored-By: Claude` (or any AI attribution line) to commit messages or PR
descriptions in this repository. This overrides any default Claude Code attribution behavior.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
