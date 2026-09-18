import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { checkRefs, renderCheckRefs } from "../../../tools/check-refs";

let fixtureDir: string;

function writeFixture(relPath: string, content: string): void {
  const full = join(fixtureDir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

function newFixture(): void {
  fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-")).replace(/\\/g, "/");
}

function messages(only: string): string[] {
  return checkRefs(fixtureDir, { only }).findings.map((f) => f.message);
}

afterEach(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

// Rule 1 — every markdown link resolves, relative to the citing file's directory.
describe("check-refs rule 1 (markdown links resolve)", () => {
  it("flags a link to a file that does not exist", () => {
    newFixture();
    writeFixture("docs/a.md", "see [x](./missing.md)");

    expect(messages("1")).toEqual(["BROKEN LINK    docs/a.md -> ./missing.md)"]);
  });

  it("accepts a link that resolves, including anchors and %20", () => {
    newFixture();
    writeFixture("docs/a.md", "[x](./b%20c.md#section) and [y](./b c.md)");
    writeFixture("docs/b c.md", "target");

    expect(messages("1")).toEqual([]);
  });

  it("ignores http, mailto and bare anchors", () => {
    newFixture();
    writeFixture("docs/a.md", "[a](https://example.test/x.md) [b](mailto:x@y.md) [c](#x.md)");

    expect(messages("1")).toEqual([]);
  });

  it("strips a :LINE suffix before resolving", () => {
    newFixture();
    writeFixture("docs/a.md", "[x](./b.md:42)");
    writeFixture("docs/b.md", "target");

    expect(messages("1")).toEqual([]);
  });
});

// Rule 2 — backticked *.md citations resolve by basename, anywhere in the repo.
describe("check-refs rule 2 (backticked *.md names exist)", () => {
  it("flags a bare name and a path-shaped citation that do not exist", () => {
    newFixture();
    writeFixture("docs/a.md", "see `nope.md` and `some/dir/alsonope.md`");

    expect(messages("2")).toEqual([
      "DANGLING NAME  `nope.md` cited in docs/a.md — no such file",
      "DANGLING PATH  `some/dir/alsonope.md` cited in docs/a.md — no such file",
    ]);
  });

  it("resolves by basename, so the directory part of a path citation is not verified", () => {
    newFixture();
    writeFixture("docs/a.md", "see `wrong/dir/real.md`");
    writeFixture("docs/elsewhere/real.md", "target");

    expect(messages("2")).toEqual([]);
  });

  it("exempts the generic document names", () => {
    newFixture();
    writeFixture("docs/a.md", "`requirements.md` `design.md` `tasks.md` `README.md` `CLAUDE.md`");

    expect(messages("2")).toEqual([]);
  });

  it("exempts historical records under _logs/ and archive/", () => {
    newFixture();
    writeFixture("docs/_logs/old.md", "see `gone.md`");
    writeFixture("archive/old.md", "see `gone.md`");

    expect(messages("2")).toEqual([]);
  });

  // QUIRK, reproduced from the shell version: the `*/docs/prompts/*` exclusion needs a literal
  // "/" before docs, which a top-level docs/prompts/ path does not have.
  it("does NOT exempt docs/prompts/ in the post-restructure tree", () => {
    newFixture();
    writeFixture("docs/prompts/p.md", "see `gone.md`");

    expect(messages("2")).toEqual(["DANGLING NAME  `gone.md` cited in docs/prompts/p.md — no such file"]);
  });
});

// Rule 3 — :LINE references are permitted only into the frozen collectors.
describe("check-refs rule 3 (:LINE refs only into frozen collectors)", () => {
  it("flags a line reference into a living document", () => {
    newFixture();
    writeFixture("docs/a.md", "see `SPEC-INDEX.md:42`");

    expect(messages("3")).toEqual(["LINE REF       docs/a.md -> SPEC-INDEX.md:42 (use § or #anchor)"]);
  });

  it("allows a line reference into each frozen collector", () => {
    newFixture();
    writeFixture("docs/a.md", "`04-Domaenenmodell.md:1` `05-ADRs.md:2` `07-Screen-Inventar.md:3`");

    expect(messages("3")).toEqual([]);
  });
});

// Rule 4 — the frozen collectors are hashed CRLF-independently, so the check holds on a Windows
// (CRLF) checkout and on Linux/CI (LF) alike.
describe("check-refs rule 4 (frozen collectors unchanged)", () => {
  const contentHash = (s: string): string =>
    createHash("sha256").update(Buffer.from(s.replace(/\r/g, ""), "utf8")).digest("hex");

  it("passes for CRLF and LF spellings of the same content", () => {
    for (const eol of ["\n", "\r\n"]) {
      newFixture();
      const body = `line one${eol}line two${eol}`;
      writeFixture("docs/frozen.md", body);
      writeFixture("tools/frozen.sha256", `# comment\n${contentHash(body)}  docs/frozen.md\n`);

      expect(messages("4")).toEqual([]);
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("flags an edited frozen file", () => {
    newFixture();
    writeFixture("docs/frozen.md", "tampered\n");
    writeFixture("tools/frozen.sha256", `${contentHash("original\n")}  docs/frozen.md\n`);

    expect(messages("4")).toEqual(["FROZEN CHANGED  docs/frozen.md"]);
  });

  it("flags a manifest entry whose file is gone", () => {
    newFixture();
    writeFixture("docs/a.md", "x");
    writeFixture("tools/frozen.sha256", `${contentHash("x")}  docs/vanished.md\n`);

    expect(messages("4")).toEqual(["FROZEN MISSING  docs/vanished.md"]);
  });

  it("skips, without failing, when no manifest exists", () => {
    newFixture();
    writeFixture("docs/a.md", "x");

    const result = checkRefs(fixtureDir, { only: "4" });
    expect(result.findings).toEqual([]);
    expect(result.rules[0].skipped).toBe("  (skipped: tools/frozen.sha256 does not exist yet)");
  });
});

// Rule 5 — a cited ADR-NNN must resolve to exactly one record file; zero and two both fail.
describe("check-refs rule 5 (each cited ADR-NNN has one record file)", () => {
  it("flags an ADR with no record file", () => {
    newFixture();
    writeFixture("docs/a.md", "per ADR-999 we do this");
    writeFixture("docs/adr/0001-something.md", "x");

    expect(messages("5")).toEqual(["ADR-999 resolves to 0 record file(s) in docs/adr/"]);
  });

  it("flags an ADR split across two record files", () => {
    newFixture();
    writeFixture("docs/a.md", "per ADR-004 we do this");
    writeFixture("docs/adr/0004-first.md", "x");
    writeFixture("docs/adr/0004-second.md", "x");

    expect(messages("5")).toEqual(["ADR-004 resolves to 2 record file(s) in docs/adr/"]);
  });

  it("accepts a leading-zero id, which must not be read as octal", () => {
    newFixture();
    writeFixture("docs/a.md", "per ADR-008 we do this");
    writeFixture("docs/adr/0008-eight.md", "x");

    expect(messages("5")).toEqual([]);
  });
});

// Rule 6 — a cited U-n / S-nn must be **bold** in its authoritative home file.
describe("check-refs rule 6 (U- and S- ids are defined)", () => {
  it("flags ids that are cited but not defined in bold", () => {
    newFixture();
    writeFixture("docs/a.md", "see U-99 and S-99");
    writeFixture("docs/08-UX-Entscheidungen.md", "U-99 without bold");
    writeFixture("docs/02-SRD.md", "S-99 without bold");

    expect(messages("6")).toEqual([
      "U-99 cited but not defined in docs/08-UX-Entscheidungen.md",
      "S-99 cited but not defined in docs/02-SRD.md",
    ]);
  });

  it("accepts ids defined in bold", () => {
    newFixture();
    writeFixture("docs/a.md", "see U-99 and S-99");
    writeFixture("docs/08-UX-Entscheidungen.md", "**U-99** decided");
    writeFixture("docs/02-SRD.md", "**S-99** in scope");

    expect(messages("6")).toEqual([]);
  });
});

// Rule 7 — the handover gate: nothing inside docs/ may reach outside docs/.
describe("check-refs rule 7 (handover boundary is closed)", () => {
  it("flags each of the five forbidden escape shapes", () => {
    newFixture();
    writeFixture("docs/a.md", "Ideas/Flatmate.io/x");
    writeFixture("docs/b.md", "[up](../../x.md)");
    writeFixture("docs/c.md", "~/.claude/x");
    writeFixture("docs/d.md", "[s](../specs/x.md)");
    writeFixture("docs/e.md", "`openspec/specs/x.md`");

    expect(messages("7")).toHaveLength(5);
  });

  it("exempts historical records under docs/_logs/ and docs/prompts/", () => {
    newFixture();
    writeFixture("docs/_logs/a.md", "[up](../../x.md)");
    writeFixture("docs/prompts/b.md", "[up](../../x.md)");

    expect(messages("7")).toEqual([]);
  });

  it("reports a line once per pattern it matches", () => {
    newFixture();
    writeFixture("docs/a.md", "[s](../specs/x.md) and `some/specs/y.md`");

    expect(messages("7")).toHaveLength(2);
  });
});

// The rendered output is a CI contract: the summary always prints, even under --quiet and --only,
// and rules that did not run still report 0.
describe("check-refs output contract", () => {
  it("prints an all-zero summary for a clean tree and does not fail", () => {
    newFixture();
    writeFixture("docs/a.md", "nothing to see");

    const result = checkRefs(fixtureDir, {});
    expect(result.failed).toBe(false);
    expect(renderCheckRefs(result, true)).toEqual([
      "",
      "── summary",
      "   r1  0",
      "   r2  0",
      "   r3  0",
      "   r4  0",
      "   r5  0",
      "   r6  0",
      "   r7  0",
      "   TOTAL findings: 0",
    ]);
  });

  it("indents findings by two spaces under their rule header", () => {
    newFixture();
    writeFixture("docs/a.md", "[x](./missing.md)");

    const rendered = renderCheckRefs(checkRefs(fixtureDir, { only: "1" }), false);
    expect(rendered[0]).toBe("── rule 1: markdown links resolve");
    expect(rendered[1]).toBe("  BROKEN LINK    docs/a.md -> ./missing.md)");
  });

  // QUIRK, reproduced from the shell version: --only takes any string with no validation, so an
  // out-of-range rule runs nothing and reports a clean tree rather than erroring.
  it("runs nothing for an out-of-range --only", () => {
    newFixture();
    writeFixture("docs/a.md", "[x](./missing.md)");

    const result = checkRefs(fixtureDir, { only: "9" });
    expect(result.rules).toEqual([]);
    expect(result.failed).toBe(false);
  });
});
