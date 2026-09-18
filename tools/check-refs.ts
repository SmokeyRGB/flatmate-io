// check-refs.ts — reference and boundary check for the docs/ + tools/ handover package.
//
// A 1:1 port of check-refs.sh, which took 3m10s on Windows — of which 2m12s was *system* time,
// i.e. pure Git Bash fork() overhead across ~4,300 process spawns. ~3,310 of those came from a
// single line: the per-match `printf | grep -qE "$GENERIC_NAMES"` inside rule 2's two loops.
// Nothing about the rules was slow; spawning was. Every file is now read once and every rule
// runs as a regex over the in-memory corpus.
//
// Why these rules exist: review-log.md:9-14 records the same class of defect three times and
// concludes that a rule without a mechanism does not hold. These are the mechanisms.
// See tools/README.md for what each rule protects.
//
// Behavior is byte-identical to the shell version, including three quirks that are reproduced
// deliberately rather than fixed — see QUIRK comments at rules 2 and 5, and `parseArgs`.
//
// Usage:  npx tsx tools/check-refs.ts [--quiet] [--only N]
//         npx tsx tools/check-refs.ts --scope docs      # for the handover dry run
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { basename, dirname } from "node:path";
import { createHash } from "node:crypto";

export interface CheckRefsFinding {
  rule: number;
  message: string;
}

export interface CheckRefsRuleResult {
  rule: number;
  header: string;
  /** The "(skipped: …)" line a gated rule prints instead of running. */
  skipped?: string;
  findings: CheckRefsFinding[];
}

export interface CheckRefsResult {
  /** Only the rules that ran, in rule order. */
  rules: CheckRefsRuleResult[];
  /** Every finding, flat, in emission order. */
  findings: CheckRefsFinding[];
  /** Keys r1…r7, always all seven present. */
  counts: Record<string, number>;
  failed: boolean;
}

export interface CheckRefsOptions {
  /** Rule filter. Compared as a string against "1".."7"; anything else runs nothing. */
  only?: string;
  /** Single-directory scope override, used verbatim. */
  scope?: string;
}

const RULE_HEADERS: Record<number, string> = {
  1: "markdown links resolve",
  2: "backticked *.md names exist",
  3: ":LINE refs only into frozen collectors",
  4: "frozen collectors unchanged",
  5: "each cited ADR-NNN has one record file",
  6: "U- and S- ids are defined",
  7: "handover boundary is closed",
};

// Generic filenames that appear in prose as a *kind* of document rather than as a reference to a
// particular file ("this document is `requirements.md` only"). Rule 2 must not treat these as
// dangling references.
const GENERIC_NAMES = /^(requirements|design|tasks|README|CLAUDE|KNOWN-LIMITATIONS|data-inventory)\.md$/;

// Four alternatives for three files: 04-Screen-Inventar.md is the legacy pre-restructure name.
const FROZEN_RE = /(04-Domaenenmodell|05-ADRs|07-Screen-Inventar|04-Screen-Inventar)\.md/;

// archive/ and docs/_logs/ are deliberately excluded from rules 2 and 3: their stale paths were
// accurate the day they were written, and rewriting a historical record to satisfy a linter
// falsifies it.
//
// QUIRK (reproduced deliberately): `*/docs/prompts/*` requires a literal "/" *before* docs. In
// the post-restructure tree paths read "docs/prompts/x.md" with no leading slash, so those three
// files are in fact scanned, despite the shell version's comment claiming they are exempt. The
// pattern only bites in the flat pre-restructure tree. "Fixing" it would change finding counts.
const RULE_2_3_EXCLUDE = ["*/_logs/*", "archive/*", "./archive/*", "*/.old/*", "*/docs/prompts/*"];

