# Tasks

## 1. Dependency

- [x] 1.1 Add `yaml` as a direct devDependency at the installed version (`npm install -D yaml@^2.9.1`),
  touching `package.json` and `package-lock.json`. Verify that `node -e "require.resolve('yaml')"`
  resolves and that `package.json` lists it under `devDependencies`.

## 2. Inventory file

- [x] 2.1 Before editing, dump the current `data-inventory.yml` as sorted `(table, column, key,
  value)` tuples to a scratch file outside the repo. Use a `yaml` parse in a one-off `tsx` snippet,
  and don't commit it.
- [x] 2.2 Restructure `data-inventory.yml` to the D3 shape (`tables.<t>.context` +
  `tables.<t>.columns`). Set `context` to the module directory (`casting`, `audit` or `identity`)
  of the `schema.ts` that defines the table. Keep every existing value, and every existing comment
  that still holds. Rewrite the header so that it:
  - says the gate now exists, naming `scripts/lint/data-inventory.ts` and the live test;
  - states that `category: "⚙️"` is this file's spelling of G-F1's `personal_data: false`;
  - states that the gate checks completeness, not correctness.

  Verify: re-dump as in 2.1 and diff. The only difference allowed is the row added in 2.3.
- [x] 2.3 Add `join_code_issuance.purpose` as `{ category: "⚙️", purpose: "Art des Links (join /
  password_reset) — resident-settings Decision 4; personenbezogen erst zusammen mit
  resident_profile_id, das 🟠 deklariert ist" }`. **The classification is a human decision
  (ADR-010).** The applier writes this recommended value and lists it in the report as awaiting the
  human's confirmation: the tick means "written", not "confirmed".

## 3. The lint

