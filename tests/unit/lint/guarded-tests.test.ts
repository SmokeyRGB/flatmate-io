import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkGuardedTests } from "../../../scripts/lint/guarded-tests";

let fixtureDir: string;

function writeFixture(relPath: string, content: string): void {
  const full = join(fixtureDir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

afterEach(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

const MANIFEST = JSON.stringify({
  invariants: [
    { id: "G-D10", status: "implemented", testFiles: ["tests/pool-reuse.test.ts"] },
    { id: "G-D1", status: "pending", testFiles: [] },
  ],
  visibilityInvariants: {
    $comment: "AC-0.6/G-C7",
    application_via_policy: { status: "implemented", testFile: "tests/scoping.test.ts" },
  },
});

// Constitution Principle I / Minimal-Gate item 6 (T045, promoting T040's manual check).
describe("guarded-tests check", () => {
  it("flags a registered file that is missing entirely", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-guarded-"));
    writeFixture("test/guarded.manifest.json", MANIFEST);
    // tests/pool-reuse.test.ts and tests/scoping.test.ts are never written.

    const violations = checkGuardedTests(fixtureDir);
    expect(violations.some((v) => v.file === "tests/pool-reuse.test.ts")).toBe(true);
  });

  it("flags a registered file containing .skip(", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-guarded-"));
    writeFixture("test/guarded.manifest.json", MANIFEST);
    writeFixture("tests/pool-reuse.test.ts", `it.skip("leaks", () => {});`);
    writeFixture("tests/scoping.test.ts", `it("scopes", () => {});`);

    const violations = checkGuardedTests(fixtureDir);
    expect(violations.some((v) => v.file === "tests/pool-reuse.test.ts")).toBe(true);
  });

  it("flags a registered file with no it(/test( body", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-guarded-"));
    writeFixture("test/guarded.manifest.json", MANIFEST);
    writeFixture("tests/pool-reuse.test.ts", `// commented out entirely\n// it("leaks", () => {});`);
    writeFixture("tests/scoping.test.ts", `it("scopes", () => {});`);

    const violations = checkGuardedTests(fixtureDir);
    expect(violations.some((v) => v.file === "tests/pool-reuse.test.ts")).toBe(true);
  });

  it("passes when every registered file exists, is not skipped, and has a real body", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-guarded-"));
    writeFixture("test/guarded.manifest.json", MANIFEST);
    writeFixture("tests/pool-reuse.test.ts", `it("leaks", () => {});`);
    writeFixture("tests/scoping.test.ts", `it("scopes", () => {});`);

    expect(checkGuardedTests(fixtureDir)).toHaveLength(0);
  });

  it("ignores pending invariants entirely", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-guarded-"));
    writeFixture("test/guarded.manifest.json", MANIFEST);
    writeFixture("tests/pool-reuse.test.ts", `it("leaks", () => {});`);
    writeFixture("tests/scoping.test.ts", `it("scopes", () => {});`);
    // No file at all for G-D1 (pending) — must not be flagged.

    expect(checkGuardedTests(fixtureDir)).toHaveLength(0);
  });
});

function writeWithEol(relPath: string, content: string, eol: "\n" | "\r\n"): void {
  writeFixture(relPath, content.replace(/\r?\n/g, eol));
}

function registerBoth(poolSource: string, eol: "\n" | "\r\n"): void {
  fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-guarded-"));
  writeFixture("test/guarded.manifest.json", MANIFEST);
  writeWithEol("tests/pool-reuse.test.ts", poolSource, eol);
  writeWithEol("tests/scoping.test.ts", `it("scopes", () => {});\n`, eol);
}

describe("guarded-tests check — line endings", () => {
  it.each(["\n", "\r\n"] as const)("treats a fully commented-out it( as no body under %j", (eol) => {
    registerBoth(`// commented out entirely\n// it("leaks", () => {});\n// another comment\n`, eol);

    const violations = checkGuardedTests(fixtureDir);
    expect(
      violations.some(
        (v) => v.file === "tests/pool-reuse.test.ts" && v.reason.includes("no it(/test( body"),
      ),
    ).toBe(true);
  });

  it.each(["\n", "\r\n"] as const)("ignores prose .skip( inside a line comment under %j", (eol) => {
    registerBoth(`it("ok", () => {}); // never .skip( this\n`, eol);

    expect(checkGuardedTests(fixtureDir)).toHaveLength(0);
  });
});

describe("guarded-tests check — skip spellings", () => {
  it.each([
    `it.skipIf(cond)("x", () => {});`,
    `it.runIf(cond)("x", () => {});`,
    `it.todo("x");`,
    `xit("x", () => {});`,
    `xtest("x", () => {});`,
    `xdescribe("x", () => {});`,
    `describe.skip("x", () => {});`,
    `it.only("x", () => {});`,
  ])("flags %s in a registered file that also has a real body", (spelling) => {
    registerBoth(`it("ok", () => {});\n${spelling}\n`, "\n");

    const violations = checkGuardedTests(fixtureDir);
    expect(violations.some((v) => v.file === "tests/pool-reuse.test.ts")).toBe(true);
    expect(violations.some((v) => v.reason.includes("no it(/test( body"))).toBe(false);
  });

  // Conservative: the detector runs on comment-stripped text, not on a parse, so a .skip(
  // that lives in a string is still visible and is still a violation.
  it("flags .skip( inside a string literal", () => {
    registerBoth(`it("ok", () => {});\nconst example = "it.skip(";\n`, "\n");

    const violations = checkGuardedTests(fixtureDir);
    expect(violations.some((v) => v.file === "tests/pool-reuse.test.ts")).toBe(true);
  });
});

describe("guarded-tests check — block comments", () => {
  it.each(["\n", "\r\n"] as const)(
    "treats a test that exists only inside a one-line block comment as no body under %j",
    (eol) => {
      registerBoth(`/* it("leaks", () => {}); */\n`, eol);

      const violations = checkGuardedTests(fixtureDir);
      expect(
        violations.some(
          (v) => v.file === "tests/pool-reuse.test.ts" && v.reason.includes("no it(/test( body"),
        ),
      ).toBe(true);
    },
  );

  it.each(["\n", "\r\n"] as const)(
    "treats a test that exists only inside a multi-line block comment as no body under %j",
    (eol) => {
      registerBoth(`/*\nit("leaks", () => {});\n*/\n`, eol);

      const violations = checkGuardedTests(fixtureDir);
      expect(
        violations.some(
          (v) => v.file === "tests/pool-reuse.test.ts" && v.reason.includes("no it(/test( body"),
        ),
      ).toBe(true);
    },
  );

  it.each(["\n", "\r\n"] as const)(
    "ignores .skip( inside a block comment when the file has a real body under %j",
    (eol) => {
      registerBoth(`it("ok", () => {});\n/* it.skip( */\n`, eol);

      expect(checkGuardedTests(fixtureDir)).toHaveLength(0);
    },
  );
});
