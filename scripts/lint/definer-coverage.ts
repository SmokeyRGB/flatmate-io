// M3 (P1): every `SECURITY DEFINER` function runs PAST RLS and, for this project, several answer
// an unauthenticated caller (resolve_join_code/claim_join_code, resolve_account_household,
// record_join_attempt) — the #17 cross-household leak in resolve_join_code/claim_join_code (fixed
// in 0b07396) is exactly the shape this exists to catch earlier. Two requirements, both mechanical:
//   (a) the function's own definition sets `SET search_path` (an unset search_path on a SECURITY
//       DEFINER function is a well-known hijack vector — a caller-controlled search_path can make
//       the function resolve an unqualified name to an attacker's own object instead of the
//       intended one);
//   (b) the function's name is exercised by at least one real SQL call under
//       tests/integration/raw-sql/ — the G-C7 raw-SQL half, which is the only place a leak PAST
//       the TypeScript layer would ever be caught (a policy-layer test alone calls through the
//       app's own repository functions and would never notice a SECURITY DEFINER hole). A name
//       merely MENTIONED (e.g. in a comment, a test title, a plain string, or a bare JS call that
//       is never sent to Postgres) does not count — see stripJsComments and
//       extractSqlTemplateContents below. "Called by name" means called from inside an actual
//       sql`...` tagged template (PR #19 review: the old check matched `name(` anywhere in the
//       file, so a test's own title or a JS-only call could satisfy it without ever reaching SQL).
//
// "Latest definition of a name wins": drizzle/*.sql is scanned in file order (numeric prefix), and
// a later `DROP FUNCTION` with no following `CREATE FUNCTION` of the same name removes it from
// consideration — this project's migrations legitimately DROP-then-CREATE the same name within one
// file (drizzle/0015 widens resolve_join_code/claim_join_code this way), which must not be
// mistaken for removal.
//
// Each migration file is split into real top-level statements via splitSqlStatements
// (./sql-statements.ts, shared with migration-shape.ts) rather than matched with one big regex
// over the whole file. The old single regex tried to capture a CREATE FUNCTION's entire text —
// name, unbounded args, and body — in one shot: `\([^)]*\)` broke on a nested paren in an argument
// type (`numeric(10,2)`), and `[\s\S]*?\$\$\s*;` required the closing `$$` to be followed
// IMMEDIATELY by `;`, so a function with trailing attributes written AFTER its body (`$$ LANGUAGE
// sql SECURITY DEFINER SET search_path = public;`) either went undetected or bled into whatever
// came next in the file. Splitting into statements first sidesteps all three problems: each
// statement is already isolated at its own terminating `;`, with its dollar-quoted body emptied,
// so a lightweight "does this statement START with CREATE/DROP FUNCTION" check is enough, and
// SECURITY DEFINER / SET search_path are matched against that one statement's full text — which
// now always includes trailing attributes wherever they're written — never a neighbour's.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { splitSqlStatements } from "./sql-statements";

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

// An optional schema-qualified prefix (quoted or not) before a function name, e.g. `public.` or
// `"public".`, not captured — names are compared unqualified.
const OPTIONAL_SCHEMA_PREFIX = `(?:"?[a-zA-Z0-9_]+"?\\.)?`;
const CREATE_FUNCTION_HEAD_RE = new RegExp(
  `^CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${OPTIONAL_SCHEMA_PREFIX}"?([a-zA-Z0-9_]+)"?\\s*\\(`,
  "i",
);
const DROP_FUNCTION_HEAD_RE = new RegExp(
  `^DROP\\s+FUNCTION(?:\\s+IF\\s+EXISTS)?\\s+${OPTIONAL_SCHEMA_PREFIX}"?([a-zA-Z0-9_]+)"?\\s*\\(`,
  "i",
);

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

    // Statements are already in file order, and a DROP followed by a CREATE of the same name
    // (this project's re-create idiom) naturally lands on the CREATE — they're two separate
    // statements, processed in the order they appear.
    for (const statement of splitSqlStatements(content)) {
      const dropMatch = DROP_FUNCTION_HEAD_RE.exec(statement);
      if (dropMatch) {
        state.delete(dropMatch[1].toLowerCase());
        continue;
      }

      const createMatch = CREATE_FUNCTION_HEAD_RE.exec(statement);
      if (!createMatch) continue;
      const name = createMatch[1].toLowerCase();

      const hasSecurityDefiner = /SECURITY\s+DEFINER/i.test(statement);
      if (!hasSecurityDefiner) {
        // A plain (non-DEFINER) function redefinition removes any prior DEFINER state under this
        // name — this project has no such case today, but the state machine should be honest.
        state.delete(name);
        continue;
      }
      state.set(name, {
        hasSecurityDefiner: true,
        hasSearchPath: /SET\s+search_path/i.test(statement),
        file,
      });
    }
  }

  return state;
}

