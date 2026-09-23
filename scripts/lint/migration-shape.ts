// P5 / pr-review-lessons-countermeasures.md M4: repo- and harness-specific migration mechanics
// that cost a production migration abort and a half-applied dev database (drizzle/0013-0017).
// Checks only drizzle/*.sql files numbered AFTER 0017 — files up to and including 0017 are
// already-applied history, not something a lint should retroactively flag.
//
// Rules, each independent:
//   1. A file containing `ALTER TYPE ... ADD VALUE` contains no other SQL statement — Postgres
//      rejects using a new enum value in the same transaction that added it (drizzle/0016/0017).
//   2. Every `ADD COLUMN` carries `IF NOT EXISTS` — the agent harness refuses some statements
//      mid-file, and a human re-runs the WHOLE file afterwards (drizzle/0014/0015).
//   3. Every `CREATE FUNCTION` / `CREATE OR REPLACE FUNCTION` whose definition has
//      `RETURNS TABLE` must be preceded, earlier in the same file, by
//      `DROP FUNCTION IF EXISTS <same name>` — `CREATE OR REPLACE` cannot change a RETURNS TABLE
//      shape (drizzle/0015's header). A bare `CREATE FUNCTION` (no OR REPLACE), of any return
//      shape, also needs a preceding DROP FUNCTION IF EXISTS of the same name, so the file stays
//      re-runnable after a partial apply.
//   4. A function declared `SECURITY DEFINER` also declares `SET search_path`.
//
// Statements are split on drizzle-kit's own `--> statement-breakpoint` markers (each generated
// statement gets one), not on semicolons — a function body is itself full of semicolons and
// comments inside its `$$ ... $$` body, and drizzle-kit already emits one breakpoint per real
// top-level statement, so splitting there sidesteps parsing SQL properly.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface MigrationShapeViolation {
  file: string;
  rule: 1 | 2 | 3 | 4;
  reason: string;
}

// Files numbered 17 and below are applied history (drizzle/0000-0017 exist today); the cutoff is
// hard-coded rather than derived, since "already applied" is a fact about the real database, not
// something this lint can discover from the file tree alone.
const CUTOFF = 17;

const STATEMENT_BREAKPOINT = /-->\s*statement-breakpoint/gi;
const FULL_LINE_COMMENT = /^\s*--.*$/gm;

function findMigrationFiles(drizzleDir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(drizzleDir);
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const entry of entries) {
    if (entry === "meta") continue; // drizzle/meta/ holds journal/snapshot JSON, never lint it.
    const full = join(drizzleDir, entry);
    if (statSync(full).isFile() && /\.sql$/.test(entry)) out.push(full);
  }
  return out;
}

function migrationNumber(fileName: string): number | null {
  const m = /^(\d+)_/.exec(fileName);
  return m ? parseInt(m[1], 10) : null;
}

/** Strips whole-line `--` comments and returns the non-blank statement segments, in file order. */
function splitStatements(content: string): string[] {
  return content
    .split(STATEMENT_BREAKPOINT)
    .map((segment) => segment.replace(FULL_LINE_COMMENT, "").trim())
    .filter((segment) => segment.length > 0);
}

function checkFile(content: string): Array<{ rule: 1 | 2 | 3 | 4; reason: string }> {
  const violations: Array<{ rule: 1 | 2 | 3 | 4; reason: string }> = [];
  const statements = splitStatements(content);

  // Rule 1: a file with an ALTER TYPE ... ADD VALUE has that as its ONLY statement.
  const addsEnumValue = statements.some((s) => /ALTER\s+TYPE\s+[\s\S]*?ADD\s+VALUE/i.test(s));
  if (addsEnumValue && statements.length > 1) {
    violations.push({
      rule: 1,
      reason:
        "ALTER TYPE ... ADD VALUE must be the only statement in the file — Postgres rejects " +
        "using a new enum value in the transaction that added it",
    });
  }

  // Rule 2: every ADD COLUMN carries IF NOT EXISTS.
  for (const statement of statements) {
    const addColumnRe = /ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS\b)/gi;
    if (addColumnRe.test(statement)) {
      violations.push({
        rule: 2,
        reason: "ADD COLUMN without IF NOT EXISTS — the file must be safely re-runnable",
      });
    }
  }

  // Rule 3: a RETURNS TABLE function, or any bare (non-OR-REPLACE) CREATE FUNCTION, needs a
  // preceding DROP FUNCTION IF EXISTS of the same name earlier in the file.
  const priorDrops = new Set<string>();
  for (const statement of statements) {
    const dropMatch = /DROP\s+FUNCTION\s+IF\s+EXISTS\s+"?([a-zA-Z0-9_]+)"?\s*\(/i.exec(statement);
    if (dropMatch) priorDrops.add(dropMatch[1].toLowerCase());

    const createMatch =
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+"?([a-zA-Z0-9_]+)"?\s*\(/i.exec(statement);
    if (!createMatch) continue;

    const isOrReplace = Boolean(createMatch[1]);
    const name = createMatch[2].toLowerCase();
    const returnsTable = /RETURNS\s+TABLE/i.test(statement);
    const needsPriorDrop = returnsTable || !isOrReplace;

    if (needsPriorDrop && !priorDrops.has(name)) {
      violations.push({
        rule: 3,
        reason:
          `CREATE${isOrReplace ? " OR REPLACE" : ""} FUNCTION ${name}(...)` +
          `${returnsTable ? " (RETURNS TABLE)" : ""} has no preceding ` +
          `DROP FUNCTION IF EXISTS ${name} earlier in the file`,
      });
    }
  }

  // Rule 4: SECURITY DEFINER requires SET search_path.
  for (const statement of statements) {
    if (/SECURITY\s+DEFINER/i.test(statement) && !/SET\s+search_path/i.test(statement)) {
      violations.push({
        rule: 4,
        reason: "SECURITY DEFINER function has no SET search_path",
      });
    }
  }

  return violations;
}

export function checkMigrationShape(rootDir: string): MigrationShapeViolation[] {
  const drizzleDir = join(rootDir, "drizzle");
  const violations: MigrationShapeViolation[] = [];

  for (const file of findMigrationFiles(drizzleDir)) {
    const fileName = file.split(/[\\/]/).pop()!;
    const num = migrationNumber(fileName);
    if (num === null || num <= CUTOFF) continue;

    const relPath = relative(rootDir, file).replace(/\\/g, "/");
    const content = readFileSync(file, "utf8");
    for (const v of checkFile(content)) {
      violations.push({ file: relPath, rule: v.rule, reason: v.reason });
    }
  }

  return violations;
}

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const violations = checkMigrationShape(process.cwd());
  if (violations.length > 0) {
    console.error("Migration-shape check (P5) failed:");
    for (const v of violations) console.error(`  ${v.file} [rule ${v.rule}]: ${v.reason}`);
    process.exit(1);
  }
  console.log("Migration-shape check: OK");
}
