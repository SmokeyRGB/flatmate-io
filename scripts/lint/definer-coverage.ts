// M3 (P1): every `SECURITY DEFINER` function runs PAST RLS and, for this project, several answer
// an unauthenticated caller (resolve_join_code/claim_join_code, resolve_account_household,
// record_join_attempt) — the #17 cross-household leak in resolve_join_code/claim_join_code (fixed
// in 0b07396) is exactly the shape this exists to catch earlier. Two requirements, both mechanical:
//   (a) the function's own definition sets `SET search_path` (an unset search_path on a SECURITY
//       DEFINER function is a well-known hijack vector — a caller-controlled search_path can make
//       the function resolve an unqualified name to an attacker's own object instead of the
//       intended one);
//   (b) the function's name is exercised by at least one test under tests/integration/raw-sql/ —
//       the G-C7 raw-SQL half, which is the only place a leak PAST the TypeScript layer would ever
//       be caught (a policy-layer test alone calls through the app's own repository functions and
//       would never notice a SECURITY DEFINER hole).
//
// "Latest definition of a name wins": drizzle/*.sql is scanned in file order (numeric prefix), and
// a later `DROP FUNCTION` with no following `CREATE FUNCTION` of the same name removes it from
// consideration — this project's migrations legitimately DROP-then-CREATE the same name within one
// file (drizzle/0015 widens resolve_join_code/claim_join_code this way), which must not be
// mistaken for removal.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface DefinerViolation {
  functionName: string;
  file: string;
  rule: "missing-search-path" | "missing-raw-sql-test";
}

interface DefinerState {
  hasSecurityDefiner: boolean;
  hasSearchPath: boolean;
  file: string;
}

const CREATE_FUNCTION_RE =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+"?(\w+)"?\s*\([^)]*\)[\s\S]*?\$\$\s*;/gi;
const DROP_FUNCTION_RE = /DROP\s+FUNCTION(?:\s+IF\s+EXISTS)?\s+"?(\w+)"?\s*\([^)]*\)\s*;/gi;

function migrationFiles(drizzleDir: string): string[] {
  return readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // numeric prefixes (0000_, 0001_, ...) sort correctly as plain strings
}

// Walks drizzle/*.sql in migration order and returns the CURRENT state of every
// `SECURITY DEFINER` function — i.e. as of the latest statement that defined or dropped it.
function collectDefinerFunctions(drizzleDir: string): Map<string, DefinerState> {
  const state = new Map<string, DefinerState>();

  for (const file of migrationFiles(drizzleDir)) {
    const content = readFileSync(join(drizzleDir, file), "utf8");

    type Event = { index: number; kind: "create" | "drop"; name: string; chunk: string };
    const events: Event[] = [];

    for (const m of content.matchAll(CREATE_FUNCTION_RE)) {
      events.push({ index: m.index!, kind: "create", name: m[1], chunk: m[0] });
    }
    for (const m of content.matchAll(DROP_FUNCTION_RE)) {
      events.push({ index: m.index!, kind: "drop", name: m[1], chunk: m[0] });
    }
    // Process in the order they appear in the file — a DROP immediately followed by a CREATE of
    // the same name (this project's re-create idiom) must land on the CREATE, not the DROP.
    events.sort((a, b) => a.index - b.index);

    for (const event of events) {
      if (event.kind === "drop") {
        state.delete(event.name);
        continue;
      }
      const hasSecurityDefiner = /SECURITY\s+DEFINER/i.test(event.chunk);
      if (!hasSecurityDefiner) {
        // A plain (non-DEFINER) function redefinition removes any prior DEFINER state under this
        // name — this project has no such case today, but the state machine should be honest.
        state.delete(event.name);
        continue;
      }
      state.set(event.name, {
        hasSecurityDefiner: true,
        hasSearchPath: /SET\s+search_path/i.test(event.chunk),
        file,
      });
    }
  }

  return state;
}

function rawSqlTestSources(rawSqlDir: string): string {
  let combined = "";
  let files: string[] = [];
  try {
    files = readdirSync(rawSqlDir).filter((f) => f.endsWith(".ts"));
  } catch {
    return combined;
  }
  for (const file of files) {
    combined += readFileSync(join(rawSqlDir, file), "utf8") + "\n";
  }
  return combined;
}

export function checkDefinerCoverageLint(rootDir: string): DefinerViolation[] {
  const drizzleDir = join(rootDir, "drizzle");
  const rawSqlDir = join(rootDir, "tests", "integration", "raw-sql");
  const violations: DefinerViolation[] = [];

  const definerFunctions = collectDefinerFunctions(drizzleDir);
  const rawSqlSource = rawSqlTestSources(rawSqlDir);

  for (const [name, info] of definerFunctions) {
    if (!info.hasSearchPath) {
      violations.push({ functionName: name, file: info.file, rule: "missing-search-path" });
    }
    // Word-boundary match on the bare function name — good enough given SQL identifiers here
    // don't collide with unrelated substrings (checked against this project's current raw-sql
    // test file names/content).
    const nameRe = new RegExp(`\\b${name}\\b`);
    if (!nameRe.test(rawSqlSource)) {
      violations.push({ functionName: name, file: info.file, rule: "missing-raw-sql-test" });
    }
  }

  return violations;
}

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const violations = checkDefinerCoverageLint(process.cwd());
  if (violations.length > 0) {
    console.error("SECURITY DEFINER coverage lint (M3/P1) failed:");
    for (const v of violations) console.error(`  ${v.functionName} (${v.file}) [${v.rule}]`);
    process.exit(1);
  }
  console.log("SECURITY DEFINER coverage lint: OK");
}
