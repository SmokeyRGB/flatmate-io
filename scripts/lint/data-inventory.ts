// The data-inventory gate (ADR-010, S-37, docs/MINIMAL-GATE.md gate 4). Keeps
// `data-inventory.yml` — the Art.-30-shaped declaration of every database column's privacy
// category, and for personal data its purpose, legal basis and retention — a complete and
// accurate mirror of the schema. Serves G-F1 ("Zweck, Rechtsgrundlage, Frist, Kategorie und
// Kontext" for every column, "es gibt keinen stillen Default"), G-F3 (the Art.-9 name blocklist),
// FR-0.5/0.6/0.8, AC-0.4, C-3.13 (F3's applicant fields), and the schema half of AC-3.12.
//
// What this lint CANNOT prove: that a classification is CORRECT, only that one is present and
// shaped right (ADR-010: "Er prüft Vollständigkeit, nicht Richtigkeit."). A column wrongly
// declared ⚙️ when it should be 🔴 passes here — that is a review question, not a lint question.
// It also cannot see a column that only a hand-written migration creates without ever touching
// schema.ts (tests/integration/schema/data-inventory-live.test.ts covers that, against the
// migrated database itself), and it cannot validate `application.attributes`' jsonb key space
// (that's runtime validation, not a schema lint — see the proposal's "Not in this change" list).
//
// ADR-010 says "der Check vergleicht das eingeführte Schema gegen die Datei, nicht umgekehrt" —
// this lint's PRIMARY direction is exactly that (schema.ts -> file). The second requirement below
// (a stale inventory entry) is a read of ADR-010's own "Zwei Wahrheiten (Schema und YAML) müssen
// synchron bleiben": we take "nicht umgekehrt" to rule out generating the schema FROM the file,
// not to forbid checking the file for entries the schema no longer has.
import { is } from "drizzle-orm";
import { getTableConfig, isPgEnum, PgSchema, PgTable } from "drizzle-orm/pg-core";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import { blankComments, walk } from "./_shared";

// ---------------------------------------------------------------------------
// D4 — the Art.-9 blocklist: word-prefix stems, English + German, no exemption.
// ---------------------------------------------------------------------------

// From G-F3's list ("nationality, religion, health, disability, ethnicity, marital_status,
// sexual_orientation, political, union" and, in UI texts, their German equivalents:
// „Nationalität, Herkunft, Religion, Gesundheit, Behinderung, sexuelle Orientierung, politische
// oder gewerkschaftliche Zugehörigkeit, Familienstand"). Where English and German share a root,
// one stem short enough to prefix both serves both languages: `religi` (religion, religious,
// religiös, religioes), `ethni` (ethnic, ethnicity, ethnisch, Ethnie), `politi` (political,
// politics, politisch, Politik), `sexu` (sexual, sexuality, sexuell, Sexualität), `nationalit`
// (nationality, Nationalität, nationalitaet). `weltanschau` covers Weltanschauung, the Art.-9
// category of philosophical belief. Umlaut stems exist in both spellings (ASCII transliteration
// and umlaut); names are NFC-normalised before matching.
// Deliberately NOT included:
// - `origin`: it would match `origin_url`. `herkunft` and `ethni` cover the category.
// - `race`: it would match `race_condition`-style names.
// - `belief`/`faith`: too broad in English. `religi`, `konfession`, `glaube` and `weltanschau`
//   cover it.
// - `disab`: it would refuse every technical `disabled_at`/`disable_reason` column, and this gate
//   has no exemption marker. `disabilit` and `behinder` (Behinderung, behindert) cover the
//   category.
// - `polit`: it would match `polite`. `politi` does not.
export const ART9_BLOCKLIST: readonly string[] = [
  // shared English/German roots
  "nationalit",
  "religi",
  "ethni",
  "politi",
  "sexu",
  // English
  "health",
  "disabilit",
  "marital",
  "union",
  // German
  "staatsangehoerig",
  "staatsangehörig",
  "herkunft",
  "konfession",
  "glaube",
  "weltanschau",
  "gesundheit",
  "behinder",
  "familienstand",
  "partei",
  "gewerkschaft",
];

