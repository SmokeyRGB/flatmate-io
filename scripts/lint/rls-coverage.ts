// FR-0.2 / EC-0.1 / EC-0.2 / Minimal-Gate item 5: every table carrying a household_id column
// must have at least one RLS policy. Found missing for ActivityEvent by /speckit-analyze
// (2026-09-16) — this generic check exists so that gap-by-omission can't happen silently again.
//
// Reads Drizzle's own table config (the same object drizzle-kit generates migrations from), not a
// regex over schema.ts. A table is flagged when it has a household_id column, zero policies, and
// its SQL name is not in ZERO_POLICY_EXEMPTIONS. The old source marker
// `// rls-coverage: zero-policy by design` is not read: no production table used it, and
// getTableConfig cannot see comments. Name a table in the list instead.
//
// An unexported pgTable() call is flagged too. getTableConfig cannot see it, so the lint cannot
// prove it has a policy. loadSchemaTables already rejects that shape; this check names the table
// when the call's SQL name is a string literal.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { loadSchemaTables } from "./data-inventory";
import { blankComments } from "./_shared";

export interface RlsCoverageViolation {
  file: string;
  table: string;
  reason: string;
}

/** SQL names of household_id tables that intentionally have zero policies. None today. */
export const ZERO_POLICY_EXEMPTIONS: readonly string[] = [];

export interface RlsTableInput {
  file: string;
  table: PgTable;
}

const NO_POLICY_REASON = "declares a household_id column but has no pgPolicy";
const UNEXPORTED_TABLE_REASON =
  "is not exported from its schema.ts, so its RLS policy cannot be read";

const TABLE_NAME_RE =
  /\bpgTable(?:\.withRLS)?\s*\(\s*["'`]([A-Za-z0-9_]+)["'`]|\.table\s*\(\s*["'`]([A-Za-z0-9_]+)["'`]/g;

export function checkRlsCoverageOfTables(
  tables: RlsTableInput[],
  exemptions: ReadonlySet<string> = new Set(ZERO_POLICY_EXEMPTIONS),
): RlsCoverageViolation[] {
  const violations: RlsCoverageViolation[] = [];
  for (const entry of tables) {
    const config = getTableConfig(entry.table);
    const hasHouseholdId = config.columns.some((column) => column.name === "household_id");
    if (hasHouseholdId && config.policies.length === 0 && !exemptions.has(config.name)) {
      violations.push({
        file: entry.file,
        table: config.name,
        reason: NO_POLICY_REASON,
      });
    }
  }
  return violations;
}

function declaredTableNames(source: string): string[] {
  const names: string[] = [];
  const code = blankComments(source);
  const re = new RegExp(TABLE_NAME_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    const name = match[1] ?? match[2];
    if (name) names.push(name);
  }
  return names;
}

export async function checkRlsCoverage(rootDir: string): Promise<RlsCoverageViolation[]> {
  const { tables, violations: sourceViolations } = await loadSchemaTables(rootDir);
  const violations = checkRlsCoverageOfTables(tables.map((entry) => ({ file: entry.file, table: entry.pgTable })));

  for (const sourceViolation of sourceViolations) {
    if (!sourceViolation.reason.includes("but exports")) continue;
    const exportedNames = new Set(tables.filter((entry) => entry.file === sourceViolation.file).map((entry) => entry.table));
    const missing = declaredTableNames(readFileSync(join(rootDir, sourceViolation.file), "utf8")).filter(
      (name) => !exportedNames.has(name),
    );
    if (missing.length === 0) {
      violations.push({
        file: sourceViolation.file,
        table: "(unexported)",
        reason: UNEXPORTED_TABLE_REASON,
      });
      continue;
    }
    for (const name of missing) {
      violations.push({ file: sourceViolation.file, table: name, reason: UNEXPORTED_TABLE_REASON });
    }
  }

  return violations;
}

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  checkRlsCoverage(process.cwd())
    .then((violations) => {
      if (violations.length > 0) {
        console.error("RLS-coverage check (FR-0.2/EC-0.1/EC-0.2) failed:");
        for (const v of violations) console.error(`  ${v.file} (table: ${v.table}): ${v.reason}`);
        process.exit(1);
      }
      console.log("RLS-coverage check: OK");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