- [x] 3.1 Create `scripts/lint/data-inventory.ts` with a header comment in the style of
  `rls-coverage.ts`. The header names the guardrails served (G-F1, G-F3, FR-0.5/0.6/0.8, AC-0.4,
  C-3.13, and the schema half of AC-3.12), what the lint cannot prove, and the reading of ADR-010's
  *„nicht umgekehrt"* (D3). Export:
  - `ART9_BLOCKLIST` and `matchArt9Term(name): string | null`, per D4: NFC-normalise, split at `_`
    and at camelCase boundaries, lowercase, then match word-prefix stems, using exactly the stems listed in D4.
  - `describeTable(table: PgTable)`, returning `{ table, columns[] }` via `getTableConfig`.
  - `loadSchemaTables(rootDir)`, async. It discovers `src/modules/*/schema.ts` by walking, imports
    each via `pathToFileURL`, keeps the exports where `is(v, PgTable)` holds (deduplicated by object
    identity), and takes the module directory as the context. It also runs the D1 scans, with
    `\` normalised to `/`:
    - any file under `src/` or `scripts/` outside `src/modules/*/schema.ts` that imports `pgTable`
      or `pgSchema` from `drizzle-orm/pg-core`;
    - any `schema.ts` whose table-builder call count (comments stripped) differs from its deduped
      exported table count.
  - `parseInventory(text)`, shared with the live test.
  - `checkInventory(tables, inventoryText)`, pure. It covers every rule in the spec's first four
    requirements, with the messages the scenarios name. The Art.-9 check runs over `schema.ts`
    names **and** inventory keys.
  - A `main` guard that runs both, prints violations grouped by table, and exits 1 on any.

  Verify: `npx tsx scripts/lint/data-inventory.ts` prints OK on the tree after section 2, run
  **without** `--env-file`.
- [x] 3.2 Wire it into `package.json` `verify`, right after `tsx scripts/lint/rls-coverage.ts`.
  Verify that `npm run verify` runs it (its OK line appears in the output).
- [x] 3.3 In `.github/workflows/ci.yml`, `verify` job, add a step named `Data inventory gate
  (ADR-010, MINIMAL-GATE gate 4)` that runs `npx tsx scripts/lint/data-inventory.ts` after the `npm
  run verify` step (D6). Place and style it like the existing explicit check-refs step. Verify that
  the YAML still parses (`npx yaml valid < .github/workflows/ci.yml` or an equivalent parse).

## 4. Unit tests (`tests/unit/lint/data-inventory.test.ts`)

Each test states in a comment the deliberate break that makes it fail. The applier reports having
seen each one fail at least once, by temporarily inverting the rule or the input and then restoring
it.

- [x] 4.1 **Loader against the real tree.** `loadSchemaTables(repoRoot)` returns exactly the 13
  known tables with their contexts and no source-scan violations. This is the one place the exact
  list lives (D2). Break: make the loader skip one module directory; the test must fail.
- [x] 4.2 **The real inventory passes.**
  `checkInventory(await loadSchemaTables(root), readFile('data-inventory.yml'))` returns `[]`.
  Break: delete the `purpose` row from a copy of the text; exactly one violation, naming
  `join_code_issuance.purpose`.
- [x] 4.3 **Undeclared column, undeclared table, stale column, stale table.** Build inline
  `pgTable(...)` objects, pass them through `describeTable`, and use small inline YAML strings. Write
  one `it` per case, each asserting the violation's table, column and kind, not only the count.
- [x] 4.4 **Entry shape.** Cover each of these:
  - 🔴 without `legal_basis`: the message names the key.
  - ⚫ with a `retention` that is empty after trim.
  - An unknown category: the message lists all four.
  - The misspelt key `legalbasis`.
  - `⚙` without U+FE0F: accepted as ⚙️.
  - ⚙️ with only `category`: accepted.
  - ⚙️ with `purpose`, `legal_basis` and `retention`: accepted.
  - A wrong `context`: the message contains **both** the declared and the actual context.
  - A table entry missing `context` or `columns`.
- [x] 4.5 **Art.-9 blocklist.** Each of these fails, naming the matched stem: `health_notes`,
  `healthNotes`, `religion`, `religions`, `trade_union`, `marital_status`, `konfession`,
  `gesundheit_info`, `gesundheitsdaten`, `staatsangehörigkeit` written with a decomposed `ö` (`"ö"`, tests NFC),
  `familienstand`, and a table named `disability_record`. These do not match: `reunion_at`,
  `origin_url`, `household_id`, `participation`, `unique_key`.
  - Run it end to end through `checkInventory`: a blocklisted column that is otherwise fully
    declared still fails, and a blocklisted key present **only** in the inventory fails too.
  - Run it over the real tree: zero matches across every `schema.ts` and inventory name.
- [x] 4.6 **Source scans**, using mkdtemp fixtures as in `rls-coverage.test.ts`. Each of these is a
  violation naming the file:
  - an `import { pgTable } from "drizzle-orm/pg-core"` in `src/modules/x/helpers.ts`;
  - `import { pgTable as t } …` in `scripts/foo.ts`;
  - a `pgSchema` import in `src/lib/y.ts`;
  - a `schema.ts` with one exported and one non-exported `pgTable`.

  These are not violations:
  - a `pgTable(` mentioned only in a comment;
  - a `schema.ts` with `export const b = a` aliasing an exported table (dedup);
  - a correctly placed `schema.ts` on a path built with `\` separators.

## 5. Live-schema test (`tests/integration/schema/data-inventory-live.test.ts`)

- [x] 5.1 Query `pg_catalog` per design D5 (relkind `r`/`p`, `NOT relispartition`, `public`,
  `attnum > 0`, not dropped) via `db` from `@/db/client`. The precedent is
  `tests/integration/policy/table-ownership.test.ts`.
  - **Inventory:** parse `data-inventory.yml` with `parseInventory`.
  - **Assertion:** every catalog `(table, column)` is declared, and no catalog table or column name
    matches `matchArt9Term`.
  - **Non-vacuous:** the catalog's table set must be a **superset** of
    `loadSchemaTables(root)`'s table names. Don't hard-code 13.
  - **Strict or warn by host (D5):** `DATA_INVENTORY_LIVE_STRICT=1` (set by CI's bootstrap), or a `DATABASE_URL` host `localhost`,
    `127.0.0.1` or `[::1]`, makes
    the findings fail the test. Any other host sends them to `console.warn`, prefixed `data-inventory
    live check:` and saying the branch may be behind the database's migrations, and the test passes.
  - **Comments:** state the one-directional choice, the host split and why, that views are excluded
    on purpose, and that non-`public` schemas are not covered.
  - **Break:** temporarily delete one real column's entry from `data-inventory.yml`, run the test
    with the strict path forced (temporarily flip the host check, then restore it), see it fail
    naming that column, and restore both.
  - **Verify:** the test passes against `flatmate-io-dev`. Report whether it printed any warning.
- [x] 5.2 If 5.1 prints a warning on `flatmate-io-dev` naming a table or column that no `schema.ts`
  and no migration in `drizzle/` declares (for example, `household.join_code` if 0013's human-run
  `DROP COLUMN` never ran), **stop and report it**. Do not declare it to silence the warning, and do
  not drop it: that is dev drift for the human to look at.

## 6. Documentation and counts

- [x] 6.1 `.claude/rules/guardrail-lints.md`:
  - add the `data-inventory.ts` row (G-F1 / G-F3 / FR-0.6);
  - change "seven" to "eight", and change "is the eighth check" (about `cleanup-inventory.test.ts`)
    to "is the ninth check";
  - add one sentence naming `tests/integration/schema/data-inventory-live.test.ts` as the half of
    the gate that runs inside vitest (strict on CI's stack, a warning on hosted dev).
- [x] 6.2 `CLAUDE.md`:
  - "seven guardrail lints" becomes "eight", in the Commands block and in the paragraph under it,
    and "an eighth check" becomes "a ninth check";
  - in the Tests bullet, add `tests/integration/schema/` (catalog checks against the migrated
    database) next to `policy/` and `raw-sql/`.
- [x] 6.3 `openspec/config.yaml`: replace "the six hand-written guardrail lints in scripts/lint/"
  with "the hand-written guardrail lints in scripts/lint/ (listed in
  .claude/rules/guardrail-lints.md)". It becomes a pointer, not a count. Verify that `npx openspec
  doctor` still parses the config.
- [x] 6.4 `.github/workflows/ci.yml` line ~146: change the comment's "four custom guardrail checks"
  to "the custom guardrail checks". This is a comment only.
- [x] 6.5 Grep the repo for other stale lint counts and for claims that nothing reads
  `data-inventory.yml` (`grep -rn "data-inventory" src tests scripts`, plus a grep for "No CI
  check"). Exclude `node_modules`, `.claude/worktrees`, `openspec/changes/archive` and `archive/`.
  Update any hits in `src/`, `tests/` or `scripts/`. **Do not edit `docs/`.** List any stale
  `docs/` statement in the report instead. The proposal already names three.

## 7. Gate

- [x] 7.1 `npm run verify` passes against `flatmate-io-dev`. Report its real tail output: the lint
  OK lines, check-refs, the vitest summary, and any `data-inventory live check:` warning.
- [x] 7.2 End-to-end falsification: temporarily add `healthNotes: text("health_notes")` to `room`
  in `src/modules/casting/schema.ts` and run `npx tsx scripts/lint/data-inventory.ts`. Report both
  violations (undeclared column and blocklist). Then revert, and confirm that `git diff` shows no
  change to `schema.ts`.
