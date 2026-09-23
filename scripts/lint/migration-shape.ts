// P5 / pr-review-lessons-countermeasures.md M4: repo- and harness-specific migration mechanics
// that cost a production migration abort and a half-applied dev database (drizzle/0013-0017).
// Checks only drizzle/*.sql files numbered AFTER 0017 — files up to and including 0017 are
// already-applied history, not something a lint should retroactively flag.
//
// Rules, each independent:
//   1. A file containing `ALTER TYPE ... ADD VALUE` contains no other SQL statement — Postgres
//      rejects using a new enum value in the same transaction that added it (drizzle/0016/0017).
//   2. Every column-adding `ADD` on an `ALTER TABLE` carries `IF NOT EXISTS` — the agent harness
//      refuses some statements mid-file, and a human re-runs the WHOLE file afterwards
//      (drizzle/0014/0015). This covers both `ADD COLUMN ...` and the COLUMN-keyword-omitted form
//      `ADD <col> ...` Postgres also accepts; it does NOT flag `ADD CONSTRAINT`, `ADD PRIMARY
//      KEY`, `ADD UNIQUE`, `ADD CHECK`, `ADD FOREIGN KEY`, `ADD EXCLUDE`, or `ADD VALUE` (enum) —
//      none of those are column adds and none take `IF NOT EXISTS` the same way.
//   3. Every `CREATE FUNCTION` / `CREATE OR REPLACE FUNCTION` whose definition has
//      `RETURNS TABLE` must be preceded, earlier in the same file, by
//      `DROP FUNCTION IF EXISTS <same name>` — `CREATE OR REPLACE` cannot change a RETURNS TABLE
//      shape (drizzle/0015's header). A bare `CREATE FUNCTION` (no OR REPLACE), of any return
//      shape, also needs a preceding DROP FUNCTION IF EXISTS of the same name, so the file stays
//      re-runnable after a partial apply. Function names may be schema-qualified and/or quoted
//      (`public.f`, `"public"."f"`) — compared on the unqualified name.
//   4. A function declared `SECURITY DEFINER` also declares `SET search_path`.
//
// Statements are split with splitSqlStatements (./sql-statements.ts), not on drizzle-kit's own
// `--> statement-breakpoint` markers: hand-written migrations (drizzle/0005, 0016) carry no such
// markers, so a breakpoint-only split treats the WHOLE such file as one segment — rule 1 could
// never see more than one "statement" in it, and a CREATE FUNCTION spanning it could bleed into
// whatever followed. splitSqlStatements strips comments and dollar-quoted bodies and splits on
// real statement boundaries (`;`) instead, which works whether or not breakpoints are present.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { splitSqlStatements } from "./sql-statements";

export interface MigrationShapeViolation {
  file: string;
  rule: 1 | 2 | 3 | 4;
  reason: string;
}

// Files numbered 17 and below are applied history (drizzle/0000-0017 exist today); the cutoff is
// hard-coded rather than derived, since "already applied" is a fact about the real database, not
// something this lint can discover from the file tree alone.
const CUTOFF = 17;

// Matches a column-adding `ADD` (optionally spelled `ADD COLUMN`) NOT followed by `IF NOT
// EXISTS`, and excludes the other `ADD <keyword>` forms that aren't a column add at all and don't
// take `IF NOT EXISTS` the same way.
const ADD_RE = /\bADD\s+/gi;
// What may legitimately follow `ADD` (after stripping an optional `COLUMN` keyword) WITHOUT being
// a violation: the other `ADD <keyword>` forms, which aren't a column add at all and don't take
// `IF NOT EXISTS` the same way, or `IF NOT EXISTS` itself already present.
const ADD_TAIL_NOT_A_VIOLATION_RE =
  /^(CONSTRAINT\b|PRIMARY\s+KEY\b|UNIQUE\b|CHECK\b|FOREIGN\s+KEY\b|EXCLUDE\b|VALUE\b|IF\s+NOT\s+EXISTS\b)/i;
const LEADING_COLUMN_KEYWORD_RE = /^COLUMN\s+/i;

// Finds every `ADD` in the statement and inspects what follows it directly (imperative, not one
// giant regex with negative lookaheads after an optional group — that construction backtracks:
// when the lookaheads fail against `ADD COLUMN IF NOT EXISTS ...`, the engine retries by
// backtracking the optional `(?:COLUMN\s+)?` to zero width, and the lookaheads then pass against
// literal "COLUMN ...", producing a false negative).
function hasColumnAddWithoutIfNotExists(statement: string): boolean {
  for (const match of statement.matchAll(ADD_RE)) {
    let rest = statement.slice(match.index + match[0].length);
    const columnKeyword = LEADING_COLUMN_KEYWORD_RE.exec(rest);
    if (columnKeyword) rest = rest.slice(columnKeyword[0].length);
    if (ADD_TAIL_NOT_A_VIOLATION_RE.test(rest)) continue;
    return true; // a column add (`ADD COLUMN <col>` or bare `ADD <col>`) with no IF NOT EXISTS
  }
  return false;
}

// An optional schema-qualified prefix (quoted or not) before a function name, e.g. `public.` or
// `"public".`, not captured — rules 3/4 compare on the unqualified name only.
const OPTIONAL_SCHEMA_PREFIX = `(?:"?[a-zA-Z0-9_]+"?\\.)?`;
const DROP_FUNCTION_RE = new RegExp(
  `DROP\\s+FUNCTION\\s+IF\\s+EXISTS\\s+${OPTIONAL_SCHEMA_PREFIX}"?([a-zA-Z0-9_]+)"?\\s*\\(`,
  "gi",
);
const CREATE_FUNCTION_RE = new RegExp(
  `CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+${OPTIONAL_SCHEMA_PREFIX}"?([a-zA-Z0-9_]+)"?\\s*\\(`,
  "gi",
);

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

function checkFile(content: string): Array<{ rule: 1 | 2 | 3 | 4; reason: string }> {
  const violations: Array<{ rule: 1 | 2 | 3 | 4; reason: string }> = [];
  const statements = splitSqlStatements(content);

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

  // Rule 2: every column-adding ADD carries IF NOT EXISTS.
  for (const statement of statements) {
    if (hasColumnAddWithoutIfNotExists(statement)) {
      violations.push({
        rule: 2,
        reason: "ADD [COLUMN] without IF NOT EXISTS — the file must be safely re-runnable",
      });
    }
  }

  // Rule 3: a RETURNS TABLE function, or any bare (non-OR-REPLACE) CREATE FUNCTION, needs a
  // preceding DROP FUNCTION IF EXISTS of the same name earlier in the file. Matched with
  // matchAll (not a single exec) across every statement so more than one CREATE/DROP FUNCTION in
  // the file — or, in principle, in one statement — is each evaluated on its own, with its own
  // definition text, rather than only the first one found.
  const priorDrops = new Set<string>();
  for (const statement of statements) {
    for (const dropMatch of statement.matchAll(DROP_FUNCTION_RE)) {
      priorDrops.add(dropMatch[1].toLowerCase());
    }

    for (const createMatch of statement.matchAll(CREATE_FUNCTION_RE)) {
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
  }

  // Rule 4: SECURITY DEFINER requires SET search_path, checked against that statement's own full
  // text (signature, body placeholder, and any trailing attributes after the body) — never
  // another statement's.
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
