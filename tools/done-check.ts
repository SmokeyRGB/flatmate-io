// done-check.ts — is plan-sprint-v0.1 finished?
//
// check-refs.ts asks "is the tree consistent?". This asks "is the work done?".
// Six conditions that must all hold before this branch merges into main.
//
// Written before the work, so it failed then and passes at the end. Each check says what it is
// for, so a failure explains itself.
//
// A 1:1 port of done-check.sh, which took 16.8s on Windows — 14.3s of it system time, i.e. Git
// Bash fork() overhead, the same disease as check-refs.sh. Every file is read once here.
//
// Usage:  node tools/done-check.ts [--verbose]
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { basename } from "node:path";

export interface DoneCheckResult {
  /** Every line the CLI prints, in order, ANSI codes included. */
  lines: string[];
  passed: number;
  failed: number;
}

const V01_SCOPE = [
  "S-01", "S-02", "S-03", "S-04", "S-05", "S-06", "S-07", "S-08", "S-09", "S-10",
  "S-12", "S-13", "S-14", "S-15", "S-16", "S-27", "S-31", "S-33", "S-35", "S-36",
  "S-37", "S-38", "S-48", "S-49", "S-50",
];

const LOAD_BEARING_ADRS = ["001", "002", "004", "006", "008", "010", "012"];

const OPEN_ID_ROW = /^\| \*{0,2}(O-[0-9A-F]+|P-O-[0-9]+|AW-[0-9]+)\*{0,2} \|/;
const OPEN_ID = /(O-[0-9A-F]+|P-O-[0-9]+|AW-[0-9]+)/g;
const CLOSURE_MARKER = /✅|Geklärt|geklärt|entschieden|Entschieden|geschlossen/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * `sed -n '/start/,/end/p'`: the range opens on a line matching `start`, and the closing match is
 * searched from the *next* line onward, so a range is never a single line. Ranges can reopen.
 */
function sedRange(lines: string[], start: RegExp, end: RegExp): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (!inside) {
      if (start.test(line)) {
        inside = true;
        out.push(line);
      }
      continue;
    }
    out.push(line);
    if (end.test(line)) inside = false;
  }
  return out;
}