// Splits a name into lowercase words at `_` and at camelCase boundaries, after NFC-normalising
// (so a decomposed "ö" still matches an umlaut-form stem). The boundary is Unicode-aware, so an
// uppercase umlaut starts a word too (`familienÄnderung` → `familien`, `änderung`).
function splitWords(name: string): string[] {
  const normalised = name.normalize("NFC").replace(/([\p{Ll}\p{Nd}])(\p{Lu})/gu, "$1_$2");
  return normalised
    .split("_")
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 0);
}

// A stem matches when a word *starts with* it: that covers plurals and German compounds, and it
// covers G-F3's multi-word terms too, since each has a single-word stem of its own
// (`marital_status` → `marital`, `sexual_orientation` → `sexual`, `trade_union` → `union`). A stem
// appearing inside a word but not at its start does not match (`reunion` is not `union`).
export function matchArt9Term(name: string): string | null {
  const words = splitWords(name);
  for (const stem of ART9_BLOCKLIST) {
    if (words.some((w) => w.startsWith(stem))) return stem;
  }
  return null;
}

// ---------------------------------------------------------------------------
// D1/D2 — loading the schema side from Drizzle's own table config.
// ---------------------------------------------------------------------------

export interface DescribedTable {
  table: string;
  columns: string[];
}

// Reads the SQL table/column names from Drizzle's own config — the same object drizzle-kit
// generates migrations from, so it cannot disagree with what actually reaches the database.
export function describeTable(table: PgTable): DescribedTable {
  const config = getTableConfig(table);
  return {
    table: config.name,
    columns: config.columns.map((c) => c.name),
  };
}

export interface SchemaTableInfo extends DescribedTable {
  /** The module directory (e.g. "casting") whose schema.ts declares this table. */
  context: string;
  /** Repo-relative path (forward slashes) to the schema.ts that declares it. */
  file: string;
  /** The Drizzle table. Other lints read policies and columns from this instead of parsing the file. */
  pgTable: PgTable;
}

export interface SourceScanViolation {
  file: string;
  reason: string;
}

export interface LoadResult {
  tables: SchemaTableInfo[];
  violations: SourceScanViolation[];
}

