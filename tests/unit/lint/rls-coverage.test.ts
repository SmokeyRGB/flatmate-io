import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
});
