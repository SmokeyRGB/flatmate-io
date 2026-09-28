// ADR-010 ("der Check vergleicht das eingeführte Schema gegen die Datei"). This is the OTHER half
// of the data-inventory gate: scripts/lint/data-inventory.ts checks schema.ts against
// data-inventory.yml, but a hand-written migration can add a column that never touches schema.ts
// at all. This test queries the MIGRATED database directly (pg_catalog, not information_schema —
// information_schema shows only columns the current role holds a privilege on; app_runtime holds
// privileges on every public table today via scripts/db/bootstrap-roles.sql, so both would work
// today, but pg_catalog stays correct even if a future REVOKE narrows that, and every role can
// read it) and fails when the database declares a table or column in `public` that the inventory
// does not.
//
// One direction only: a declared column the database LACKS is not a failure here. A branch can
// legitimately be ahead of the database it's testing against (its own migration and inventory
// entry landed first) — the static lint already covers the opposite direction against schema.ts,
// and CI's `verify` job builds its database from drizzle/ alone, so that job's run of this test is
// exact regardless.
//
// Views are excluded on purpose: `casting_round_admin_view` (drizzle/0008) projects declared
// columns and holds no data of its own, so relkind is restricted to 'r' (ordinary table) and 'p'
// (partitioned table). Partition children (relispartition) are excluded too, so they don't read
// as undeclared tables in their own right — there are none today, but the exclusion costs nothing.
//
// Non-`public` schemas are NOT covered: every application table lives in `public` today. A future
// schema would need this test extended.
//
// Strict on a database built from the repository alone; a WARNING on any other host (design.md
// D5). The pre-mortem found that a strict failure on the shared `flatmate-io-dev` database would
// block every other branch's `pre-push` from the moment one branch's migration lands on dev until
// that branch merges — no rebase fixes it, since the entries sit on the other branch's own
// migration. So: `localhost`/`127.0.0.1`/`::1` (CI's `verify` job, a local stack) fails on any
// finding; any other host (a local run against hosted dev, the pre-push hook, or CI's
// `verify-hosted`) only warns, prefixed `data-inventory live check:`. CI's `verify` job then
// enforces the same findings strictly on every pull request, so the warning being ignored on dev
// costs at most a delay to PR time, never a silent gap.
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { loadSchemaTables, matchArt9Term, parseInventory } from "../../../scripts/lint/data-inventory";

function isLocalDatabase(): boolean {
  const url = new URL(process.env.DATABASE_URL!);
  // WHATWG URL keeps the brackets on an IPv6 hostname: `postgres://…@[::1]:5432` → "[::1]".
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}

interface CatalogColumn {
  table: string;
  column: string;
}

async function readCatalogColumns(): Promise<CatalogColumn[]> {
  const rows = await db.execute<{ table_name: string; column_name: string }>(sql`
    SELECT c.relname AS table_name, a.attname AS column_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    WHERE c.relkind IN ('r', 'p')
      AND NOT c.relispartition
      AND n.nspname = 'public'
      AND a.attnum > 0
      AND NOT a.attisdropped
  `);
  return rows.map((r) => ({ table: r.table_name, column: r.column_name }));
}

describe("data-inventory live check (ADR-010, design.md D5)", () => {
  it("every catalog (table, column) in public is declared, and no catalog name matches the Art.-9 blocklist", async () => {
    const catalogColumns = await readCatalogColumns();
    // Non-vacuous, part 1: the query itself must have found rows, or every assertion below would
    // pass on an empty result for the wrong reason.
    expect(catalogColumns.length).toBeGreaterThan(0);

    // Non-vacuous, part 2 (task 5.1): on a repository-built database the catalog's table set must
    // be a SUPERSET of loadSchemaTables' (not a hard-coded 13, so a new table is checked the
    // moment it exists in both places). On the shared hosted database a branch may legitimately
    // declare a table its unapplied migration hasn't created yet — the same "branch ahead" case
    // the one-directional rule above allows — so there it only has to share at least one table
    // with schema.ts, which still proves the query is reading this project's schema.
    const { tables: schemaTables } = await loadSchemaTables(process.cwd());
    const catalogTableNames = new Set(catalogColumns.map((c) => c.table));
    const missingFromCatalog = schemaTables.filter((t) => !catalogTableNames.has(t.table)).map((t) => t.table);
    if (isLocalDatabase()) {
      expect(missingFromCatalog, "catalog is missing schema.ts tables").toEqual([]);
    } else {
      expect(missingFromCatalog.length).toBeLessThan(schemaTables.length);
    }

    const inventoryText = readFileSync(join(process.cwd(), "data-inventory.yml"), "utf8");
    const { tables: inventoryTables } = parseInventory(inventoryText);

    const undeclared: string[] = [];
    const art9: string[] = [];
    const art9SeenTables = new Set<string>();

    for (const { table, column } of catalogColumns) {
      const declaredTable = inventoryTables[table];
      const declaredColumns = (declaredTable?.columns ?? {}) as Record<string, unknown>;
      if (!declaredTable || !Object.hasOwn(declaredColumns, column)) {
        undeclared.push(`${table}.${column}`);
      }

      if (!art9SeenTables.has(table) && matchArt9Term(table)) {
        art9.push(table);
        art9SeenTables.add(table);
      }
      if (matchArt9Term(column)) {
        art9.push(`${table}.${column}`);
      }
    }

    const findings = [
      ...undeclared.map((name) => `undeclared column: ${name}`),
      ...art9.map((name) => `Art.-9 blocklist match: ${name}`),
    ];

    if (isLocalDatabase()) {
      expect(findings, findings.join("\n")).toEqual([]);
    } else if (findings.length > 0) {
      console.warn(
        `data-inventory live check: ${findings.length} finding(s) against a non-local database ` +
          `(${new URL(process.env.DATABASE_URL!).hostname}) — the branch may be behind the ` +
          `database's migrations, or the database ahead of this branch:\n  ${findings.join("\n  ")}`,
      );
    }
  });
});
