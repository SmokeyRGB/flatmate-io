// FR-0.4 / G-C8: a bare `SET` (without `LOCAL`) is never allowed, and `SET LOCAL`/`set_config` for
// the session context is only allowed in src/db/session-context.ts (FR-0.3's one transaction
// helper).
//
// loading-feedback design.md D9 (revised after the pre-mortem): fixes the whole class of bypass,
// not just the literal `SET LOCAL … =` shape the original rules matched:
//   - `set_config(...)` is now recognised at all (previously invisible to this lint entirely);
//   - `SET SESSION …`, `SET … TO` and `SET LOCAL … TO` are now findings, same as `SET … =`;
//   - `drizzle/*.sql` is scanned too, so a SECURITY DEFINER function can't set a session-wide
//     value unnoticed.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

export interface LintViolation {
  file: string;
  line: number;
  rule:
    | "bare-set"
    | "set-local-outside-session-context"
    | "set-config-outside-session-context"
    | "set-config-not-local";
  text: string;
}

const SESSION_CONTEXT_FILE = "src/db/session-context.ts";

function walk(dir: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, pattern));
    } else if (pattern.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// `SET`, optionally `LOCAL` or `SESSION`, a namespaced identifier (`app.household_id` — every
// real GUC this codebase sets is namespaced this way), then `=` or `TO` — case-insensitive,
// covering every bypass the pre-mortem found: `SET SESSION x = …`, `SET x TO …`,
// `SET LOCAL x TO …`, on top of the original `SET LOCAL x = …` / `SET x = …`. Requiring a dot in
// the identifier (rather than any `\w+`) keeps this from matching ordinary English prose like
// "…the callback's own last statement set it to `true`…" (a real false positive this fix hit).
const SET_RE = /\bSET\s+(LOCAL|SESSION)?\s*"?\w+"?\."?\w+"?\s*(?:=|\bTO\b)/gi;

// `set_config(...)`, case-insensitive, tolerating optional quotes and whitespace around the name
// (`"set_config"(...)`) — matches even a call whose argument list spans multiple lines (`[^)]*`
// includes newlines), which is exactly the multi-line case D9 wants to fail closed.
const SET_CONFIG_RE = /"?set_config"?\s*\(([^)]*)\)/gi;

function checkSetStatements(lines: string[], relPath: string, violations: LintViolation[]): void {
  lines.forEach((line, idx) => {
    SET_RE.lastIndex = 0;
    const match = SET_RE.exec(line);
    if (!match) return;
    const modifier = (match[1] ?? "").toUpperCase();
    if (modifier === "LOCAL") {
      if (relPath !== SESSION_CONTEXT_FILE) {
        violations.push({
          file: relPath,
          line: idx + 1,
          rule: "set-local-outside-session-context",
          text: line.trim(),
        });
      }
      return;
    }
    // No modifier, or SESSION — always a finding (bare-set), same treatment as the original
    // `SET x = …` rule, now also catching `SET SESSION …` and `SET x TO …`.
    violations.push({ file: relPath, line: idx + 1, rule: "bare-set", text: line.trim() });
  });
}

function checkSetConfigCalls(
  content: string,
  relPath: string,
  violations: LintViolation[],
  opts: { enforceLocation: boolean },
): void {
  SET_CONFIG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SET_CONFIG_RE.exec(content)) !== null) {
    const line = content.slice(0, match.index).split("\n").length;
    const argsText = match[1];
    const isMultiline = argsText.includes("\n");
    // A literal `true` as the third (is_local) argument, at the very end — anything else (a
    // variable, `false`, or a call whose args span multiple lines) fails closed.
    const endsWithLiteralTrue = /,\s*true\s*$/.test(argsText.trimEnd());

    if (opts.enforceLocation && relPath !== SESSION_CONTEXT_FILE) {
      violations.push({
        file: relPath,
        line,
        rule: "set-config-outside-session-context",
        text: match[0].split("\n")[0].trim(),
      });
      continue;
    }
    if (isMultiline || !endsWithLiteralTrue) {
      violations.push({
        file: relPath,
        line,
        rule: "set-config-not-local",
        text: match[0].split("\n")[0].trim(),
      });
    }
  }
}

export function checkSessionContextLint(rootDir: string): LintViolation[] {
  const srcDir = join(rootDir, "src");
  const violations: LintViolation[] = [];

  const srcFiles = existsSync(srcDir) ? walk(srcDir, /\.(ts|tsx)$/) : [];
  for (const file of srcFiles) {
    const relPath = relative(rootDir, file).replace(/\\/g, "/");
    const content = readFileSync(file, "utf8");
    checkSetStatements(content.split("\n"), relPath, violations);
    checkSetConfigCalls(content, relPath, violations, { enforceLocation: true });
  }

  const drizzleDir = join(rootDir, "drizzle");
  if (existsSync(drizzleDir)) {
    for (const file of walk(drizzleDir, /\.sql$/)) {
      const relPath = relative(rootDir, file).replace(/\\/g, "/");
      const content = readFileSync(file, "utf8");
      // drizzle/*.sql is scanned for a non-local set_config only — it is not src/db/…, so the
      // outside-session-context rule would fire on every legitimate use; only "not local" matters
      // here (a SECURITY DEFINER function setting a session-wide value unnoticed).
      checkSetConfigCalls(content, relPath, violations, { enforceLocation: false });
    }
  }

  return violations;
}

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const violations = checkSessionContextLint(process.cwd());
  if (violations.length > 0) {
    console.error("Session-context lint (FR-0.4/G-C8) failed:");
    for (const v of violations) console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.text}`);
    process.exit(1);
  }
  console.log("Session-context lint: OK");
}
