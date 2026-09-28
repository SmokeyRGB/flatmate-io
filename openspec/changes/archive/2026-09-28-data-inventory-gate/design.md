# Design

## Context

Why the gate is needed is in proposal.md (Why), and what it must enforce is in
`specs/tooling/data-inventory/spec.md`. Here is the current state that shapes how:

- Three `schema.ts` files (`src/modules/{casting,audit,identity}/schema.ts`) declare 13 tables.
  They import only `drizzle-orm`, `drizzle-orm/pg-core` and `src/db/rls-predicates.ts`, so no
  import has side effects. Importing them under `tsx` and calling `getTableConfig` works; it was
  tried on this tree (2026-09-28). It found exactly one piece of drift: `join_code_issuance.purpose`
  is missing from the inventory. Nothing in the inventory is stale.
- The seven existing lints (`scripts/lint/*.ts`) are standalone `tsx` scripts. Each exports a pure
  `check*` function, has a `main` guard, and has a unit test under `tests/unit/lint/` that writes
  fixtures into a `mkdtemp` directory.
- `drizzle/` holds hand-written migrations next to generated ones (0017–0022). A column added only
  in SQL would never reach `schema.ts`.
- `tests/integration/policy/table-ownership.test.ts` already queries catalog metadata through
  `@/db/client`. That is the precedent for a live check.
- `yaml@2.9.1` is in `node_modules` as a transitive dev dependency.

## Goals / Non-Goals

**Goals:**
- Make both directions of drift between `schema.ts` and `data-inventory.yml` fail `npm run verify`,
  plus drift between the migrated database and the file.
