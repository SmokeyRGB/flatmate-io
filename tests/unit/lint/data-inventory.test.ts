// ADR-010 / G-F1 / G-F3 / FR-0.5/0.6/0.8 / AC-0.4 / C-3.13 / AC-3.12 (schema half). Each test
// states its own deliberate break in a comment — the input or rule inversion that must make it
// fail. The unit tests that exercise `loadSchemaTables` against real imports (4.1, 4.2, the art9
// real-tree sweep) run against the actual repository root, per design.md D2: a fixture schema.ts
// dropped in an arbitrary temp directory cannot resolve `drizzle-orm`. The source-scan fixtures
// (4.6) need no such import — they are pure text scans — so they use a temp directory nested
// under the repo root (so a dynamic import in the "exported/non-exported" fixture can still
// resolve drizzle-orm via ordinary node_modules lookup), cleaned up in `afterEach`.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pgTable, text, uuid, type PgTable } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkInventory,
  describeTable,
  loadSchemaTables,
  matchArt9Term,
  parseInventory,
  type SchemaTableInfo,
} from "../../../scripts/lint/data-inventory";

let fixtureDir: string;

function writeFixture(relPath: string, content: string): void {
  const full = join(fixtureDir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

afterEach(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

function tableInfo(table: PgTable, context: string, file = "test-fixture.ts"): SchemaTableInfo {
  return { ...describeTable(table), context, file };
}

// ---------------------------------------------------------------------------
// 4.1 — Loader against the real tree (the D2 falsification anchor).
// ---------------------------------------------------------------------------

const KNOWN_TABLES = [
  "account",
  "activity_event",
  "application",
  "casting_round",
  "household",
  "household_settings",
  "join_attempt",
  "join_code_issuance",
  "membership",
  "resident_profile",
  "room",
  "round_participation",
  "session",
];

describe("loadSchemaTables against the real repository", () => {
  // Break (executed by hand, see final report): temporarily filter out one module directory
  // (e.g. "identity") inside loadSchemaTables's moduleDirs computation — this test then finds
  // only 5 tables instead of 13 and fails. Without this test, a loader bug that silently returns
  // an empty (or partial) list would make every other check in this file vacuous.
  it("finds exactly the 13 known tables, with correct contexts, and no source-scan violations", async () => {
    const { tables, violations } = await loadSchemaTables(process.cwd());
    expect(violations).toEqual([]);
    expect(tables.map((t) => t.table).sort()).toEqual(KNOWN_TABLES);

    const byName = new Map(tables.map((t) => [t.table, t]));
    for (const t of ["application", "room", "casting_round", "round_participation"]) {
      expect(byName.get(t)?.context).toBe("casting");
    }
    expect(byName.get("activity_event")?.context).toBe("audit");
    for (const t of [
      "account",
      "session",
      "household",
      "household_settings",
      "join_code_issuance",
      "join_attempt",
      "resident_profile",
      "membership",
    ]) {
      expect(byName.get(t)?.context).toBe("identity");
    }
  });
});

// ---------------------------------------------------------------------------
// 4.2 — The real inventory passes.
// ---------------------------------------------------------------------------

describe("checkInventory against the real repository", () => {
  it("the real inventory has zero violations", async () => {
    const { tables } = await loadSchemaTables(process.cwd());
    const text = readFileSync(join(process.cwd(), "data-inventory.yml"), "utf8");
    expect(checkInventory(tables, text)).toEqual([]);
  });

  // Break: delete the join_code_issuance.purpose row from a COPY of the text (never the file on
  // disk) — exactly one violation, naming join_code_issuance.purpose.
  it("deleting the purpose row from a copy fails with exactly one violation naming it", async () => {
    const { tables } = await loadSchemaTables(process.cwd());
    const text = readFileSync(join(process.cwd(), "data-inventory.yml"), "utf8");
    const lines = text.split("\n");
    // Found by its key inside join_code_issuance's block, not by its wording: the classification
    // is still awaiting the human's confirmation and may change.
    const tableIdx = lines.findIndex((l) => l.trimEnd() === "  join_code_issuance:");
    const offset = lines.slice(tableIdx + 1).findIndex((l) => /^\s+purpose:\s*\{/.test(l));
    const idx = tableIdx === -1 || offset === -1 ? -1 : tableIdx + 1 + offset;
    expect(idx).toBeGreaterThan(-1); // sanity: the line we mean to delete actually exists
    const withoutPurpose = [...lines.slice(0, idx), ...lines.slice(idx + 1)].join("\n");

    const violations = checkInventory(tables, withoutPurpose);
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe("undeclared-column");
    expect(violations[0].table).toBe("join_code_issuance");
    expect(violations[0].column).toBe("purpose");
  });
});

// ---------------------------------------------------------------------------
// 4.3 — Undeclared column, undeclared table, stale column, stale table.
// ---------------------------------------------------------------------------

describe("checkInventory: undeclared and stale", () => {
  const widget = pgTable("widget", {
    id: uuid("id").primaryKey(),
    name: text("name"),
  });

  // Break: the schema declares `widget.name`, and the inventory doesn't — the undeclared-column
  // rule must fire.
  it("flags an undeclared column, naming table and column", () => {
    const info = tableInfo(widget, "casting");
    const yaml = `
tables:
  widget:
    context: casting
    columns:
      id: { category: "⚙️" }
`;
    const violations = checkInventory([info], yaml);
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe("undeclared-column");
    expect(violations[0].table).toBe("widget");
    expect(violations[0].column).toBe("name");
  });

  // Break: the schema declares table `widget`, the inventory declares no tables at all — the
  // undeclared-table rule must fire.
  it("flags an undeclared table, naming it", () => {
    const info = tableInfo(widget, "casting");
    const violations = checkInventory([info], "tables: {}\n");
    expect(violations.some((v) => v.kind === "undeclared-table" && v.table === "widget")).toBe(true);
  });

  // Break: the inventory declares column `extinct` on `widget`, which schema.ts does not — the
  // stale-column rule must fire, and only for that column (id and name are correctly declared).
  it("flags a stale column, naming table and column", () => {
    const info = tableInfo(widget, "casting");
    const yaml = `
tables:
  widget:
    context: casting
    columns:
      id: { category: "⚙️" }
      name: { category: "⚙️" }
      extinct: { category: "⚙️" }
`;
    const violations = checkInventory([info], yaml);
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe("stale-column");
    expect(violations[0].table).toBe("widget");
    expect(violations[0].column).toBe("extinct");
  });

  // Break: the inventory declares table `ghost`, which no schema.ts declares (the schema list is
  // empty here) — the stale-table rule must fire.
  it("flags a stale table, naming it", () => {
    const yaml = `
tables:
  ghost:
    context: casting
    columns:
      id: { category: "⚙️" }
`;
    const violations = checkInventory([], yaml);
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe("stale-table");
    expect(violations[0].table).toBe("ghost");
  });
});

// ---------------------------------------------------------------------------
// 4.4 — Entry shape.
// ---------------------------------------------------------------------------

describe("checkInventory: entry shape (D3)", () => {
  const widget = pgTable("widget", { field: uuid("field") });
  const info = () => tableInfo(widget, "casting");
  const yamlFor = (entry: string) => `
tables:
  widget:
    context: casting
    columns:
      field: ${entry}
`;

  // Break: 🔴 with purpose and retention but no legal_basis — the message must name the key.
  it("🔴 without legal_basis names the missing key", () => {
    const violations = checkInventory([info()], yamlFor('{ category: "🔴", purpose: "p", retention: "r" }'));
    expect(violations.some((v) => v.kind === "missing-key" && v.message.includes("legal_basis"))).toBe(true);
  });

  // Break: ⚫ with a retention that is only whitespace — trimmed-empty must still fail.
  it("⚫ with a retention that is empty after trim fails", () => {
    const violations = checkInventory(
      [info()],
      yamlFor('{ category: "⚫", purpose: "p", legal_basis: "b", retention: "   " }'),
    );
    expect(violations.some((v) => v.kind === "missing-key" && v.message.includes("retention"))).toBe(true);
  });

  // Break: a category outside the four canonical ones — the message must list all four.
  it("an unknown category lists all four allowed values", () => {
    const violations = checkInventory([info()], yamlFor('{ category: "🟢" }'));
    const v = violations.find((v) => v.kind === "invalid-category");
    expect(v).toBeTruthy();
    for (const cat of ["🔴", "🟠", "⚫", "⚙️"]) expect(v!.message).toContain(cat);
  });

  // Break: `legalbasis` instead of `legal_basis` — the message must name the misspelt key.
  it("a misspelt key names it", () => {
    const violations = checkInventory(
      [info()],
      yamlFor('{ category: "🔴", purpose: "p", legalbasis: "b", retention: "r" }'),
    );
    expect(violations.some((v) => v.kind === "unknown-key" && v.message.includes("legalbasis"))).toBe(true);
  });

  // Break: none — this asserts ACCEPTANCE. Inverting the category-normalisation (comparing raw
  // strings instead of stripping U+FE0F) makes this one fail instead.
  it("⚙ without the variation selector (U+FE0F) is accepted as ⚙️", () => {
    expect(checkInventory([info()], yamlFor('{ category: "⚙" }'))).toEqual([]);
  });

  it("⚙️ with only category is accepted", () => {
    expect(checkInventory([info()], yamlFor('{ category: "⚙️" }'))).toEqual([]);
  });

  it("⚙️ may also carry purpose, legal_basis and retention", () => {
    expect(
      checkInventory([info()], yamlFor('{ category: "⚙️", purpose: "p", legal_basis: "n/a", retention: "n/a" }')),
    ).toEqual([]);
  });

  // Break: the table's declared context ("identity") disagrees with the module that actually
  // defines it ("casting") — the message must contain BOTH.
  it("a wrong context names both the declared and the actual context", () => {
    const yaml = `
tables:
  widget:
    context: identity
    columns:
      field: { category: "⚙️" }
`;
    const violations = checkInventory([info()], yaml);
    const v = violations.find((v) => v.kind === "wrong-context");
    expect(v).toBeTruthy();
    expect(v!.message).toContain("identity");
    expect(v!.message).toContain("casting");
  });

  // Break: the table entry has neither `context` nor `columns` (or just one of them) — the
  // invalid-table-shape rule must fire either way.
  it("a table entry missing context or columns is flagged", () => {
    const noContext = checkInventory(
      [info()],
      `
tables:
  widget:
    columns:
      field: { category: "⚙️" }
`,
    );
    expect(noContext.some((v) => v.kind === "invalid-table-shape")).toBe(true);

    const noColumns = checkInventory(
      [info()],
      `
tables:
  widget:
    context: casting
`,
    );
    expect(noColumns.some((v) => v.kind === "invalid-table-shape")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4.5 — Art.-9 blocklist.
// ---------------------------------------------------------------------------

describe("matchArt9Term (D4)", () => {
  // ö written decomposed ("o" + combining diaeresis U+0308), to prove NFC-normalisation runs
  // before matching.
  const decomposedStaatsangehoerigkeit = "staatsangeh" + "ö" + "rigkeit";

  it.each<[string, string]>([
    ["health_notes", "health"],
    ["healthNotes", "health"],
    ["religion", "religio"],
    ["religions", "religio"],
    ["trade_union", "union"],
    ["marital_status", "marital"],
    ["konfession", "konfession"],
    ["gesundheit_info", "gesundheit"],
    ["gesundheitsdaten", "gesundheit"],
    [decomposedStaatsangehoerigkeit, "staatsangehörig"],
    ["familienstand", "familienstand"],
    ["disability_record", "disabilit"],
    ["disabilities", "disabilit"],
    // ASCII-only camelCase splitting missed a boundary after a non-ASCII lowercase letter ("ß").
    ["fußHealth", "health"],
  ])("%j matches the blocklist (stem %j)", (name, stem) => {
    expect(matchArt9Term(name)).toBe(stem);
  });

  // `disabled_at`/`disable_reason`: technical deactivation flags, not disability (the stem is
  // `disabilit`, not `disab`, for exactly this reason).
  it.each(["reunion_at", "origin_url", "household_id", "participation", "unique_key", "disabled_at", "disable_reason"])(
    "%j does not match the blocklist",
    (name) => {
      expect(matchArt9Term(name)).toBeNull();
    },
  );
});

describe("Art.-9 blocklist end-to-end via checkInventory", () => {
  // Break: `health_notes` is fully and correctly declared (category present) — the art9 rule
  // must still fire; completeness is not an exemption.
  it("a blocklisted column that is otherwise fully declared still fails", () => {
    const applicant = pgTable("applicant", { healthNotes: text("health_notes") });
    const info = tableInfo(applicant, "casting");
    const yaml = `
tables:
  applicant:
    context: casting
    columns:
      health_notes: { category: "⚙️" }
`;
    const violations = checkInventory([info], yaml);
    expect(
      violations.some((v) => v.kind === "art9" && v.table === "applicant" && v.column === "health_notes"),
    ).toBe(true);
  });

  // Break: `religion` exists ONLY as an inventory key (no matching schema table at all) — the
  // art9 rule must still fire, alongside the stale-table rule it also earns.
  it("a blocklisted key present only in the inventory fails too", () => {
    const yaml = `
tables:
  ghost:
    context: casting
    columns:
      religion: { category: "⚙️" }
`;
    const violations = checkInventory([], yaml);
    expect(violations.some((v) => v.kind === "art9" && v.table === "ghost" && v.column === "religion")).toBe(true);
    expect(violations.some((v) => v.kind === "stale-table")).toBe(true);
  });
});

describe("Art.-9 blocklist over the real tree", () => {
  it("matches nothing across every schema.ts name and every inventory name", async () => {
    const { tables } = await loadSchemaTables(process.cwd());
    const text = readFileSync(join(process.cwd(), "data-inventory.yml"), "utf8");
    const { tables: inventoryTables } = parseInventory(text);

    const names: string[] = [];
    for (const t of tables) {
      names.push(t.table, ...t.columns);
    }
    for (const [tableName, def] of Object.entries(inventoryTables)) {
      names.push(tableName, ...Object.keys(def.columns ?? {}));
    }

    const matches = names.filter((n) => matchArt9Term(n) !== null);
    expect(matches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4.6 — Source scans.
// ---------------------------------------------------------------------------

describe("loadSchemaTables: source scans (D1)", () => {
  // Break: an import of `pgTable` sitting in a helper file under a module directory, not in that
  // module's own schema.ts.
  it("flags a pgTable import in a non-schema.ts file under src/modules", async () => {
    fixtureDir = mkdtempSync(join(process.cwd(), "flatmate-data-inventory-fixture-"));
    writeFixture(
      "src/modules/x/helpers.ts",
      'import { pgTable } from "drizzle-orm/pg-core";\nexport const t = pgTable("t", {});\n',
    );
    const { violations } = await loadSchemaTables(fixtureDir);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe("src/modules/x/helpers.ts");
  });

  // Break: an aliased import (`pgTable as t`) in scripts/ — a call-site regex would miss this,
  // since the alias is never called by the name "pgTable".
  it("flags an aliased pgTable import in scripts/", async () => {
    fixtureDir = mkdtempSync(join(process.cwd(), "flatmate-data-inventory-fixture-"));
    writeFixture("scripts/foo.ts", 'import { pgTable as t } from "drizzle-orm/pg-core";\n');
    const { violations } = await loadSchemaTables(fixtureDir);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe("scripts/foo.ts");
  });

  // Break: a `pgSchema` import (not `pgTable`) outside a module's schema.ts.
  it("flags a pgSchema import in src/lib/", async () => {
    fixtureDir = mkdtempSync(join(process.cwd(), "flatmate-data-inventory-fixture-"));
    writeFixture("src/lib/y.ts", 'import { pgSchema } from "drizzle-orm/pg-core";\n');
    const { violations } = await loadSchemaTables(fixtureDir);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe("src/lib/y.ts");
  });

  // Break: a namespace import reaches every builder as `pg.pgTable(` without naming one in braces.
  it("flags a namespace import of drizzle-orm/pg-core in src/lib/", async () => {
    fixtureDir = mkdtempSync(join(process.cwd(), "flatmate-data-inventory-fixture-"));
    writeFixture("src/lib/ns.ts", 'import * as pg from "drizzle-orm/pg-core";\nexport const t = pg.pgTable("t", {});\n');
    const { violations } = await loadSchemaTables(fixtureDir);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe("src/lib/ns.ts");
  });

  // Break: `pgTableCreator` (a builder whose name only starts with "pgTable") from a subpath.
  it("flags a pgTableCreator import from a pg-core subpath", async () => {
    fixtureDir = mkdtempSync(join(process.cwd(), "flatmate-data-inventory-fixture-"));
    writeFixture("scripts/creator.ts", 'import { pgTableCreator } from "drizzle-orm/pg-core/table";\n');
    const { violations } = await loadSchemaTables(fixtureDir);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe("scripts/creator.ts");
  });

  // Break: a schema.ts declaring two pgTable(...) calls but exporting only one — the count
  // comparison must fire.
  it("flags a schema.ts with one exported and one non-exported pgTable", async () => {
    fixtureDir = mkdtempSync(join(process.cwd(), "flatmate-data-inventory-fixture-"));
    writeFixture(
      "src/modules/example/schema.ts",
      `
import { pgTable, uuid } from "drizzle-orm/pg-core";

export const exported = pgTable("exported", { id: uuid("id").primaryKey() });

const notExported = pgTable("not_exported", { id: uuid("id").primaryKey() });
`,
    );
    const { violations } = await loadSchemaTables(fixtureDir);
    expect(violations.some((v) => v.file === "src/modules/example/schema.ts")).toBe(true);
  });

  // Break: each of these hands a builder to a file outside schema.ts without a named import.
  it.each<[string, string]>([
    ["src/db/builders.ts", 'export { pgTable } from "drizzle-orm/pg-core";\n'],
    ["src/db/all.ts", 'export * from "drizzle-orm/pg-core";\n'],
    ["scripts/req.ts", 'const pg = require("drizzle-orm/pg-core");\n'],
    ["src/lib/dyn.ts", 'const pg = await import("drizzle-orm/pg-core");\n'],
  ])("flags %j (re-export, star re-export, require or dynamic import)", async (file, content) => {
    fixtureDir = mkdtempSync(join(process.cwd(), "flatmate-data-inventory-fixture-"));
    writeFixture(file, content);
    const { violations } = await loadSchemaTables(fixtureDir);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe(file);
  });

  // Not a violation: a named import of types/helpers only, as src/db/session-context.ts and
  // audit/repository.ts do today.
  it("does not flag an import of PgTable/getTableConfig only", async () => {
    fixtureDir = mkdtempSync(join(process.cwd(), "flatmate-data-inventory-fixture-"));
    writeFixture("src/db/types.ts", 'import { getTableConfig, PgTable } from "drizzle-orm/pg-core";\n');
    const { violations } = await loadSchemaTables(fixtureDir);
    expect(violations).toEqual([]);
  });

  // Break: a schema.ts building a table through pgTableCreator, which the call count can't follow.
  it("flags a schema.ts that uses pgTableCreator", async () => {
    fixtureDir = mkdtempSync(join(process.cwd(), "flatmate-data-inventory-fixture-"));
    writeFixture(
      "src/modules/example/schema.ts",
      `
import { pgTableCreator, uuid } from "drizzle-orm/pg-core";

const t = pgTableCreator((n) => n);
export const a = t("a", { id: uuid("id").primaryKey() });
`,
    );
    const { violations } = await loadSchemaTables(fixtureDir);
    expect(
      violations.some((v) => v.file === "src/modules/example/schema.ts" && /pgTableCreator/.test(v.reason)),
    ).toBe(true);
  });

  // Not a violation: `pgTable(` appearing only inside a comment.
  it("does not flag a pgTable( mentioned only in a comment", async () => {
    fixtureDir = mkdtempSync(join(process.cwd(), "flatmate-data-inventory-fixture-"));
    writeFixture(
      "src/modules/x/helpers.ts",
      '// a pgTable( call from "drizzle-orm/pg-core" would go here, but does not\nexport const x = 1;\n',
    );
    const { violations } = await loadSchemaTables(fixtureDir);
    expect(violations).toEqual([]);
  });

  // Not a violation: `export const b = a` aliases an already-exported table — deduplicated by
  // object identity, so the count comparison must still balance (1 call, 1 distinct table).
  it("does not flag a schema.ts with an aliased re-export of an exported table", async () => {
    fixtureDir = mkdtempSync(join(process.cwd(), "flatmate-data-inventory-fixture-"));
    writeFixture(
      "src/modules/example/schema.ts",
      `
import { pgTable, uuid } from "drizzle-orm/pg-core";

export const a = pgTable("a", { id: uuid("id").primaryKey() });
export const b = a;
`,
    );
    const { violations, tables } = await loadSchemaTables(fixtureDir);
    expect(violations).toEqual([]);
    expect(tables).toHaveLength(1);
  });

  // Not a violation: a correctly placed schema.ts. On this machine (Windows, core.autocrlf) this
  // already exercises the `\` -> `/` path normalisation every other test above relies on, since
  // node's `relative()` returns backslash-separated paths here.
  it("does not flag a correctly placed schema.ts", async () => {
    fixtureDir = mkdtempSync(join(process.cwd(), "flatmate-data-inventory-fixture-"));
    writeFixture(
      "src/modules/example/schema.ts",
      `
import { pgTable, uuid } from "drizzle-orm/pg-core";

export const a = pgTable("a", { id: uuid("id").primaryKey() });
`,
    );
    const { violations } = await loadSchemaTables(fixtureDir);
    expect(violations).toEqual([]);
  });
});
