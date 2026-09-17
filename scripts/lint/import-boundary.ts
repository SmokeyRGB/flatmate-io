// FR-0.1 / G-C1: no route, component, or job handler may import the raw Postgres/Drizzle client
// directly — only src/db/ itself and each module's own repository.ts may.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

export interface LintViolation {
  file: string;
  line: number;
  text: string;
}

const RAW_CLIENT_PATTERNS = [
  /from\s+["']postgres["']/,
  /from\s+["']drizzle-orm\/postgres-js["']/,
  /from\s+["'][^"']*\bdb\/client["']/,
];

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

export function checkImportBoundaryLint(rootDir: string): LintViolation[] {
  const srcDir = join(rootDir, "src");
  const violations: LintViolation[] = [];

  for (const file of walk(srcDir)) {
    const relPath = relative(rootDir, file).replace(/\\/g, "/");
    const isAllowed = relPath.startsWith("src/db/") || basename(file) === "repository.ts";
    if (isAllowed) continue;

    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, idx) => {
      if (RAW_CLIENT_PATTERNS.some((re) => re.test(line))) {
        violations.push({ file: relPath, line: idx + 1, text: line.trim() });
      }
    });
  }

  return violations;
}

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const violations = checkImportBoundaryLint(process.cwd());
  if (violations.length > 0) {
    console.error("Import-boundary lint (FR-0.1/G-C1) failed:");
    for (const v of violations) console.error(`  ${v.file}:${v.line} ${v.text}`);
    process.exit(1);
  }
  console.log("Import-boundary lint: OK");
}
