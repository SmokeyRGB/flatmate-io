import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkRlsCoverage } from "../../../scripts/lint/rls-coverage";

let fixtureDir: string;

function writeFixture(relPath: string, content: string): void {
  const full = join(fixtureDir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

afterEach(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

// FR-0.2/EC-0.1/EC-0.2: every table carrying household_id needs a pgPolicy in its OWN table
// segment. Per-table, not per-file — a file-granular version let a new household_id table pass
// silently as long as a sibling in the same file had a policy (pr-review-lessons-countermeasures
// P9). These fixtures mirror this project's own two-table-per-file shape.
describe("rls-coverage lint (per-table)", () => {
  it("flags the table missing a policy, naming it, even when a sibling table has one", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-rls-"));
    writeFixture(
      "src/modules/example/schema.ts",
      `
import { pgPolicy, pgTable, uuid } from "drizzle-orm/pg-core";

export const covered = pgTable(
  "covered",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
  },
  (t) => [
    pgPolicy("covered_household_isolation", { as: "permissive", for: "all" }),
  ],
);

export const uncovered = pgTable(
  "uncovered",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
  },
  () => [],
);
`,
    );

    const violations = checkRlsCoverage(fixtureDir);
    expect(violations).toHaveLength(1);
    expect(violations[0].table).toBe("uncovered");
    expect(violations[0].file).toBe("src/modules/example/schema.ts");
  });

  it("passes when every table in the file has its own policy", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-rls-"));
    writeFixture(
      "src/modules/example/schema.ts",
      `
import { pgPolicy, pgTable, uuid } from "drizzle-orm/pg-core";

export const first = pgTable(
  "first",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
  },
  (t) => [pgPolicy("first_isolation", { as: "permissive", for: "all" })],
);

export const second = pgTable(
  "second",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
  },
  (t) => [pgPolicy("second_isolation", { as: "permissive", for: "all" })],
);
`,
    );

    expect(checkRlsCoverage(fixtureDir)).toHaveLength(0);
  });

  it("does not flag a table with no household_id and no policy (join_attempt shape)", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-rls-"));
    writeFixture(
      "src/modules/example/schema.ts",
      `
import { pgTable, uuid } from "drizzle-orm/pg-core";

export const joinAttempt = pgTable(
  "join_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
  },
  () => [],
);
`,
    );

    expect(checkRlsCoverage(fixtureDir)).toHaveLength(0);
  });

  it("allows the escape hatch marker comment inside the table's own segment", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-rls-"));
    writeFixture(
      "src/modules/example/schema.ts",
      `
import { pgTable, uuid } from "drizzle-orm/pg-core";

// rls-coverage: zero-policy by design - deliberately unscoped, see EC-2.14
export const deliberatelyOpen = pgTable(
  "deliberately_open",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
  },
  () => [],
);
`,
    );

    expect(checkRlsCoverage(fixtureDir)).toHaveLength(0);
  });

  it("does not let the escape hatch in one table's segment cover a different table", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-rls-"));
    writeFixture(
      "src/modules/example/schema.ts",
      `
import { pgTable, uuid } from "drizzle-orm/pg-core";

// rls-coverage: zero-policy by design - deliberately unscoped, see EC-2.14
export const deliberatelyOpen = pgTable(
  "deliberately_open",
  {
    id: uuid("id").primaryKey().defaultRandom(),
  },
  () => [],
);

export const shouldStillBeFlagged = pgTable(
  "should_still_be_flagged",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
  },
  () => [],
);
`,
    );

    const violations = checkRlsCoverage(fixtureDir);
    expect(violations).toHaveLength(1);
    expect(violations[0].table).toBe("should_still_be_flagged");
  });

  it("attributes the marker to the same table under CRLF line endings as under LF", () => {
    // core.autocrlf makes the Windows checkout CRLF and CI's LF; the verdict must not depend on it.
    const source = [
      'import { pgPolicy, pgTable, uuid } from "drizzle-orm/pg-core";',
      "",
      'export const policied = pgTable("policied", { householdId: uuid("household_id") }, () => [pgPolicy("p")]);',
      "",
      "// rls-coverage: zero-policy by design - probe",
      'export const marked = pgTable("marked", { householdId: uuid("household_id") }, () => []);',
      "",
    ].join("\r\n");
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/modules/example/schema.ts", source);
    expect(checkRlsCoverage(fixtureDir)).toHaveLength(0);

    // And the marker must not leak backward: with it removed, "marked" alone is flagged.
    rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/modules/example/schema.ts",
      source.replace("// rls-coverage: zero-policy by design - probe\r\n", ""),
    );
    expect(checkRlsCoverage(fixtureDir).map((v) => v.table)).toEqual(["marked"]);
  });

  it("does not count a comment that mentions household_id as declaring the column", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/modules/example/schema.ts",
      [
        'import { pgTable, uuid } from "drizzle-orm/pg-core";',
        "",
        "// No household_id here, deliberately: the limit is global (joinAttempt's shape).",
        'export const unscoped = pgTable("unscoped", { id: uuid("id") }, () => []);',
        "",
      ].join("\n"),
    );
    expect(checkRlsCoverage(fixtureDir)).toHaveLength(0);
  });

  // The real schema files, under both line endings: the Windows checkout is CRLF
  // (core.autocrlf) and CI's is LF, and the lint's verdict on the real repo must be the same on
  // both. A first per-table version passed on Windows and would have failed on CI.
  it.each(["\n", "\r\n"])("passes on the repo's real schema files with %j line endings", (eol) => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    const modulesDir = join(process.cwd(), "src", "modules");
    for (const mod of readdirSync(modulesDir)) {
      const schema = join(modulesDir, mod, "schema.ts");
      if (!existsSync(schema)) continue;
      const normalised = readFileSync(schema, "utf8").replace(/\r?\n/g, eol);
      writeFixture(`src/modules/${mod}/schema.ts`, normalised);
    }
    expect(checkRlsCoverage(fixtureDir)).toEqual([]);
  });
});
