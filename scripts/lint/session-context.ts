// FR-0.4 / G-C8: a bare `SET` (without `LOCAL`) is never allowed, and `SET LOCAL` for the session
// context is only allowed in src/db/session-context.ts (FR-0.3's one transaction helper).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface LintViolation {
  file: string;
  line: number;
  rule: "bare-set" | "set-local-outside-session-context";
  text: string;
}

const SESSION_CONTEXT_FILE = "src/db/session-context.ts";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

export function checkSessionContextLint(rootDir: string): LintViolation[] {
  const srcDir = join(rootDir, "src");
  const violations: LintViolation[] = [];

  for (const file of walk(srcDir)) {
    const relPath = relative(rootDir, file).replace(/\\/g, "/");
    const lines = readFileSync(file, "utf8").split("\n");

    lines.forEach((line, idx) => {
      // Requires an "identifier =" shape after SET, so English prose ("may be set for...")
      // doesn't trip this — only something that reads like an actual SQL SET statement does.
      const isSetLocal = /\bSET\s+LOCAL\s+[\w."]+\s*=/i.test(line);
      const isBareSet = !isSetLocal && /\bSET\s+(?!LOCAL\b)[\w."]+\s*=/i.test(line);

      if (isSetLocal && relPath !== SESSION_CONTEXT_FILE) {
        violations.push({
          file: relPath,
          line: idx + 1,
          rule: "set-local-outside-session-context",
          text: line.trim(),
        });
      } else if (isBareSet) {
        violations.push({ file: relPath, line: idx + 1, rule: "bare-set", text: line.trim() });
      }
    });
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
