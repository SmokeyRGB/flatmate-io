import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkSessionContextLint } from "../../../scripts/lint/session-context";
import { checkImportBoundaryLint } from "../../../scripts/lint/import-boundary";

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

// FR-0.1/G-C1: no route/component/job handler may import the raw client directly.
describe("import-boundary lint (FR-0.1, T007/T011)", () => {
  it("flags a raw client import outside src/db/ and repository.ts files", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/app/page.tsx", `import { db } from "@/db/client";\nexport default function Page() {}`);

    const violations = checkImportBoundaryLint(fixtureDir);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows the raw client import inside src/db/", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/db/client.ts", `import postgres from "postgres";`);

    expect(checkImportBoundaryLint(fixtureDir)).toHaveLength(0);
  });

  it("allows the raw client import inside a module's own repository.ts", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/modules/casting/repository.ts", `import { db } from "@/db/client";`);

    expect(checkImportBoundaryLint(fixtureDir)).toHaveLength(0);
  });
});
