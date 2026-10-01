// FR-0.1 / G-C1: no route, component, or job handler may import the raw Postgres/Drizzle client
// directly — only src/db/ itself and each module's own repository.ts may. "Own" means
// src/modules/<name>/repository.ts: a nested helpers/repository.ts, or a repository.ts anywhere
// else, is not allowed.
//
// The scan runs on the comment-blanked file, not line by line, so import(), require(), a
// side-effect import and `export … from` are seen even when the specifier is on the next line.
// A whole-statement `import type` or `export type` is not a runtime import and is not flagged.
// An inline `import { type X }` is flagged: the statement is still an import from that module.
//
// This is not a full parser (same honesty tradeoff as the other lints). A computed specifier
// (`require(name)`, `import(mod)`) is not seen. A specifier written inside a string literal is
// still seen, because blanking comments does not remove strings. A regex literal is not recognised.
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { blankComments, lineOf, walk } from "./_shared";

export interface LintViolation {
  file: string;
  line: number;
  text: string;
}

// postgres and drizzle-orm/postgres-js, including a subpath, plus any specifier that ends in
// db/client (`@/db/client`, a relative path). The word boundary before `db` is the same one the
// previous line patterns used.
const RAW_SPEC = String.raw`(?:postgres(?:\/[^"']*)?|drizzle-orm\/postgres-js(?:\/[^"']*)?|[^"']*\bdb\/client)`;
const QUOTED_SPEC = String.raw`["'](${RAW_SPEC})["']`;

const FROM_RE = new RegExp(String.raw`\bfrom\s+${QUOTED_SPEC}`, "g");
const SIDE_EFFECT_RE = new RegExp(String.raw`\bimport\s+${QUOTED_SPEC}`, "g");
const DYNAMIC_RE = new RegExp(String.raw`\bimport\s*\(\s*${QUOTED_SPEC}`, "g");
const REQUIRE_RE = new RegExp(String.raw`\brequire\s*\(\s*${QUOTED_SPEC}`, "g");

const MODULE_REPOSITORY = /^src\/modules\/[^/]+\/repository\.ts$/;

function isAllowed(relPath: string): boolean {
  return relPath.startsWith("src/db/") || MODULE_REPOSITORY.test(relPath);
}

// True when the import/export that owns this `from` is a whole-statement type import
// (`import type … from`, `export type … from`). An inline `{ type X }` does not match.
function isTypeOnlyFrom(source: string, fromIndex: number): boolean {
  const before = source.slice(0, fromIndex);
  const keyword = /\b(?:import|export)\b/g;
  let last = -1;
  let match: RegExpExecArray | null;
  while ((match = keyword.exec(before)) !== null) last = match.index;
  if (last < 0) return false;
  return /^(?:import|export)\s+type\b/.test(before.slice(last).trimStart());
}

export function checkImportBoundaryLint(rootDir: string): LintViolation[] {
  const srcDir = join(rootDir, "src");
  const violations: LintViolation[] = [];

  for (const file of walk(srcDir, (name) => /\.(ts|tsx)$/.test(name))) {
    const relPath = relative(rootDir, file).replace(/\\/g, "/");
    if (isAllowed(relPath)) continue;

    const raw = readFileSync(file, "utf8");
    const code = blankComments(raw);
    const hits: Array<{ index: number }> = [];

    for (const re of [FROM_RE, SIDE_EFFECT_RE, DYNAMIC_RE, REQUIRE_RE]) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(code)) !== null) {
        if (re === FROM_RE && isTypeOnlyFrom(code, match.index)) continue;
        hits.push({ index: match.index });
      }
    }

    hits.sort((a, b) => a.index - b.index);
    const seen = new Set<number>();
    for (const hit of hits) {
      if (seen.has(hit.index)) continue;
      seen.add(hit.index);
      const line = lineOf(raw, hit.index);
      const text = raw.split(/\r?\n/)[line - 1]?.trim() ?? "";
      violations.push({ file: relPath, line, text });
    }
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