export function doneCheck(rootDir: string, verbose = false): DoneCheckResult {
  const lines: string[] = [];
  let passed = 0;
  let failed = 0;

  const abs = (p: string): string => `${rootDir}/${p}`;
  const read = (relPath: string): string => {
    try {
      return readFileSync(abs(relPath), "utf8");
    } catch {
      return "";
    }
  };
  const readLines = (relPath: string): string[] => read(relPath).replace(/\r/g, "").split("\n");

  const ok = (msg: string): void => {
    passed += 1;
    lines.push(`  \x1b[32mPASS\x1b[0m  ${msg}`);
  };
  const bad = (msg: string, detail = ""): void => {
    failed += 1;
    lines.push(`  \x1b[31mFAIL\x1b[0m  ${msg}`);
    if (detail !== "") lines.push(`        ${detail}`);
  };
  const info = (msg: string): void => {
    if (verbose) lines.push(`        ${msg}`);
  };

  // Resolve a chain document whether or not the restructure has happened yet.
  const f = (name: string): string => {
    for (const candidate of [`docs/${name}`, name]) if (isFile(abs(candidate))) return candidate;
    return name;
  };
  // `ls a b | head -1` sorts its operands, so the first existing name in sorted order wins.
  const firstOf = (...candidates: string[]): string =>
    candidates.filter((c) => existsSync(abs(c))).sort()[0] ?? "";

  const SRD = f("02-SRD.md");
  const PRD = f("03-PRD.md");
  const DOM = f("04-Domaenenmodell.md");
  const ADR = f("05-ADRs.md");
  const CMP = f("06-Compliance-Anhang.md");
  const SCR = f("07-Screen-Inventar.md");
  const GRD = f("GUARDRAILS.md");
  const RVL = f("review-log.md");
  const COV = f("COVERAGE.md");
  const ROADMAP = firstOf("docs/backlog/roadmap.md", "Exercise 10/Feature-Themes-and-Roadmap.md");
  const MVPRM = firstOf("docs/backlog/README.md", "Exercise 10/MVP Backlog Features/README.md");

  lines.push("plan-sprint-v0.1 completeness gate");
  lines.push("");

  // -------------------------------------------------------------------------
  // 1 — Every open point is accounted for in the register.
  //     Why: open-point status existed in four hand-maintained copies and drifted in all four.
  //     The register is the single home; a source document may carry the question but not an
  //     unaccounted-for status.
  // -------------------------------------------------------------------------
  lines.push("1. open points are all in the register");
  if (!isFile(abs(RVL))) {
    bad("review-log.md not found", `expected ${RVL}`);
  } else if (!read(RVL).includes("Offene-Punkte-Register")) {
    bad(`no §Offene-Punkte-Register in ${RVL}`, "Phase 1a has not run yet");
  } else {
    const register = read(RVL);
    const missing: string[] = [];
    for (const src of [SRD, PRD, DOM, SCR, GRD, CMP]) {
      if (!isFile(abs(src))) continue;
      // What counts as an OPEN row.
      //
      // The documents express closure in three different, all legitimate ways, and the check has
      // to honour each rather than force one convention onto them:
      //   ~~O-5~~            struck through          (02-SRD, 03-PRD, 04 §10.3)
      //   | AW-1 | … | ✅ |  a status column          (07-Screen-Inventar §13)
      //   "Geklärt" / "entschieden" in the row       (04 §10.1 and §10.2 are headed as decided)
      // They also disagree on bolding: 02-SRD writes "| **O-07** |", 04-Domaenenmodell writes
      // "| O-1 |". Match both.
      //
      // So: a row is open only if its ID is unstruck AND the row carries no closure marker.
      const ids = new Set<string>();
      for (const line of readLines(src)) {
        if (!OPEN_ID_ROW.test(line)) continue;
        if (CLOSURE_MARKER.test(line)) continue;
        const prefix = line.match(OPEN_ID_ROW)?.[0] ?? "";
        for (const id of prefix.match(OPEN_ID) ?? []) ids.add(id);
      }
      for (const id of [...ids].sort()) {
        if (!new RegExp(`\\b${escapeRegExp(id)}\\b`).test(register)) {
          missing.push(`${id}(${basename(src)})`);
        }
      }
    }
    if (missing.length > 0) {
      bad("open ids not present in the register:", `${missing.slice(0, 20).join(" ")} `);
    } else {
      ok("every undecorated open row appears in the register");
    }
  }

  // -------------------------------------------------------------------------
  // 2 — The release cut has exactly one home.
  //     Why: PRD §7.1 was a second copy of SRD §5.4's scope and drifted on S-39, S-44 and S-33.
  //     The roadmap was a third copy and drifted further.
  // -------------------------------------------------------------------------
  lines.push("2. the release cut has one home");
  const section71 = isFile(abs(PRD)) ? sedRange(readLines(PRD), /^### 7.1/, /^### 7.2/) : [];
  if (isFile(abs(PRD)) && section71.some((l) => /\| *Inhalt *\|/i.test(l))) {
    bad(
      `${PRD} §7.1 still has an 'Inhalt' column`,
      "that column is the drift surface — drop it, keep 'Vorführbar als'",
    );
  } else {
    ok(`${PRD} §7.1 carries no scope column`);
  }
  // The chain documents are German; the Exercise 10 artifacts are English by the recorded ADR-012
  // exception. Accept the governing declaration in either language.
  if (ROADMAP !== "" && /Bei Abweichung gilt §5\.4|§5\.4 governs/.test(read(ROADMAP))) {
    ok("roadmap declares §5.4 as governing");
  } else {
    bad("roadmap does not declare §5.4 as governing", "add the sentence 03-PRD.md §7 already carries");
  }
  for (const s of ["S-39", "S-44"]) {
    // Only the table's data rows count. Prose explaining that these two were once listed here
    // wrongly is the record of the fix, not the defect.
    if (isFile(abs(PRD)) && section71.some((l) => l.startsWith("|") && l.includes(s))) {
      bad(`${s} still appears in a ${PRD} §7.1 table row`, "§5.4 places it in v0.2");
    }
  }

  // -------------------------------------------------------------------------
  // 3 — Every PRD §4/§6 subsection carries exactly one release-band marker.
  //     Why: 46 subsections, no band annotation anywhere, so the cut had to be re-derived by
  //     subject matter on every read. That is what produced the three §7.1 errors.
  // -------------------------------------------------------------------------
  lines.push("3. PRD §4/§6 subsections carry a band marker");
  if (isFile(abs(PRD))) {
    const all = readLines(PRD);
    const body = [...sedRange(all, /^## 4\./, /^## 5\./), ...sedRange(all, /^## 6\./, /^## 7\./)];
    const heads = body.filter((l) => /^#{3,4} /.test(l)).length;
    const bandLines = body.filter((l) => /^> \*\*Band:\*\*/.test(l));
    const bands = bandLines.length;
    info(`headings=${heads} bandmarkers=${bands}`);
    if (heads === 0) {
      bad("could not read PRD §4/§6", "");
    } else if (bands === heads) {
      ok(`all ${heads} subsections carry a band marker`);
    } else {
      bad(
        `${bands} of ${heads} subsections carry a band marker`,
        `Phase 2g adds the missing ${heads - bands}`,
      );
    }
    // A container heading has no content of its own, so it carries "gemischt" and points at its
    // subsections instead of naming a band. That is a valid marker.
    const badtok = bandLines
      .filter((l) => !/`(v0\.1|v0\.2|v1\.1|v2)`|gemischt/.test(l))
      .slice(0, 3);
    if (badtok.length > 0) bad("band marker with an invalid token", badtok.join("\n"));
  }

  // -------------------------------------------------------------------------
  // 4 — The seven v0.1-load-bearing ADRs are confirmed, with the cost recorded.
  //     Why: all twelve read "Vorschlag — anfechtbar". Shipping contestable records into
  //     implementation means a later objection invalidates code, not a paragraph.
  // -------------------------------------------------------------------------
  lines.push("4. the seven load-bearing ADRs are confirmed");
  if (isDir(abs("docs/adr"))) {
    const adrFiles = readdirSync(abs("docs/adr")).sort();
    for (const n of LOAD_BEARING_ADRS) {
      const match = adrFiles.filter((x) => x.startsWith(`0${n}-`) && x.endsWith(".md"))[0];
      if (match === undefined) {
        bad(`ADR-${n} has no record file`);
        continue;
      }
      const file = `docs/adr/${match}`;
      const content = read(file);
      if (!content.includes("Bestätigt — verbindlich für v0.1")) {
        bad(`ADR-${n} is not confirmed`, file);
      } else if (!content.includes("Was ein späterer Widerspruch kostet")) {
        bad(`ADR-${n} confirmed without the cost line`, file);
      } else {
        ok(`ADR-${n} confirmed with cost recorded`);
      }
    }
  } else if (isFile(abs(ADR))) {
    const c = readLines(ADR).filter((l) => l.includes("Bestätigt — verbindlich für v0.1")).length;
    if (c >= 7) ok("7+ confirmations present in the collector");
    else bad(`${c} of 7 ADRs confirmed`, "Phase 1f adds the Bestätigungsvermerk");
  }

  // -------------------------------------------------------------------------
  // 5 — GUARDRAILS: the new G-N class exists and the prose-only count is down.
  //     Why: five rules had no enforcement mechanism at all. Four are mechanisable; only G-A4
  //     genuinely is not.
  // -------------------------------------------------------------------------
  lines.push("5. GUARDRAILS integrity class exists");
  if (isFile(abs(GRD))) {
    const guardrails = read(GRD);
    const gn = ["G-N1", "G-N2", "G-N3", "G-N4", "G-N5", "G-N6"].filter((r) =>
      guardrails.includes(r),
    ).length;
    if (gn === 6) ok("G-N1…G-N6 are written as rules");
    else bad(`${gn} of 6 G-N rules present`, "Phase 4 writes the rest");
    if (/noch (offen|zu entscheiden)|TBD|festzulegen/.test(guardrails)) {
      info(`${GRD} still contains a TBD-style phrase — check G-H2 and the tool choice`);
    }
  }

  // -------------------------------------------------------------------------
  // 6 — Coverage: every v0.1 scope line is owned by a requirement packet.
  //     Why: S-05 was in the v0.1 cut and owned by nothing; S-15/S-36/S-37/S-27 appeared only as
  //     citations, never as a testable requirement.
  // -------------------------------------------------------------------------
  lines.push("6. every v0.1 scope line is owned");
  if (!isFile(abs(COV))) {
    bad("COVERAGE.md not found", "Phase 2d writes it");
  } else {
    const coverage = read(COV);
    const coverageLines = readLines(COV);
    const gapRows = coverageLines
      .map((l, i) => ({ l, i: i + 1 }))
      .filter(({ l }) => /\|\s*gap\s*\|/i.test(l));
    if (gapRows.length > 0) {
      bad(
        "COVERAGE.md still has a row marked 'gap'",
        `${gapRows.slice(0, 3).map(({ l, i }) => `${i}:${l}`).join(" ")} `,
      );
    } else {
      ok("no row in COVERAGE.md is marked 'gap'");
    }

    const unowned = V01_SCOPE.filter((s) => !new RegExp(`\\b${s}\\b`).test(coverage));
    if (unowned.length > 0) bad("v0.1 scope lines absent from COVERAGE.md:", ` ${unowned.join(" ")}`);
    else ok("all 25 v0.1 scope lines appear in COVERAGE.md");

    for (const s of V01_SCOPE) {
      const row = coverageLines.filter((l) => new RegExp(`\\|\\s*\\*{0,2}${s}\\*{0,2}\\s*\\|`).test(l))[0];
      if (row === undefined) continue;
      if (!/(FR-|AC-)[0-9]/.test(row)) bad(`${s} has no FR-/AC- id in COVERAGE.md`, "");
    }

    // Cross-check: every FR-/AC- id named in COVERAGE.md must actually exist in the packet its own
    // number points at (FR-1.25 -> F1). The scope-line-to-requirement link cannot be derived from
    // the requirements themselves, because the packets' convention is that only Constraints carry
    // a Source: line. So the mapping lives here — and this check makes a drift between it and the
    // packet fail the build instead of going unnoticed.
    const miss: string[] = [];
    const ids = [...new Set(coverage.match(/\b(FR|AC)-[0-5]\.[0-9]+/g) ?? [])].sort();
    for (const id of ids) {
      const n = id.slice(id.indexOf("-") + 1).split(".")[0];
      const pkt = firstOf(
        `docs/backlog/requirements/F${n}-requirements.md`,
        `Exercise 10/AI-Ready Requirements/F${n}-requirements.md`,
      );
      if (pkt === "") {
        miss.push(`${id}(no-F${n})`);
        continue;
      }
      if (!read(pkt).includes(id)) miss.push(`${id}(not-in-F${n})`);
    }
    if (miss.length > 0) {
      bad("COVERAGE.md names ids that are not in their packet:", `${miss.slice(0, 12).join(" ")} `);
    } else {
      ok("every FR-/AC- id in COVERAGE.md exists in its packet");
    }
  }

  // S-39 belongs to the paste parser (v0.2), not the form. It was listed in v0.1 in two places;
  // assert it stays out of every v0.1 list.
  for (const src of [MVPRM, PRD]) {
    if (src === "" || !isFile(abs(src))) continue;
    const hit = readLines(src)
      .filter((l) => l.startsWith("|"))
      .filter((l) => /S-08 \(form|Formularhälfte/.test(l))
      .some((l) => l.includes("S-39"));
    if (hit) {
      bad(`S-39 still listed beside the form half of S-08 in ${src}`, "it is v0.2, with the parser");
    }
  }

  // the specific closures this sprint promised
  const F1 = firstOf(
    "docs/backlog/requirements/F1-requirements.md",
    "Exercise 10/AI-Ready Requirements/F1-requirements.md",
  );
  const F0 = firstOf(
    "docs/backlog/requirements/F0-requirements.md",
    "Exercise 10/AI-Ready Requirements/F0-requirements.md",
  );
  if (F1 !== "") {
    if (read(F1).includes("S-05")) ok("S-05 is claimed by the F1 packet");
    else bad("S-05 not claimed by the F1 packet", F1);
  }
  if (F0 !== "") {
    const f0 = read(F0);
    for (const s of ["S-15", "S-27", "S-36", "S-37"]) {
      if (!f0.includes(s)) bad(`${s} not covered by the F0 packet`, F0);
    }
    ok("F0 packet exists");
  } else {
    bad("F0-requirements.md does not exist", "Phase 2c writes it");
  }

  lines.push("");
  lines.push(`── ${passed} passed, ${failed} failed`);
  if (failed !== 0) lines.push("   plan-sprint-v0.1 is NOT ready to merge");

  return { lines, passed, failed };
}

import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const verbose = process.argv[2] === "--verbose";
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/");
  const result = doneCheck(rootDir, verbose);
  for (const line of result.lines) console.log(line);
  process.exit(result.failed > 0 ? 1 : 0);
}
