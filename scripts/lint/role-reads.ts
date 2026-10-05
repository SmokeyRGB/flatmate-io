// role-permissions design D7 (F3 change 2b): a role comparison cannot return. Every identity
// authorization decision reads a STORED permission (`membershipHoldsPermission`), never the
// caller's role (human decision, 2026-10-01: "a critical error, not a code smell"). This tripwire
// refuses a comparison against a role in src/ outside a named state read.
//
// A match passes only when the same line or the line above carries a marker comment,
// `role-state-read: <reason>`, with a non-empty reason (a state read describes a MEMBER, e.g. the
// moderator badge on a listed row, not the caller's rights). Markers are found on the raw text;
// matches are taken after comments are blanked, so prose mentioning `role ===` is never flagged.
// src/modules/identity/schema.ts is exempt: it holds the CHECKs that pair roles with their
// permission sets. Role WRITES (`role: "member"`) match no pattern.
//
// A tripwire, not a proof: an aliased read (`const r = row.role; if (r === …)`) is not seen. The
// authorization matrix tests the behaviour; this keeps the obvious shape out.
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { blankComments, walk } from "./_shared";

export interface LintViolation {
  file: string;
  line: number;
  rule: "role-read-outside-state-read";
  text: string;
}

const SCHEMA_FILE = "src/modules/identity/schema.ts";

// `m.role === …`, `… !== row.role`, `eq(membership.role, …)`, SQL `role <> 'moderator'` /
// `role IN (…)` / `role = '…'`. They do not match `toRole`/`fromRole` (word boundary) or a write.
const ROLE_READ_PATTERNS: readonly RegExp[] = [
  /\brole\s*(===|!==|==|!=)/,
  /(===|!==|==|!=)\s*[\w?.]*\.role\b/,
  /\b(eq|ne|inArray|notInArray)\(\s*[\w.]*\.role\b/,
  /\brole\s*(=|<>|!=|IN\b)\s*['(]/,
  // code-review 2026-10-02: the cheap shapes the first four missed.
  /\bswitch\s*\([^)]*\.role\b/,
  /\.includes\(\s*[\w?.]*\.role\b/,
  /\brole\s*(=|<>|!=)\s*\$\{/,
];

const MARKER = /role-state-read:(.*)$/;

// A marker counts only with a non-empty reason after the colon (a JSX comment's closing `*\/}` and
// a block comment's `*\/` are not a reason).
export function markerHasReason(rawLine: string): boolean {
  const m = rawLine.match(MARKER);
  if (!m) return false;
  return m[1].replace(/\*\/|[{}]/g, "").trim().length > 0;
}

export function findRoleReads(source: string): { line: number; text: string }[] {
  const rawLines = source.split("\n");
  const codeLines = blankComments(source).split("\n");
  const findings: { line: number; text: string }[] = [];
  codeLines.forEach((code, i) => {
    if (!ROLE_READ_PATTERNS.some((re) => re.test(code))) return;
    const marked = markerHasReason(rawLines[i]) || (i > 0 && markerHasReason(rawLines[i - 1]));
    if (!marked) findings.push({ line: i + 1, text: rawLines[i].trim() });
  });
  return findings;
}

export function checkRoleReadsLint(rootDir: string): LintViolation[] {
  const srcDir = join(rootDir, "src");
  const violations: LintViolation[] = [];
  if (!existsSync(srcDir)) return violations;
  for (const file of walk(srcDir, (name) => /\.(ts|tsx)$/.test(name))) {
    const relPath = relative(rootDir, file).split("\\").join("/");
    if (relPath === SCHEMA_FILE) continue;
    for (const f of findRoleReads(readFileSync(file, "utf8").replace(/\r\n/g, "\n"))) {
      violations.push({ file: relPath, line: f.line, rule: "role-read-outside-state-read", text: f.text });
    }
  }
  return violations;
}

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const violations = checkRoleReadsLint(process.cwd());
  if (violations.length > 0) {
    console.error(`Role-reads lint (identity/member-administration) failed: ${violations.length} finding(s)`);
    for (const v of violations) console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.text}`);
    process.exit(1);
  }
  console.log("Role-reads lint: OK");
}
