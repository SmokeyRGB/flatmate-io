import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkSessionContextLint } from "../../../scripts/lint/session-context";

let fixtureDir: string;

function writeFixture(relPath: string, content: string): void {
  const full = join(fixtureDir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

afterEach(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

// FR-0.4/G-C8: a bare SET is always rejected; SET LOCAL for the session context is only allowed
// in src/db/session-context.ts.
describe("session-context lint (FR-0.4, T006/T011)", () => {
  it("flags a bare SET anywhere in src/", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/modules/casting/schema.ts", `await tx.execute(sql\`SET app.household_id = 'x'\`);`);

    const violations = checkSessionContextLint(fixtureDir);
    expect(violations.some((v) => v.rule === "bare-set")).toBe(true);
  });

  it("flags SET LOCAL for the session context outside src/db/session-context.ts", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/modules/casting/repository.ts",
      `await tx.execute(sql\`SET LOCAL app.household_id = 'x'\`);`,
    );

    const violations = checkSessionContextLint(fixtureDir);
    expect(violations.some((v) => v.rule === "set-local-outside-session-context")).toBe(true);
  });

  it("allows SET LOCAL inside src/db/session-context.ts", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/db/session-context.ts", `await tx.execute(sql\`SET LOCAL app.household_id = 'x'\`);`);

    expect(checkSessionContextLint(fixtureDir)).toHaveLength(0);
  });
});
// import-boundary lint tests moved to tests/unit/lint/import-boundary.test.ts (FR-0.1/G-C1).
