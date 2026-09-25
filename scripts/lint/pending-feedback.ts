// loading-feedback design.md D6: holds every screen and form to `ui/pending-feedback`
// (specs/ui/pending-feedback/spec.md) mechanically, so an F3/F4 change can't quietly skip it.
// Two independent checks:
//   1. no plain submit button anywhere in src/ (except src/ui/submit-button.tsx itself);
//   2. every page.tsx under src/app/ has a sibling loading.tsx that imports @/ui/skeletons.
// Same hand-written-lint trade-off as the repo's other scripts/lint/*.ts: plain TypeScript over
// file contents, no parser — the regex approach can miss exotic JSX (e.g. a spread {...props}
// carrying `type`), stated and accepted, same as import-boundary.ts and session-context.ts.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export interface LintViolation {
  file: string;
  line: number;
  rule: "submit-button-not-shared" | "missing-loading" | "loading-missing-skeleton-import";
  text: string;
}

const SUBMIT_BUTTON_FILE = "src/ui/submit-button.tsx";

// The lint's short, named exemption list (D6) — a page that genuinely needs no loading state.
export const PAGE_LOADING_EXEMPTIONS: Record<string, string> = {
  "src/app/page.tsx": "redirects only, renders nothing",
};

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

// Strips `//` line comments, `/* … */` block comments (which also covers JSX's `{/* … */}` —
// removing the `/* … */` body leaves a harmless stray `{}` behind) before any button-tag or
// import match runs. Block comments are stripped first, so a `//` inside one isn't treated as its
// own line comment.
export function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutBlocks.replace(/\/\/.*$/gm, "");
}

export type ButtonTagFinding = { snippet: string; index: number };

// Reads every `<button` opening tag up to its closing `>`, ACROSS LINES (`[^>]*` already matches
// newlines, so a multi-line tag with `type` on a later line is still read whole — reading line by
// line would miss it, one of D6's stated breaks). A tag is a finding unless it carries a literal
// `type="button"` or `type="reset"`.
export function findButtonTagFindings(strippedSource: string): ButtonTagFinding[] {
  const findings: ButtonTagFinding[] = [];
  const tagRe = /<button\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(strippedSource)) !== null) {
    const attrs = match[1];
    const typeMatch = attrs.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/);
    if (!typeMatch) {
      findings.push({ snippet: match[0], index: match.index });
      continue;
    }
    if (typeMatch[3] !== undefined) {
      // type={…} — a non-literal type, always a finding regardless of its value.
      findings.push({ snippet: match[0], index: match.index });
      continue;
    }
    const value = typeMatch[1] ?? typeMatch[2];
    if (value === "button" || value === "reset") continue;
    // type="submit", or any other literal value (an invalid HTML button type falls back to
    // "submit" anyway).
    findings.push({ snippet: match[0], index: match.index });
  }
  return findings;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

// Whether a loading.tsx's content imports the shared skeleton shapes. A `loading.tsx` returning
// `null` (or anything else that never touches @/ui/skeletons) would satisfy a mere-presence check
// while showing a blank screen — the spec forbids that, so presence alone is not enough.
export function importsSkeletons(loadingContent: string): boolean {
  return /@\/ui\/skeletons/.test(stripComments(loadingContent));
}

export function checkPendingFeedbackLint(rootDir: string): LintViolation[] {
  const srcDir = join(rootDir, "src");
  const violations: LintViolation[] = [];

  // 1. No plain submit button anywhere in src/, except the shared component itself.
  for (const file of walk(srcDir, /\.(ts|tsx)$/)) {
    const relPath = relative(rootDir, file).replace(/\\/g, "/");
    if (relPath === SUBMIT_BUTTON_FILE) continue;

    const raw = readFileSync(file, "utf8");
    const stripped = stripComments(raw);
    for (const finding of findButtonTagFindings(stripped)) {
      violations.push({
        file: relPath,
        line: lineOf(stripped, finding.index),
        rule: "submit-button-not-shared",
        text: finding.snippet.trim(),
      });
    }
  }

  // 2. Every page.tsx under src/app/ has a sibling loading.tsx importing @/ui/skeletons.
  const appDir = join(rootDir, "src", "app");
  const pageFiles = existsSync(appDir) ? walk(appDir, /^page\.tsx$/) : [];
  for (const pageFile of pageFiles) {
    const relPath = relative(rootDir, pageFile).replace(/\\/g, "/");
    if (relPath in PAGE_LOADING_EXEMPTIONS) continue;

    const loadingFile = join(dirname(pageFile), "loading.tsx");
    const relLoadingPath = relative(rootDir, loadingFile).replace(/\\/g, "/");
    if (!existsSync(loadingFile)) {
      violations.push({ file: relPath, line: 1, rule: "missing-loading", text: "no sibling loading.tsx" });
      continue;
    }
    const loadingContent = readFileSync(loadingFile, "utf8");
    if (!importsSkeletons(loadingContent)) {
      violations.push({
        file: relLoadingPath,
        line: 1,
        rule: "loading-missing-skeleton-import",
        text: "does not import @/ui/skeletons",
      });
    }
  }

  return violations;
}

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const violations = checkPendingFeedbackLint(process.cwd());
  if (violations.length > 0) {
    console.error(`Pending-feedback lint (ui/pending-feedback) failed: ${violations.length} finding(s)`);
    for (const v of violations) console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.text}`);
    process.exit(1);
  }
  console.log("Pending-feedback lint: OK");
}