// Matches `pgTable(`, `pgTable.withRLS(` and `.table(` (a `pgSchema("x").table(...)` call),
// whitespace allowed before the paren. Comments are blanked first (scripts/lint/_shared.ts), so a
// `pgTable(` mentioned only in a comment is never counted. Blanking keeps the length; this regex
// does not match across the spaces a comment leaves behind.
const TABLE_BUILDER_CALL = /\bpgTable(?:\.withRLS)?\s*\(|\.table\s*\(/g;

// Every way a file outside a module's schema.ts can get hold of a table builder (`pgTable`,
// `pgTableCreator`, `pgSchema`) from `drizzle-orm/pg-core` or one of its subpaths:
// - a named import, aliased or not (`pgTable as t`: the identifier still appears in the braces);
// - a named re-export (`export { pgTable } from …`), which would let a barrel hand the builder on;
// - a namespace import or star re-export (`import * as pg`, `export * from`), which reaches every
//   builder as `pg.pgTable(`;
// - `require("drizzle-orm/pg-core")` or a dynamic `import("drizzle-orm/pg-core")`.
// A named import of types or helpers only (`PgTable`, `getTableConfig`, `PgColumn`) is not flagged:
// src/db/session-context.ts and audit/repository.ts import those today.
const PG_CORE = String.raw`["']drizzle-orm\/pg-core(?:\/[^"']*)?["']`;
const TABLE_BUILDER_IMPORTS: readonly RegExp[] = [
  new RegExp(String.raw`\b(?:import|export)\s+(?:type\s+)?\{[^}]*\b(?:pgTable|pgTableCreator|pgSchema)\b[^}]*\}\s*from\s*` + PG_CORE),
  new RegExp(String.raw`\bimport\s+\*\s*as\s+\w+\s+from\s*` + PG_CORE),
  new RegExp(String.raw`\bexport\s+\*\s*(?:as\s+\w+\s+)?from\s*` + PG_CORE),
  new RegExp(String.raw`\b(?:require|import)\s*\(\s*` + PG_CORE),
];

// A table creator produces tables through a function the call count below cannot follow, so a
// schema.ts that uses one is refused outright rather than miscounted (every table here uses
// pgTable directly today).
const TABLE_CREATOR_USE = /\bpgTableCreator\b/;

// D1: discovers `src/modules/*/schema.ts` by walking (not a hard-coded list), imports each one,
// keeps the exports that are actually a PgTable (deduplicated by object identity, so an aliased
// re-export like `export const b = a` isn't counted twice), and runs the two source scans that
// catch what import-based discovery alone cannot see: a table builder used outside a module's
// schema.ts, and a table declared but not exported from one.
export async function loadSchemaTables(rootDir: string): Promise<LoadResult> {
  const violations: SourceScanViolation[] = [];
  const tables: SchemaTableInfo[] = [];

  const modulesDir = join(rootDir, "src", "modules");
  const moduleDirs = existsSync(modulesDir)
    ? readdirSync(modulesDir).filter((entry) => statSync(join(modulesDir, entry)).isDirectory())
    : [];

  for (const mod of moduleDirs) {
    const schemaFile = join(modulesDir, mod, "schema.ts");
    if (!existsSync(schemaFile)) continue;

    const relPath = relative(rootDir, schemaFile).replace(/\\/g, "/");
    const content = readFileSync(schemaFile, "utf8");
    const code = blankComments(content);
    const callCount = (code.match(TABLE_BUILDER_CALL) ?? []).length;

    if (TABLE_CREATOR_USE.test(code)) {
      violations.push({
        file: relPath,
        reason: "uses pgTableCreator — the gate cannot count tables built through a creator; declare each table with pgTable",
      });
    }

    const moduleExports: Record<string, unknown> = await import(pathToFileURL(schemaFile).href);
    const exportedTables = new Set<PgTable>();
    for (const [name, value] of Object.entries(moduleExports)) {
      if (is(value, PgTable)) {
        exportedTables.add(value);
        continue;
      }
      // The out-of-schema scan below skips schema.ts files, so a schema.ts must not hand a way to
      // build tables on to other files: not a builder itself (`export { pgTable }`, `export * from
      // "drizzle-orm/pg-core"`, `export const t = pgTable`, whatever the syntax), not a pgSchema
      // object (its `.table()` builds tables), and not a wrapper function that calls pgTable.
      // Checked on the runtime values, so no spelling of the re-export escapes it. Enums are
      // callable too and are the one function-valued export allowed (Copilot review, PR #35).
      if (is(value, PgSchema) || (typeof value === "function" && !isPgEnum(value as never))) {
        violations.push({
          file: relPath,
          reason: `exports '${name}', which can build tables outside this file (a table builder, a pgSchema object or a function) — a schema.ts may export only tables, enums and plain values`,
        });
      }
    }

    if (exportedTables.size !== callCount) {
      violations.push({
        file: relPath,
        reason: `declares ${callCount} table-builder call(s) but exports ${exportedTables.size} PgTable value(s) — a table is defined without being exported (or a stray builder call was found)`,
      });
    }

    for (const table of exportedTables) {
      const described = describeTable(table);
      tables.push({ ...described, context: mod, file: relPath, pgTable: table });
    }
  }

  // A table builder used anywhere outside a module's own schema.ts. Keyed on the IMPORT, not the
  // call site, so a helper function, `pgTable.withRLS(`, an aliased import or `pgTable (` with a
  // space all still get caught. Paths are normalised `\` to `/` first — without that, every
  // schema.ts on Windows would read as "outside".
  for (const base of [join(rootDir, "src"), join(rootDir, "scripts")]) {
    if (!existsSync(base)) continue;
    const files = walk(base, (name) => /\.tsx?$/.test(name));

    for (const file of files) {
      const relPath = relative(rootDir, file).replace(/\\/g, "/");
      if (/^src\/modules\/[^/]+\/schema\.ts$/.test(relPath)) continue;

      const code = blankComments(readFileSync(file, "utf8"));
      if (TABLE_BUILDER_IMPORTS.some((re) => re.test(code))) {
        violations.push({
          file: relPath,
          reason: "imports or re-exports a Drizzle table builder (pgTable/pgTableCreator/pgSchema, or the whole of drizzle-orm/pg-core) outside a module's schema.ts",
        });
      }
    }
  }

  return { tables, violations };
}

// ---------------------------------------------------------------------------
// D3 — the inventory file's own shape.
// ---------------------------------------------------------------------------

export interface InventoryColumnEntry {
  category?: unknown;
  purpose?: unknown;
  legal_basis?: unknown;
  retention?: unknown;
  [key: string]: unknown;
}

export interface InventoryTableEntry {
  context?: unknown;
  columns?: Record<string, InventoryColumnEntry>;
  [key: string]: unknown;
}

export interface ParsedInventory {
  topLevelKeys: string[];
  tables: Record<string, InventoryTableEntry>;
}

// Shared with the live-schema test (tests/integration/schema/data-inventory-live.test.ts).
export function parseInventory(text: string): ParsedInventory {
  const doc = (parse(text) ?? {}) as Record<string, unknown>;
  const topLevelKeys = Object.keys(doc);
  const tables = (doc.tables ?? {}) as Record<string, InventoryTableEntry>;
  return { topLevelKeys, tables };
}

const CANONICAL_CATEGORIES = ["🔴", "🟠", "⚫", "⚙️"];
const PERSONAL_CATEGORIES = ["🔴", "🟠", "⚫"];
const ALLOWED_COLUMN_KEYS = ["category", "purpose", "legal_basis", "retention"];

// Strips U+FE0F (the emoji variation selector) so "⚙" and "⚙️" compare equal.
function stripVariationSelector(value: string): string {
  return value.replace(/\uFE0F/g, "");
}

export interface Violation {
  kind: string;
  table: string;
  column?: string;
  message: string;
}

// D2: the pure checker. Covers every rule in specs/tooling/data-inventory/spec.md's first four
// requirements. `tables` is the schema side from loadSchemaTables; `inventoryText` is the raw
// data-inventory.yml content.
export function checkInventory(tables: SchemaTableInfo[], inventoryText: string): Violation[] {
  const violations: Violation[] = [];
  const { topLevelKeys, tables: inventoryTables } = parseInventory(inventoryText);

  for (const key of topLevelKeys) {
    if (key !== "tables") {
      violations.push({
        kind: "unknown-top-level-key",
        table: "",
        message: `data-inventory.yml has an unexpected top-level key '${key}' — only 'tables' is allowed`,
      });
    }
  }

  const schemaByTable = new Map<string, SchemaTableInfo>();
  for (const t of tables) schemaByTable.set(t.table, t);

  // Requirement: every declared column is in the inventory (+ table shape + context).
  for (const t of tables) {
    const inv = inventoryTables[t.table];
    if (!inv) {
      violations.push({
        kind: "undeclared-table",
        table: t.table,
        message: `table '${t.table}' (${t.file}) has no entry in data-inventory.yml`,
      });
      continue;
    }

    const hasContext = Object.hasOwn(inv, "context");
    const hasColumns = Object.hasOwn(inv, "columns");
    if (!hasContext || !hasColumns) {
      const missing = [!hasContext && "context", !hasColumns && "columns"].filter(Boolean).join(" and ");
      violations.push({
        kind: "invalid-table-shape",
        table: t.table,
        message: `table '${t.table}' entry is missing ${missing}`,
      });
      continue;
    }

    if (inv.context !== t.context) {
      violations.push({
        kind: "wrong-context",
        table: t.table,
        message: `table '${t.table}' declares context '${String(inv.context)}' but is defined in module '${t.context}'`,
      });
    }

    const invCols = inv.columns ?? {};
    for (const col of t.columns) {
      if (!Object.hasOwn(invCols, col)) {
        violations.push({
          kind: "undeclared-column",
          table: t.table,
          column: col,
          message: `column '${t.table}.${col}' has no entry in data-inventory.yml`,
        });
      }
    }
  }

  // Requirement: the inventory declares nothing that does not exist (stale tables/columns).
  for (const [tableName, inv] of Object.entries(inventoryTables)) {
    const schemaTable = schemaByTable.get(tableName);
    if (!schemaTable) {
      violations.push({
        kind: "stale-table",
        table: tableName,
        message: `data-inventory.yml declares table '${tableName}' which no schema.ts declares`,
      });
      continue;
    }

    const invCols = (inv.columns ?? {}) as Record<string, InventoryColumnEntry>;
    for (const col of Object.keys(invCols)) {
      if (!schemaTable.columns.includes(col)) {
        violations.push({
          kind: "stale-column",
          table: tableName,
          column: col,
          message: `data-inventory.yml declares column '${tableName}.${col}' which schema.ts does not declare`,
        });
      }
    }
  }

  // Requirement: each entry carries a valid category and, for personal data, its full declaration.
  for (const [tableName, inv] of Object.entries(inventoryTables)) {
    const invCols = (inv.columns ?? {}) as Record<string, InventoryColumnEntry>;
    for (const [col, entry] of Object.entries(invCols)) {
      if (entry == null || typeof entry !== "object") {
        violations.push({
          kind: "invalid-entry",
          table: tableName,
          column: col,
          message: `entry '${tableName}.${col}' is not a mapping`,
        });
        continue;
      }

      for (const key of Object.keys(entry)) {
        if (!ALLOWED_COLUMN_KEYS.includes(key)) {
          violations.push({
            kind: "unknown-key",
            table: tableName,
            column: col,
            message: `entry '${tableName}.${col}' has an unknown key '${key}' — allowed keys are ${ALLOWED_COLUMN_KEYS.join(", ")}`,
          });
        }
      }

      const rawCategory = entry.category;
      const normalisedCategory = typeof rawCategory === "string" ? stripVariationSelector(rawCategory) : null;
      const canonicalStripped = CANONICAL_CATEGORIES.map(stripVariationSelector);

      if (normalisedCategory === null || !canonicalStripped.includes(normalisedCategory)) {
        violations.push({
          kind: "invalid-category",
          table: tableName,
          column: col,
          message: `entry '${tableName}.${col}' has an invalid category '${String(rawCategory)}' — must be one of ${CANONICAL_CATEGORIES.join(", ")}`,
        });
        continue;
      }

      if (PERSONAL_CATEGORIES.map(stripVariationSelector).includes(normalisedCategory)) {
        for (const requiredKey of ["purpose", "legal_basis", "retention"] as const) {
          const value = entry[requiredKey];
          if (typeof value !== "string" || value.trim() === "") {
            violations.push({
              kind: "missing-key",
              table: tableName,
              column: col,
              message: `entry '${tableName}.${col}' is categorised ${String(rawCategory)} and has no non-empty '${requiredKey}'`,
            });
          }
        }
      }
    }
  }

  // Requirement: no table or column is named for an Art.-9 category. Runs over schema.ts names
  // AND inventory keys, so a blocklisted name present only in the inventory still fails.
  const namesToCheck: Array<{ table: string; column?: string; name: string }> = [];
  for (const t of tables) {
    namesToCheck.push({ table: t.table, name: t.table });
    for (const col of t.columns) namesToCheck.push({ table: t.table, column: col, name: col });
  }
  for (const [tableName, inv] of Object.entries(inventoryTables)) {
    namesToCheck.push({ table: tableName, name: tableName });
    const invCols = (inv.columns ?? {}) as Record<string, unknown>;
    for (const col of Object.keys(invCols)) namesToCheck.push({ table: tableName, column: col, name: col });
  }

  const seenArt9 = new Set<string>();
  for (const { table, column, name } of namesToCheck) {
    const stem = matchArt9Term(name);
    if (!stem) continue;
    const dedupeKey = `${table}.${column ?? ""}:${stem}`;
    if (seenArt9.has(dedupeKey)) continue;
    seenArt9.add(dedupeKey);
    violations.push({
      kind: "art9",
      table,
      column,
      message: `${column ? `${table}.${column}` : table} matches the Art.-9 blocklist term '${stem}'`,
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const { tables, violations: sourceScanViolations } = await loadSchemaTables(rootDir);
  const inventoryText = readFileSync(join(rootDir, "data-inventory.yml"), "utf8");
  const checkerViolations = checkInventory(tables, inventoryText);

  const allViolations = [
    ...sourceScanViolations.map((v) => ({ kind: "source-scan", table: v.file, message: v.reason })),
    ...checkerViolations,
  ];

  if (allViolations.length > 0) {
    console.error("Data-inventory check (ADR-010, G-F1, G-F3) failed:");
    const byTable = new Map<string, Violation[]>();
    for (const v of allViolations) {
      const list = byTable.get(v.table) ?? [];
      list.push(v);
      byTable.set(v.table, list);
    }
    for (const [table, list] of byTable) {
      console.error(`  ${table || "(top level)"}:`);
      for (const v of list) console.error(`    [${v.kind}] ${v.message}`);
    }
    process.exit(1);
  }

  console.log("Data-inventory check: OK");
}

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
