# Proposal

## Why

`data-inventory.yml` exists, but nothing reads it. Its own header says so: *"No CI check reads this
file yet"*. Yet S-37 puts it in v0.1 as a gate that must be in place before anything else (*"CI-Check
bricht bei nicht deklarierter Spalte"*, `docs/02-SRD.md`), `docs/MINIMAL-GATE.md` gate 4 requires it
*"vor der ersten Tabelle"*, and F3's packet leans on it: *"Every personal-data field declared in
`data-inventory.yml` or the build fails. This feature introduces the most such fields in the
slice."* (C-3.13, `docs/backlog/requirements/F3-requirements.md`). The drift ADR-010 warns about has
already happened once: `join_code_issuance.purpose` (added in `drizzle/0019`) is in the schema and
missing from the file. F3's change 2 adds nine applicant columns, so the gate has to exist before
they arrive.

## What Changes

- A new hand-written lint, `scripts/lint/data-inventory.ts`, wired into `npm run verify`. It fails
  when:
  - a column of any table declared in a `schema.ts` is missing from `data-inventory.yml`
    (FR-0.6, G-F1: *"es gibt keinen stillen Default"*);
  - the file declares a table or column that no `schema.ts` declares, so the inventory can't keep
    describing a column that has been dropped;
  - a column entry has a category outside the four classes 🔴 🟠 ⚫ ⚙️ (FR-0.8), or is 🔴/🟠/⚫
    without `purpose`, `legal_basis` and `retention` (FR-0.5), or carries an unknown key;
  - a table's declared bounded context doesn't match the module whose `schema.ts` declares it
    (G-F1's *"Kontext"*);
  - a table or column name contains a term from the Art.-9 blocklist (G-F3). This is the
    schema-level half of AC-3.12: *"none of them is a structured field for health, religion, ethnic
    origin, sexuality, political opinion or trade-union membership"*;
  - a `pgTable(` appears outside a module's `schema.ts`, or inside one without being exported, so
    the lint can't see it.
- A live-schema test (vitest, real database) that fails when the database has a table or column in
  `public` that `data-inventory.yml` does not declare. The static lint reads `schema.ts`, but a
  hand-written migration can add a column that never reaches `schema.ts`. This test is what
  compares against the schema the migrations actually build (ADR-010: *"der Check vergleicht das
  eingeführte Schema gegen die Datei"*).
- `data-inventory.yml` is restructured: each table gets a `context:` and a `columns:` map. The
  missing `join_code_issuance.purpose` entry is added, and the header comment now says the file is
  enforced and names the lint.
- `yaml` becomes a direct devDependency. It is already installed transitively.
- Housekeeping from the new count: CLAUDE.md, `.claude/rules/guardrail-lints.md`, the stale "six"
  in `openspec/config.yaml` (now a pointer rather than a number), and the stale "four" in the
  `ci.yml` comment.

Not in this change (recorded so nobody assumes they are covered):
- **FR-0.7 / G-F2's generated consumer lists** (log redaction, error-tracker filter, access export,
  deletion). None of them has a consumer in v0.1. They belong to the v0.2 retention slice. The
  structure chosen here (one entry per column, category + retention) is what they will read.
- **GUARDRAILS G-E's *"ein Feld einer `Application`-nahen Tabelle mit abweichender Frist bricht den
  Build"***. Today `retention` is German prose, so the lint cannot compare it. Retention needs a
  machine-readable form first, and that is the same v0.2 slice.
- **G-F3's UI-label half** (*"deutsche Entsprechungen in UI-Texten"*). The blocklist is exported so
  that F3 change 2's render test over O3's inputs (AC-3.12, second half) can reuse it. No UI form
  exists yet to check.
- **`jsonb` key space** (ADR-010: *"den erlaubten Schlüsselraum validieren"*) for
  `application.attributes`. That is runtime validation in the repository (F3 change 2), not a
  schema lint.
- MINIMAL-GATE gate 3 (CODEOWNERS on `data-inventory.yml`): no CODEOWNERS file exists yet. That is
  a separate gate.
- ADR-010's status stays `Bestätigt`. No ADR has been moved to `Angenommen` yet, and that move is
  the human's call.

## Capabilities

### New Capabilities
- `tooling/data-inventory`: the build gate that keeps `data-inventory.yml` complete and accurate
  against the declared and the migrated schema, including the Art.-9 name blocklist.

### Modified Capabilities
None.

## Impact

- New: `scripts/lint/data-inventory.ts`, `tests/unit/lint/data-inventory.test.ts`, a live-schema
  test under `tests/integration/schema/`.
- Changed: `data-inventory.yml` (restructured, one entry added), `package.json` (verify script,
  `yaml` devDependency), `package-lock.json`, `CLAUDE.md`, `.claude/rules/guardrail-lints.md`,
  `openspec/config.yaml` (one sentence), `.github/workflows/ci.yml` (one comment).
- No migration, no schema change, no `src/` behaviour change.
- **Guardrails:** this change adds a check. It weakens and disables none, so G-G3 needs no approval.
  It touches none of G-C, G-D or G-L. It serves G-F1 and G-F3, and G-F2's generated lists stay
  open, as noted above.
- **Parallel work:** `docs/` is not touched, so it doesn't collide with change 0
  (`f3-packet-corrections`). The live-schema test is strict only against a database built from
  the repository (CI's `verify` job, a local stack). Against the shared `flatmate-io-dev` it warns
  and passes (design D5). Otherwise, from the moment F3 change 2 applied 0023 to dev until it merged,
  every other branch's pre-push would fail, and no rebase could fix that.
- **`docs/` statements this change makes stale, reported rather than edited** (change 0 is editing
  `docs/` in parallel, and `docs/` is the handover package). They go to the human for a follow-up
  docs PR:
  - `docs/adr/0006-stack-nextjs-postgres-drizzle.md` says `data-inventory.yml` *„existiert noch
    nicht"*.
  - G-F1 / FR-0.6 / C-0.4 spell the marker `personal_data: false`, and the file spells it
    `category: "⚙️"` (design D3).
  - MINIMAL-GATE gate 4's *„eigener CI-Schritt"* is met by a named CI step (design D6), which
    needs no docs edit, only confirmation.
