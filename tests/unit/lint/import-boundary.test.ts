import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

// FR-0.1/G-C1: no route, component or job handler may import the raw Postgres/Drizzle client —
// only src/db/ itself and each module's own repository.ts may.
describe("import-boundary lint", () => {
  it("flags a raw client import (via db/client alias) outside src/db/ and repository.ts files", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-import-boundary-"));
    writeFixture("src/app/page.tsx", `import { db } from "@/db/client";\nexport default function Page() {}`);

    const violations = checkImportBoundaryLint(fixtureDir);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe("src/app/page.tsx");
  });

  it("flags the bare postgres package imported outside the allowed files", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-import-boundary-"));
    writeFixture("src/modules/casting/actions.ts", `import postgres from "postgres";`);

    const violations = checkImportBoundaryLint(fixtureDir);
    expect(violations.some((v) => v.file === "src/modules/casting/actions.ts")).toBe(true);
  });

  it("flags drizzle-orm/postgres-js imported outside the allowed files", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-import-boundary-"));
    writeFixture(
      "src/modules/casting/service.ts",
      `import { drizzle } from "drizzle-orm/postgres-js";`,
    );

    const violations = checkImportBoundaryLint(fixtureDir);
    expect(violations.some((v) => v.file === "src/modules/casting/service.ts")).toBe(true);
  });

  it("reports the correct line number", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-import-boundary-"));
    writeFixture(
      "src/app/page.tsx",
      `import { z } from "zod";\nimport { db } from "@/db/client";\n`,
    );

    const violations = checkImportBoundaryLint(fixtureDir);
    expect(violations[0].line).toBe(2);
  });

  it("allows the raw client import inside src/db/", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-import-boundary-"));
    writeFixture("src/db/client.ts", `import postgres from "postgres";`);

    expect(checkImportBoundaryLint(fixtureDir)).toHaveLength(0);
  });

  it("allows the raw client import inside a module's own repository.ts", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-import-boundary-"));
    writeFixture("src/modules/casting/repository.ts", `import { db } from "@/db/client";`);

    expect(checkImportBoundaryLint(fixtureDir)).toHaveLength(0);
  });

  it("passes a tree with no raw-client imports anywhere", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-import-boundary-"));
    writeFixture("src/app/page.tsx", `import { getRounds } from "@/modules/casting/repository";`);
    writeFixture("src/modules/casting/repository.ts", `import { db } from "@/db/client";`);

    expect(checkImportBoundaryLint(fixtureDir)).toHaveLength(0);
  });
});