- Keep the check honest about what it proves: completeness and shape, never correctness of a
  classification (ADR-010: *„Er prüft Vollständigkeit, nicht Richtigkeit."*).

**Non-Goals:** generating any consumer list, comparing retention periods, checking UI labels, or
validating `jsonb` contents. See the proposal's "Not in this change" list for where each goes.

## Decisions

### D1 — Columns come from Drizzle's own table config, not from parsing source

The lint dynamically imports every `src/modules/*/schema.ts` (discovered by walking
`src/modules/`, not from a hard-coded list, so a fourth module is picked up automatically). It takes
each export for which `is(value, PgTable)` holds and reads `getTableConfig(table)` for `.name` and
`.columns[].name`. These are the SQL names, the same ones `drizzle-kit` writes into migrations.

*Alternative rejected:* regex over the source, as `rls-coverage.ts` does. Column builders take the SQL
name as a string argument (`uuid("household_id")`), but a helper function, a spread or a
multi-line call would slip past a regex. Drizzle's config is the object `drizzle-kit` itself
generates from, so it cannot disagree with the migrations drizzle-kit writes.

*What import-based discovery cannot see*, and how each case is closed:
- **A table builder used outside a module's `schema.ts`.** The scan runs over `src/` and
  `scripts/` and keys on the **import**, not the call: any file outside `src/modules/*/schema.ts`
  that imports or re-exports `pgTable`, `pgTableCreator` or `pgSchema` from `drizzle-orm/pg-core`
  (named, aliased, namespace or star import/re-export, `require`, dynamic `import()`) fails the lint
  and is named. A named import of types or helpers only (`PgTable`, `getTableConfig`) is allowed:
  `src/db/session-context.ts` and `audit/repository.ts` need them. A `schema.ts` that uses
  `pgTableCreator` is refused outright, because the call count can't follow a creator. This
  catches `pgTable.withRLS(`, `pgSchema("x").table(`, an aliased import (`pgTable as t`), and
  `pgTable (` with a space, which a call-site regex would miss. Paths are normalised `\` to `/`
  before matching, as `rls-coverage.ts` does. Without that, every `schema.ts` on Windows reads as
  "outside". The lint file itself imports only `PgTable` and `getTableConfig`, not the builders,
  so it doesn't trip its own scan.
- **A table that isn't exported.** For each `schema.ts`, count the table-builder calls (comments
  stripped, as `rls-coverage.ts` does; the count matches `pgTable` with an optional `.withRLS`
  followed by `(`, and `.table(`, whitespace allowed) and compare against the exported `PgTable`
  values, **deduplicated by object identity** so a re-exported alias (`export const b = a`) isn't
  counted twice. A mismatch fails the lint and names the file.
- **A column or table that only SQL creates.** The live test (D5) covers it.
- **A column declared without an explicit SQL name** (`healthNotes: text()`). Drizzle then uses the
  key as the SQL name, in camelCase. The loader reads SQL names from the config, so the name is
  still checked, and D4 splits camelCase so the blocklist still applies. Every column in this repo
  passes its name explicitly today. That stays a convention, not a rule of this gate.

### D2 — Split the lint into a loader and a pure checker

- `loadSchemaTables(rootDir)` is async. It performs the imports and the two text scans, and returns
  `{ context, table, columns[], file }[]` plus source-scan violations. `context` is the module
  directory name.
- `checkInventory(tables, inventoryText)` is pure. It parses the YAML and returns violations.

Unit tests call `checkInventory` with table shapes built from real `pgTable(...)` objects declared
inline in the test file, passed through the same `getTableConfig` mapping via a small exported
`describeTable(pgTable)` helper. That avoids a fixture `schema.ts` in a temp directory: a file there
cannot resolve `drizzle-orm`. The text scans keep the existing `mkdtemp` fixture style, because they
don't import anything. One unit test also runs `loadSchemaTables` against the real repository root
and asserts it finds the 13 known tables. Without it, a loader bug that returns an empty list would
make every check vacuous. That test is the falsification anchor. It is the one place the exact table list is written
down, so a change that adds a table (F4's `vote`, for example) updates that list alongside the
inventory.

### D3 — Inventory shape: `context` + `columns` per table

```yaml
tables:
  application:
    context: casting
    columns:
      id: { category: "⚙️" }
      created_by_account_id: { category: "🟠", purpose: "…", legal_basis: "…", retention: "…" }
```

It replaces today's flat `table: { column: {...} }` shape. A reserved key such as `_context`
inside the column map would share a namespace with column names. Every existing entry is carried
over with its values unchanged: a mechanical restructure, reviewed as a diff of values, not of
layout (task 2.2 checks it).

Validation rules (all from the spec):
- Top level: exactly `tables`. Per table: exactly `context` and `columns`.
- Per column: `category` is required, and the allowed keys are `category`, `purpose`,
  `legal_basis` and `retention`. Anything else is a violation, so a misspelt `legalbasis` cannot
  pass silently.
- Categories are compared after stripping U+FE0F (the emoji variation selector), so `⚙` and `⚙️`
  are the same class. The four canonical values are listed in every category error.
- 🔴/🟠/⚫ require the three text keys, each non-empty after trim.
- ⚙️ with `legal_basis` is allowed (today `join_code_issuance.code` carries `"n/a — nicht
  personenbezogen"`). Only unknown keys are refused.

**Which direction ADR-010 asks for.** ADR-010 says *„der Check vergleicht das eingeführte Schema
gegen die Datei, nicht umgekehrt"*. The gate's primary direction is exactly that: schema to file.
The stale check (file to schema) is an addition, not a reversal. ADR-010's own *„Zwei Wahrheiten …
müssen synchron bleiben"* asks for it, and F3 change 4 relies on it when it drops `deleted_at`. We
read the *„nicht umgekehrt"* as ruling out generating the schema from the file, not as forbidding
the file from being checked for stale entries.

G-F1 phrases the explicit marker as *`personal_data: false`*. In this file it is written
`category: "⚙️"`, the class ADR-010 and FR-0.8 name for "not personal data". It is the same
decision and just as explicit, so the gate treats `category` as required and has no default. This
is a spelling, not a deviation, and the file's header says so.

### D4 — The Art.-9 blocklist: word-prefix stems, English + German, no exemption

**Splitting.** The name is NFC-normalised, split into words at `_` and at camelCase boundaries
(`healthNotes` becomes `health`, `notes`), then lowercased.

**Matching.** A single-word stem matches when a word *starts with* it. That covers plurals
(`religions`, `disabilities`, `unions`, `parteien`) and German compounds (`gesundheitsdaten`,
`behinderungsgrad`, `gewerkschaftsmitglied`, `religionszugehoerigkeit`). G-F3's multi-word terms need no special matching: each has a single-word stem (`marital_status` to
`marital`, `sexual_orientation` to `sexual`, `trade_union` to `union`). A stem
appearing inside a word, not at its start, does not match: `reunion` is not `union`.

**Scope.** The function runs over every name the gate knows: `schema.ts` table and column names,
inventory table and column keys, and, in the live test, catalog table and column names. A name
created only in SQL is caught too.

**The stems.** From G-F3's list: `nationalit`, `religio` (religion, religious), `health`, `disabilit` (disability, disabilities; not `disab`, which would refuse every technical
`disabled_at`/`disable_reason` column, and the gate has no exemption marker), `ethnic`, `marital`, `sexual` (sexuality, sexual_orientation,
sexual_preference), `politic` (political, politics), `union`. German stems in ASCII transliteration
and umlaut form: `nationalitaet`/`nationalität`, `staatsangehoerig`/`staatsangehörig`, `herkunft`,
`konfession`, `glaube`, `gesundheit`, `behinderung`, `familienstand`, `sexualitaet`/`sexualität`,
`partei`, `gewerkschaft`. Because names are NFC-normalised first, a decomposed `ä` still matches the
umlaut form.

Deliberately **not** included:
- `origin`: it would match technical names like `origin_url`.
- `race`: it would match `race_condition`-style names, and `ethnic` and `herkunft` cover the
  category.
- `belief`/`faith`: too broad in English, and `konfession`, `glaube` and `religio` cover it.

Checked against today's 13 tables: no stem prefixes any word (`union` does not prefix `unique`,
and `partei` does not prefix `participation`). Task 4.5 asserts the real tree has zero matches.
G-F3 names the residual gap itself: *„Ein umbenanntes Feld (`background`, `lifestyle`) entkommt der
Liste — dagegen hilft nur das Review."*

