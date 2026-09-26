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
npm run verify     # the full gate: eslint + tsc + seven guardrail lints + check-refs, then vitest run
npm run seed:demo # tsx --env-file=.env.local scripts/seed-demo-household.ts
```

`npm run verify` is what CI and a husky `pre-push` hook require — run it, not just `npm test`,
before treating a change as done. It type-checks (`next typegen && tsc --noEmit`; vitest alone does
not enforce strict mode). Both `eslint` and `tsc` ignore `.claude/**`: that directory holds tool
state and worktree copies of the repository, never source (human approval 2026-09-26, G-G3). The
seven custom lints under `scripts/lint/` are hand-written checks (not eslint plugins), each
enforcing one guardrail mechanically:

| Script | Guardrail | What it checks |
|---|---|---|
| `import-boundary.ts` | G-C1 / FR-0.1 | only `src/db/` and each module's own `repository.ts` may import the raw Postgres/Drizzle client |
| `session-context.ts` | G-C8 / FR-0.4 | bare `SET` is never allowed; `SET LOCAL`/`set_config(…, true)` for session context only in `src/db/session-context.ts`; also rejects `SET SESSION …`/`SET … TO` everywhere and a non-local `set_config` in `drizzle/*.sql` |
| `rls-coverage.ts` | FR-0.2 / EC-0.1 | every table declaring `household_id` has a `pgPolicy` of its own — per table, not per schema file |
| `definer-coverage.ts` | G-C7 | every `SECURITY DEFINER` function in `drizzle/` sets `search_path` and is called by name in a `tests/integration/raw-sql/` test |
| `migration-shape.ts` | — (re-runnability) | migrations after `0017`: an enum `ADD VALUE` alone in its file, `ADD COLUMN IF NOT EXISTS`, `DROP FUNCTION IF EXISTS` before a bare or `RETURNS TABLE` create, `search_path` on `SECURITY DEFINER` |
| `guarded-tests.ts` | G-D | every entry in `test/guarded.manifest.json` (G-D1…G-D15) stays honest: `pending`/`implemented` must match reality |
| `pending-feedback.ts` | `ui/pending-feedback` | no plain submit button anywhere in `src/` (only `src/ui/submit-button.tsx`'s shared one); every `page.tsx` under `src/app/` has a sibling `loading.tsx` importing `@/ui/skeletons`, short named exemptions aside |

`tests/unit/lint/cleanup-inventory.test.ts` is the eighth check, run inside vitest: it fails when
a household-scoped table is missing from the delete set in `tests/helpers/identity.ts`, or when
`undoRegisterHousehold` misses a table `registerHousehold` writes.

Husky's pre-commit hook runs `gitleaks protect --staged` (G-A1) — install gitleaks locally or the
hook hard-fails the commit. Husky's `pre-push` hook runs `npm run verify` against
`flatmate-io-dev` before every push (F2 plan, section 7, decision 2) — the only bypass is
`git push --no-verify`, and CI's `verify-hosted` job is the backstop for that case.

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
  demands. `test/guarded.manifest.json` tracks which G-D invariants have real test coverage;
  update it in the same commit as the test, never mark `implemented` speculatively. Tests hit a
  real Supabase instance (no mocking DB/auth calls per F0 precedent) — specifically
  **`flatmate-io-dev`**, never production; `tests/setup.ts` throws if `DATABASE_URL` or
  `NEXT_PUBLIC_SUPABASE_URL` names the production ref. Expect real network latency: the suite runs
  ~45s locally but 260–350s in CI, so `testTimeout` and `hookTimeout` are both `60000`. Teardown
  belongs in `afterEach`, not in a `finally` inside the test — a timeout aborts before `finally`
  runs, which used to orphan households — and `tests/setup.ts` adds a global sweep as a net
  beneath each file's own cleanup, never as a replacement for it.
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

Each of these cost at least one review round in PRs #4–#18. They are facts about this codebase,
not new rules — the rules stay in `docs/GUARDRAILS.md`.

**An invariant holds only where it is enforced.** Four paths reach data without passing through
the TypeScript that states the rule:

- **Raw SQL as `app_runtime`.** RLS applies, but it guarantees household isolation only. Roles,
  permissions and ownership *within* a household are application-level for every table, by
  ADR-004's layering ("zweifach erzwungen heißt nicht identisch zweimal"); `import-boundary.ts`
  keeps raw SQL inside the repositories. The transition tables in `transitions.ts` are
  application-level too, so a state rule that must survive even that — finality, say — needs a
  constraint or trigger (`drizzle/0017` is the example).
- **A `SECURITY DEFINER` function.** It runs past RLS, and `resolve_join_code`, `claim_join_code`
  and `record_join_attempt` answer unauthenticated callers. With no foreign keys nothing keeps a
  stored id honest, so every join inside such a function carries its own `household_id`
  predicate. `scripts/lint/definer-coverage.ts` requires each one to be called in a raw-SQL test.
- **A concurrent request.** Any read-then-write needs a unique constraint, a row lock (`FOR
  UPDATE`, or a conditional `UPDATE`) or an advisory lock. The Supavisor transaction pooler
  serialises one-statement transactions by accident, so a racy function can pass a concurrency
  test. Make the test deterministic by holding an uncommitted transaction while the other path
  runs (`tests/integration/policy/revoked-membership-sign-in.test.ts`), or label it an invariant
  guard rather than a regression test.
- **A sibling entry.** A rule checked where state is revoked must also be checked where it is
  created (sessions: `signIn`), and a guarded read has sibling reads (`getRoundForSession` vs
  `getRoundParticipants`). Authorization lives in the repository function, not the route that
  happens to call it today, and it derives from the authenticated session (`context.accountId`),
  never from a caller-supplied actor id — the `assert*` helpers in `identity/repository.ts` refuse
  a mismatch. `tests/integration/policy/authorization-matrix.test.ts` fails when a
  new `casting`/`identity` repository export has no recorded decision: it must refuse a plain
  resident, or carry a stated reason for being exempt. It covers mutators only; each read's
  visibility is tested per read. A history view (a dead link, a past event) takes its labels from
  its own rows, never from a current-state list: `getResidentList` hides removed people, so a
  label looked up there silently disappears (PR #23).

**The relationship a predicate joins through must itself be enforced.** With no foreign keys, a
pairing between columns is true only where a constraint says so. Before a predicate or a
`SECURITY DEFINER` join relies on one, check that it is a constraint. If it isn't, add the
constraint once rather than a predicate in every reader. Enforce all of the relationship, not the
one property a reviewer named: which rows pair up (`membership_resident_pairing`, `drizzle/0020`)
**and** how many there may be. A lookup that takes `[row]` from a query with no unique index
behind it is ambiguous (`membership` per profile and per account, `drizzle/0021`). PR #23 needed
two review rounds because the first fix covered only the pairing.

**No transaction spans Postgres and Supabase Auth.** A provider call inside `withSessionContext`
is not rolled back with it. Order the steps so that every failure point leaves a safe state, and
write down which state each one leaves. For a reset, that means ending the sessions and spending
the link first, then setting the password, then signing in (`redeemPasswordReset`). Don't claim
atomicity in a comment. The rule covers every provider call, not only the one a review named. Before calling
a boundary fixed, `grep -n "supabaseAdmin()" src/` and check each call inside a transaction: the
provider call goes last before the commit, and a failed commit after it is reconciled. PR #23 fixed
the reset in one round and the password and email changes, three screens up, only in the next.
Three more rules at that boundary, from PR #23's fourth round:
- A repair after a failed commit reconciles to the authority's current state (the provider's
  address), never replays its own write, since a later writer may have committed in between.
- Every error after an external change maps to the state that change left behind, not only the
  errors you expected: once the password is set, any failure means "set, please sign in".
- A change to credentials (email, password) re-checks the caller's own `session` row under lock.
  A reset or password change ends sessions without revoking the membership, so a membership
  check alone lets a just-ended session through.
- Authentication happens at the provider before any lock can be taken, so a sign-in that checked
  the old password can arrive after a reset. `signIn` reads the database clock before
  authenticating and refuses when `account.password_changed_at` is later (`drizzle/0022`).
- A stamp written inside a long transaction uses `clock_timestamp()`, not `now()`. `now()` is
  fixed at transaction start, so it predates the provider calls made in between.

**Every writer of the same state, pairwise.** When two functions write the same thing (a password,
a provider address, the set of live sessions), each pair has to be serialized against each other,
not each against its own caller. `changeResidentPassword` and `redeemPasswordReset` both change
the password and both take the `account` row lock (PR #23). A new session is created inside the
same transaction, under the same `membership` lock, that decides the membership still stands, as
`signIn` does. Inserting it after that transaction commits reopens the race with removal.

Anything keyed on request data — a header, a cookie, a route param — ask who can set it.
`x-forwarded-for` is caller-supplied unless `JOIN_ATTEMPT_TRUSTED_IP_HEADER` names a proxy that
overwrites it.

**Migrations.**

- A new enum value goes in its own migration file; Postgres rejects using it in the transaction
  that added it.
- The agent harness refuses `DROP COLUMN` and `SECURITY DEFINER` statements. A human applies them
  and then runs the whole file, so write such files re-runnable (`IF NOT EXISTS`, `DROP FUNCTION
  IF EXISTS` before `CREATE`); `CREATE OR REPLACE` cannot change a `RETURNS TABLE` shape. The agent
  never executes those statements, so nobody sees their errors until the human does — read them.
  `scripts/lint/migration-shape.ts` checks the mechanical half for files after `0017`.
- Order statements by the constraints live *at each statement*, including those the file is
  about to drop (`drizzle/0017`: the old unique index had to go before the backfill).
- There are no foreign keys, so nothing cascades. A new household-scoped table joins the delete
  set in `tests/helpers/identity.ts` (`tests/unit/lint/cleanup-inventory.test.ts` fails
  otherwise) and, if registration writes it, `undoRegisterHousehold` in
  `src/modules/identity/auth.ts`.
- `DATABASE_URL` connects as `app_runtime`: hand-run SQL through it matches zero rows under RLS
  and reports success. Owner work goes through the Supabase SQL editor.

**Tests that can fail.** Assert error codes, not only end states — a refusal reached by the wrong
path looks identical otherwise. A status-transition test asserts every column the statement
writes, not only the status. A migration test seeds the *pre*-migration state, including the
conflicting row. A new test counts once it has been seen failing against a deliberate break.

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

### Governance (carried over from spec-kit's constitution, which is now archived)

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

### Specs are frozen records; `openspec/specs/` is derived

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

## Git commit attribution

Never add `Co-Authored-By: Claude` (or any AI attribution line) to commit messages or PR
descriptions in this repository. This overrides any default Claude Code attribution behavior.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