// Strips `//` line comments and `/* */` block comments from a TypeScript source. Not a full
// parser (same honesty tradeoff as this repo's other hand-written lints) — a `//` or `/*` inside a
// string literal would be mishandled, but no raw-sql test file does that today.
function stripJsComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// PR #19 review: the old check matched `name(` anywhere in a comment-stripped raw-sql test file —
// a test TITLE, a plain string, or a bare JS call (`covered_fn()`, never sent to Postgres) all
// satisfied it, none of which prove the function is actually exercised by SQL. "Called by name"
// must mean called from inside an actual `sql` tagged template (drizzle-orm's `sql` from
// "drizzle-orm", the only tag this project's raw-sql tests use), the literal text that becomes a
// real query. This walks the comment-stripped source once, extracts every sql`...`'s raw content,
// and returns it all joined — the ONLY text `checkDefinerCoverageLint` below searches for a call
// in. `${...}` interpolations inside a template are skipped (their own text is JS, not SQL, and
// per this lint's own examples may itself contain a nested template literal with its own
// backticks) — skipNestedTemplate/skipStringLiteral below walk past a nested template or string
// literal without treating its backtick/quote as the outer template's own closing character.
function skipStringLiteral(source: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    i++;
  }
  return i;
}

// `start` points at the opening backtick of a template literal nested inside a `${...}`
// expression. Recurses into ITS OWN `${...}` (which may itself nest a template/string) so a
// backtick or quote belonging to that inner expression is never mistaken for this template's own
// closing backtick.
function skipNestedTemplate(source: string, start: number): number {
  let i = start + 1;
  let depth = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (depth === 0) {
      if (ch === "`") return i + 1;
      if (ch === "$" && source[i + 1] === "{") {
        depth = 1;
        i += 2;
        continue;
      }
      i++;
    } else {
      if (ch === "{") {
        depth++;
        i++;
        continue;
      }
      if (ch === "}") {
        depth--;
        i++;
        continue;
      }
      if (ch === "`") {
        i = skipNestedTemplate(source, i);
        continue;
      }
      if (ch === '"' || ch === "'") {
        i = skipStringLiteral(source, i, ch);
        continue;
      }
      i++;
    }
  }
  return i;
}

function extractSqlTemplateContents(source: string): string {
  const parts: string[] = [];
  const tagRe = /\bsql`/g;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(source))) {
    let i = match.index + match[0].length;
    let depth = 0; // 0 = in the template's own raw text; >0 = inside a ${...} expression
    let out = "";

    while (i < source.length) {
      const ch = source[i];
      if (ch === "\\") {
        if (depth === 0) out += ch + (source[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (depth === 0) {
        if (ch === "`") {
          i++;
          break;
        }
        if (ch === "$" && source[i + 1] === "{") {
          depth = 1;
          i += 2;
          continue;
        }
        out += ch;
        i++;
      } else {
        if (ch === "{") {
          depth++;
          i++;
          continue;
        }
        if (ch === "}") {
          depth--;
          i++;
          continue;
        }
        if (ch === "`") {
          i = skipNestedTemplate(source, i);
          continue;
        }
        if (ch === '"' || ch === "'") {
          i = skipStringLiteral(source, i, ch);
          continue;
        }
        i++;
      }
    }

    tagRe.lastIndex = i;
    parts.push(out);
  }

  return parts.join("\n");
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
    const stripped = stripJsComments(readFileSync(join(rawSqlDir, file), "utf8"));
    combined += extractSqlTemplateContents(stripped) + "\n";
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
    // The name followed by an actual call — optional whitespace, then `(` — not merely mentioned
    // in a comment (comments are already stripped from rawSqlSource above) or in prose.
    const calledRe = new RegExp(`\\b${name}\\s*\\(`);
    if (!calledRe.test(rawSqlSource)) {
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