const LINK_RE = /\]\([^)]+\.(md|html|png|jpe?g|mp4|ya?ml|sh|json)[^)]*\)/g;
const BACKTICK_NAME_RE = /`[A-Za-z0-9._ -]+\.md`/g;
const BACKTICK_PATH_RE = /`\.{0,2}\/?[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+\.md`/g;
const LINE_REF_RE = /`?[A-Za-z0-9._-]+\.md:[0-9]+/g;
const ADR_RE = /ADR-[0-9]{3}/g;
const U_ID_RE = /\bU-[0-9]{1,2}\b/g;
const S_ID_RE = /\bS-[0-9]{2}\b/g;

// Rule 7's five forbidden shapes, in the order the shell version's five greps run — which is the
// order findings are emitted in, and a line matching several is reported once per pattern.
const BOUNDARY_PATTERNS = [
  /Ideas\/Flatmate\.io\//,
  /\]\(\.\.\/\.\.\//,
  /~\/\.claude\//,
  /\]\([^)]*specs\//,
  /`[^`]*specs\/[^`]*`/,
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Converts the handful of shell globs used above. They contain only `*` — no `?`, no classes. */
function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${glob.split("*").map(escapeRegExp).join("[\\s\\S]*")}$`);
}

const EXCLUDE_RES = RULE_2_3_EXCLUDE.map(globToRegExp);

function isExcludedFromRules23(src: string): boolean {
  return EXCLUDE_RES.some((re) => re.test(src));
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Mirrors `find <root> -maxdepth N \( -name .git -o -name .claude -o -name node_modules \) -prune -o -name '*.md' -type f`. */
function collectMarkdown(root: string, maxDepth: number): string[] {
  const PRUNE = new Set([".git", ".claude", "node_modules"]);
  const out: string[] = [];

  const recurse = (path: string, depth: number): void => {
    let entries: string[];
    try {
      entries = readdirSync(path);
    } catch {
      return;
    }
    for (const entry of entries) {
      const childDepth = depth + 1;
      if (maxDepth >= 0 && childDepth > maxDepth) continue;
      if (PRUNE.has(entry)) continue;
      const full = `${path}/${entry}`;
      let dir: boolean;
      try {
        dir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (dir) {
        recurse(full, childDepth);
      } else if (entry.endsWith(".md")) {
        out.push(full);
      }
    }
  };

  if (isDir(root)) recurse(root, 0);
  return out;
}

/**
 * Every basename in the repo, for rule 2's existence test.
 *
 * Replaces ~106 full-tree `find . -name "$n" -print -quit` invocations (~40s) with one walk.
 * Prunes exactly what the shell version prunes — .git and node_modules, NOT .next or prototype —
 * and collects directory names too, since the shell `find` has no `-type f`.
 */
function collectAllBasenames(rootDir: string): Set<string> {
  const PRUNE = new Set([".git", "node_modules"]);
  const names = new Set<string>();

  const recurse = (path: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(path);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (PRUNE.has(entry)) continue;
      names.add(entry);
      const full = `${path}/${entry}`;
      let dir: boolean;
      try {
        dir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (dir) recurse(full);
    }
  };

  recurse(rootDir);
  return names;
}

function matchAll(content: string, re: RegExp): string[] {
  return content.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)) ?? [];
}