The list and the matcher are exported as `ART9_BLOCKLIST` and `matchArt9Term(name)`. F3 change 2's
AC-3.12 render test imports them to check O3's input names and labels.

**No exemption marker.** Unlike `rls-coverage.ts`, the gate has no escape hatch: G-F3 says *„Es
entstehen keine Felder"*, and a false positive on a technical name is renamed, or exempted by a
human decision under G-G3 in the same commit as the code change.

### D5 — The live check: one direction, pg_catalog, public schema

`tests/integration/schema/data-inventory-live.test.ts` queries `pg_catalog`: `pg_class`
(relkind `r`/`p`, `NOT relispartition`) joined to `pg_namespace` (`public`) and `pg_attribute`
(`attnum > 0`, not `attisdropped`).
- **Views are excluded on purpose.** `casting_round_admin_view` (`drizzle/0008`) projects declared
  columns and holds no data of its own.
- **Partition children are excluded** so that they don't read as undeclared tables. There are none
  today.
- **Why `pg_catalog` rather than `information_schema.columns`:** `information_schema` shows only
  columns the current role holds a privilege on. `app_runtime` holds privileges on every `public`
  table today (`scripts/db/bootstrap-roles.sql`, grants plus default privileges), so both would work.
  `pg_catalog` stays correct if a future `REVOKE` narrows that, and every role can read it.

Every catalog `(table, column)` must be declared in the inventory, parsed with the same parser the
lint uses. A declared entry the database lacks is **not** a failure here:
- Reason: on the shared `flatmate-io-dev` database, a branch can legitimately be ahead of the
  database. F3 change 4 drops `deleted_at` by human hand-off, and the code and inventory change
  first.
- Coverage: the static lint already catches stale entries against `schema.ts`, and CI's `verify`
  job builds its database from `drizzle/` alone, so CI's run of this test is exact.

**Strict on a repository-built database, a warning on the shared one.** The pre-mortem showed
that a strict failure on shared dev blocks every other push. From the moment F3 change 2 applies
0023 to dev until it merges, every other branch's pre-push `verify` would fail. Rebasing can't help,
because the entries sit on change 2's unmerged branch, and a `main` hotfix in that window would need
`--no-verify`.

So the test decides by an explicit flag, with the host as a fallback. `scripts/ci/bootstrap-local-db.sh`
exports `DATA_INVENTORY_LIVE_STRICT=1` for CI's `verify` job, so the enforcing job doesn't depend on
which hostname its `DATABASE_URL` uses (code review 2026-09-28). Without the flag:
- **`localhost`, `127.0.0.1` or `::1`** (CI's `verify` job and a local stack, both built from
  `drizzle/` alone): the findings fail the test.
