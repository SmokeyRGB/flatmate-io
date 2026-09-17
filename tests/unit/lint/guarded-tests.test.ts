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