export function checkRefs(rootDir: string, options: CheckRefsOptions = {}): CheckRefsResult {
  const only = options.only ?? "";
  const runs = (rule: number): boolean => only === "" || only === String(rule);

  const rules: CheckRefsRuleResult[] = [];
  const findings: CheckRefsFinding[] = [];
  const counts: Record<string, number> = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, r6: 0, r7: 0 };
  let current: CheckRefsRuleResult | null = null;

  const begin = (rule: number): CheckRefsRuleResult => {
    current = { rule, header: RULE_HEADERS[rule], findings: [] };
    rules.push(current);
    return current;
  };
  const note = (rule: number, message: string): void => {
    const finding = { rule, message };
    counts[`r${rule}`] += 1;
    findings.push(finding);
    current?.findings.push(finding);
  };

  // Paths are built from the scope strings verbatim, so `.`-rooted scopes yield "./docs/x.md"
  // exactly as `find .` does — which is what the rule 2/3 exclusion globs key off.
  const abs = (p: string): string => (p.startsWith("/") || /^[A-Za-z]:/.test(p) ? p : `${rootDir}/${p}`);

  // --- Scope. Post-restructure this is docs/ plus the non-archive siblings. Pre-restructure
  // docs/ does not exist yet, so fall back to the flat tree.
  let scope: string[];
  if (options.scope) {
    scope = [options.scope];
  } else if (isDir(abs("docs"))) {
    scope = ["docs"];
    for (const sibling of ["coursework", "research", "process", "specs", "openspec"]) {
      if (isDir(abs(sibling))) scope.push(sibling);
    }
  } else {
    // "." already covers every subdirectory; listing the siblings again would scan each file
    // twice and double every finding.
    scope = ["."];
  }

  const mdfiles = scope.flatMap((root) =>
    collectMarkdown(abs(root), 6).map((f) => f.slice(rootDir.length + 1)),
  );

  // Rules 5 and 6 use `grep -r`, which has no depth limit, rather than the mdfiles array.
  // Deviation, documented: .git/node_modules stay pruned here so the dead flat-tree branch
  // cannot walk node_modules. No scope directory contains either, so output is unaffected.
  const deepFiles = scope.flatMap((root) =>
    collectMarkdown(abs(root), -1).map((f) => f.slice(rootDir.length + 1)),
  );

  const read = (relPath: string): string => {
    try {
      return readFileSync(abs(relPath), "utf8");
    } catch {
      return "";
    }
  };

  // --- Rule 1 — every markdown link resolves.
  // Anchors (#…) and :LINE suffixes are stripped; %20 is decoded.
  if (runs(1)) {
    begin(1);
    for (const src of mdfiles) {
      const dir = dirname(src);
      for (const match of matchAll(read(src), LINK_RE)) {
        const raw = match.replace(/^\]\(/, "").replace(/\r/g, "");
        let tgt = raw.split(")")[0];
        // Evaluated before anchor stripping, exactly as the shell `case` is.
        if (/^http/.test(tgt) || tgt.startsWith("mailto:") || tgt.startsWith("#") || tgt === "") continue;
        tgt = tgt.split("#")[0];
        tgt = tgt.replace(/:[0-9]+(-[0-9]+)?$/, "");
        tgt = tgt.split("%20").join(" "); // %20 is the only escape decoded
        if (tgt === "") continue;
        if (!existsSync(abs(`${dir}/${tgt}`))) note(1, `BROKEN LINK    ${src} -> ${raw}`);
      }
    }
  }

  // --- Rule 2 — every backticked *.md filename exists somewhere in the project.
  // Resolved by basename, which is what makes the repo's bare-filename house style safe across
  // moves. Historical records are exempt.
  if (runs(2)) {
    begin(2);
    const basenames = collectAllBasenames(rootDir);

    // Pass A — bare filenames. The character class includes a space.
    for (const src of mdfiles) {
      if (isExcludedFromRules23(src)) continue;
      for (const match of matchAll(read(src), BACKTICK_NAME_RE)) {
        const n = match.replace(/[`\r]/g, "");
        if (n === "" || GENERIC_NAMES.test(n)) continue;
        if (!basenames.has(n)) note(2, `DANGLING NAME  \`${n}\` cited in ${src} — no such file`);
      }
    }

    // Pass B — citations written as a PATH rather than a bare filename: `domain/invarianten.md`,
    // `../05-ADRs.md`, `backlog/requirements/F0-...md`. Pass A's pattern has no "/" in its class,
    // so every one of these escaped the check — a blind spot that let two dead citations through
    // review. Resolved by basename like the bare form, so the directory part is not verified.
    for (const src of mdfiles) {
      if (isExcludedFromRules23(src)) continue;
      for (const match of matchAll(read(src), BACKTICK_PATH_RE)) {
        const p = match.replace(/[`\r]/g, "");
        if (p === "") continue;
        const n = basename(p);
        if (GENERIC_NAMES.test(n)) continue;
        if (!basenames.has(n)) note(2, `DANGLING PATH  \`${p}\` cited in ${src} — no such file`);
      }
    }
  }

  // --- Rule 3 — :LINE references only into the three frozen collectors.
  // A line number into a live file is a liability; into a frozen file it is stable forever.
  if (runs(3)) {
    begin(3);
    for (const src of mdfiles) {
      if (isExcludedFromRules23(src)) continue;
      for (const match of matchAll(read(src), LINE_REF_RE)) {
        const h = match.replace(/[`\r]/g, "");
        if (h === "") continue;
        // Unanchored substring test, as in the shell version: "docs/05-ADRs.md:88" passes.
        if (new RegExp(`${FROZEN_RE.source}:[0-9]+`).test(h)) continue;
        note(3, `LINE REF       ${src} -> ${h} (use § or #anchor)`);
      }
    }
  }

  // --- Rule 4 — the frozen collectors have not changed.
  if (runs(4)) {
    const rule = begin(4);
    if (isFile(abs("tools/frozen.sha256"))) {
      // Hash the CONTENT, not the bytes on disk: strip CR before hashing.
      //
      // `sha256sum -c` would compare raw bytes, and these files are `*.md text` in .gitattributes
      // — so git stores LF and checks out CRLF on Windows, LF on Linux. A byte hash therefore only
      // ever matches on the platform that generated it, and rule 4 would be permanently red in CI.
      // Since the point is to detect an *edit*, normalising line endings first is both correct and
      // portable.
      const manifest = readFileSync(abs("tools/frozen.sha256"), "utf8").replace(/\r/g, "");
      for (const line of manifest.split("\n")) {
        if (line === "" || line.startsWith("#")) continue;
        const spaceIdx = line.indexOf(" ");
        const want = spaceIdx === -1 ? line : line.slice(0, spaceIdx);
        // ${line##* } — everything after the LAST space, so a path containing a space would break.
        let path = line.slice(line.lastIndexOf(" ") + 1);
        path = path.replace(/^\*/, ""); // sha256sum writes "hash *path" in binary mode
        if (!isFile(abs(path))) {
          note(4, `FROZEN MISSING  ${path}`);
          continue;
        }
        const bytes = readFileSync(abs(path));
        const stripped = Buffer.from(bytes.filter((b) => b !== 0x0d));
        const have = createHash("sha256").update(stripped).digest("hex");
        if (want !== have) note(4, `FROZEN CHANGED  ${path}`);
      }
    } else {
      rule.skipped = "  (skipped: tools/frozen.sha256 does not exist yet)";
    }
  }

  // --- Rule 5 — every cited ADR-NNN resolves to exactly one record file.
  if (runs(5)) {
    const rule = begin(5);
    if (isDir(abs("docs/adr"))) {
      const ids = new Set<string>();
      for (const file of deepFiles) {
        for (const match of matchAll(read(file), ADR_RE)) ids.add(match.replace("ADR-", ""));
      }
      let adrFiles: string[];
      try {
        adrFiles = readdirSync(abs("docs/adr"));
      } catch {
        adrFiles = [];
      }
      // `sort -u` is byte-lexicographic over fixed-width 3-digit strings, so this matches.
      for (const n of [...ids].sort()) {
        // 10# forces base 10 in the shell — otherwise "008" would be an invalid octal literal.
        const prefix = `${String(parseInt(n, 10)).padStart(4, "0")}-`;
        const c = adrFiles.filter((f) => f.startsWith(prefix) && f.endsWith(".md")).length;
        if (c !== 1) note(5, `ADR-${n} resolves to ${c} record file(s) in docs/adr/`);
      }
    } else {
      rule.skipped = "  (skipped: docs/adr/ does not exist yet)";
    }
  }

  // --- Rule 6 — every cited U-n / S-nn is defined where the ID register says.
  if (runs(6)) {
    begin(6);
    // `ls a b | head -1` sorts its operands, so a root-level copy wins over the docs/ one.
    const homeOf = (candidates: string[]): string =>
      candidates.filter((c) => existsSync(abs(c))).sort()[0] ?? "";
    const uhome = homeOf(["08-UX-Entscheidungen.md", "docs/08-UX-Entscheidungen.md"]);
    const shome = homeOf(["02-SRD.md", "docs/02-SRD.md"]);

    const collect = (re: RegExp): string[] => {
      const ids = new Set<string>();
      for (const file of deepFiles) for (const m of matchAll(read(file), re)) ids.add(m);
      return [...ids].sort();
    };

    // Both blocks are skipped silently — no "(skipped)" line — if the home file is missing.
    if (uhome !== "") {
      const content = read(uhome);
      for (const u of collect(U_ID_RE)) {
        if (!new RegExp(`\\*\\*${escapeRegExp(u)}\\*\\*`).test(content)) {
          note(6, `${u} cited but not defined in ${uhome}`);
        }
      }
    }
    if (shome !== "") {
      const content = read(shome);
      for (const s of collect(S_ID_RE)) {
        if (!new RegExp(`\\*\\*${escapeRegExp(s)}\\*\\*`).test(content)) {
          note(6, `${s} cited but not defined in ${shome}`);
        }
      }
    }
  }

  // --- Rule 7 — HANDOVER GATE: nothing inside docs/ may reach outside docs/.
  // This is the rule that proves the folder is copy-ready. It ignores SCOPE entirely and always
  // reads the literal docs/ directory.
  if (runs(7)) {
    const rule = begin(7);
    if (isDir(abs("docs"))) {
      const docFiles = collectMarkdown(abs("docs"), -1).map((f) => f.slice(rootDir.length + 1));
      // One pass per pattern, mirroring five sequential greps: a line matching several patterns
      // is emitted once per pattern, and all of pattern 1's hits precede pattern 2's.
      for (const pattern of BOUNDARY_PATTERNS) {
        for (const file of docFiles) {
          const lines = read(file).split("\n");
          lines.forEach((text, idx) => {
            if (!pattern.test(text)) return;
            const hit = `${file}:${idx + 1}:${text}`.replace(/\r/g, "");
            // The two grep -v filters run against the whole "path:line:text" string.
            if (hit.includes("/_logs/") || hit.includes("docs/prompts/")) return;
            note(7, `ESCAPES BOUNDARY  ${hit}`);
          });
        }
      }
    } else {
      rule.skipped = "  (skipped: docs/ does not exist yet)";
    }
  }

  return { rules, findings, counts, failed: findings.length > 0 };
}

export function renderCheckRefs(result: CheckRefsResult, quiet: boolean): string[] {
  const lines: string[] = [];
  if (!quiet) {
    for (const rule of result.rules) {
      lines.push(`── rule ${rule.rule}: ${rule.header}`);
      for (const f of rule.findings) lines.push(`  ${f.message}`);
      if (rule.skipped !== undefined) lines.push(rule.skipped);
    }
  }
  // The summary always prints, including under --quiet and --only. Rules that did not run still
  // report 0.
  lines.push("");
  lines.push("── summary");
  for (const r of ["r1", "r2", "r3", "r4", "r5", "r6", "r7"]) {
    lines.push(`   ${r.padEnd(3)} ${result.counts[r]}`);
  }
  lines.push(`   TOTAL findings: ${result.findings.length}`);
  return lines;
}

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  // QUIRK (reproduced deliberately): --only and --scope take the next argv with no validation.
  // `--only 9` runs nothing, prints an all-zero summary and exits 0; `--scope nosuchdir` finds no
  // files and exits 0. Adding validation would change the contract CI depends on.
  let quiet = false;
  let only = "";
  let scope = "";
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--quiet") {
      quiet = true;
    } else if (arg === "--only") {
      only = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--scope") {
      scope = argv[i + 1] ?? "";
      i += 1;
    } else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }

  // The shell version cd's to the repo root so it can be run from anywhere; the root is the
  // parent of the tools/ directory holding this file, not process.cwd().
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/");
  const result = checkRefs(rootDir, { only, scope });
  // Findings go to stdout, not stderr — this is where check-refs differs from the four lints
  // under scripts/lint/, and CI's output comparison depends on it.
  for (const line of renderCheckRefs(result, quiet)) console.log(line);
  process.exit(result.failed ? 1 : 0);
}