- **Any other host** (hosted dev from a local run, the pre-push hook, or CI's `verify-hosted`): the
  test prints the same findings with `console.warn` and passes.

The enforcement doesn't depend on anyone reading the warning: CI's `verify` job runs on every pull
request against a repository-built database, so an undeclared SQL-only column cannot merge. The
warning says the branch may be behind the database's migrations. The applier reports any warning
it sees on dev, and task 5.2 stops on one.

*Alternative rejected:* parsing `drizzle/*.sql` statically. That would need a SQL parser for
`CREATE TABLE`/`ALTER TABLE … ADD COLUMN` across hand-written files. The catalog is the ground
truth, and a test that runs against it is cheaper and exact.

### D6 — Wiring

- `package.json` `verify`: add `tsx scripts/lint/data-inventory.ts` after `rls-coverage.ts`, since
  both are schema checks.
- `.github/workflows/ci.yml`, `verify` job: add a step of its own, `Data inventory gate (ADR-010,
  MINIMAL-GATE gate 4)`, running `npx tsx scripts/lint/data-inventory.ts` after `npm run verify`.
  It is separate for the same reason as the existing explicit `check-refs` step: MINIMAL-GATE gate 4
  asks for an *„eigener CI-Schritt"*, and a named step shows up on its own in the checks list.
- The live test runs inside `vitest run` like any other integration test. No separate script.
- `yaml` moves to `devDependencies` at the version already installed (`^2.9.1`). Nothing is
  vendored.
- The lint prints violations grouped by table and exits 1, matching the existing lints' output
  style.

## Entry paths

What can put a column into the database without the gate seeing it:

| Path | Enforced where | Test |
|---|---|---|
| New column in a `schema.ts` | `data-inventory.ts` (import + config) | unit: undeclared column |
| New table in a `schema.ts` | same | unit: undeclared table |
| `pgTable(` outside `schema.ts` | `data-inventory.ts` text scan | unit (fixture) |
| Non-exported `pgTable` in `schema.ts` | `data-inventory.ts` count comparison | unit (fixture) |
| Column/table only in a hand-written migration | live test (pg_catalog) | integration; break = declare nothing for one real column |
| Column added by hand in the SQL editor on dev | live test on local runs | same |
| Column/table only in SQL, suite run against hosted dev | live test **warns only** (D5); CI `verify` enforces | integration (strict path on CI) |
| A future non-`public` schema | **not covered**: all app tables live in `public` today | stated in the test's comment |

## Risks / Trade-offs

- **[A ⚙️ classification that should be 🔴 passes]** → accepted by ADR-010 (*„Das Gate erzwingt
  die Entscheidung, nicht ihre Richtigkeit"*). The diff shows the decision, and review is the
  answer.
- **[The loader silently finds zero tables]** → the real-tree unit test asserts the 13 known
  table names, so a loader regression fails loudly.
- **[Shared dev ahead of a branch]** → the live check is one-directional and only warns on a hosted
  database (D5), so one branch's migration can't block another branch's pre-push. CI's `verify` job
  enforces it strictly.
- **[The warning is ignored on dev]** → accepted, because CI's `verify` still fails the pull request.
  The only cost is that the problem shows up at PR time rather than at push time.
- **[The restructure changes a value by accident]** → task 2.2 compares old and new
  `(table, column, key, value)` tuples by script, and the result must be identical except for the
  added `purpose` row.
- **[Blocklist false positive on a future technical name]** → rename, or a G-G3 human decision.
  It is cheaper than a leaky list.
- **[Dynamic import of `schema.ts` pulls in something with side effects later]** → the loader
  imports only `schema.ts` files. A future side-effecting import there would already break
  `drizzle-kit`. The standalone lint runs without an env file, both in `verify` and in its own CI
  step, so a schema import that needs `DATABASE_URL` would surface there. The vitest run can't show
  this, because `tests/setup.ts` loads the DB client.

## Migration Plan

No database migration. Rollback is reverting the commit. The gate carries no state.
