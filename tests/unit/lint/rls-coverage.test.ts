import { pgTable, uuid } from "drizzle-orm/pg-core";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkRlsCoverage, checkRlsCoverageOfTables } from "../../../scripts/lint/rls-coverage";

const scratchRoot = join(process.cwd(), "tests", "unit", "lint", ".tmp-fixtures");
let fixtureDir: string;

function writeFixture(relPath: string, content: string): void {
  const full = join(fixtureDir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

function freshFixture(): void {
  mkdirSync(scratchRoot, { recursive: true });
  fixtureDir = mkdtempSync(join(scratchRoot, "rls-"));
}

afterEach(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

// FR-0.2/EC-0.1/EC-0.2: every table carrying household_id needs a policy of its own. The
// check reads getTableConfig. The old marker comment is not an exemption; a table is exempt
// only when its SQL name is passed in the exemption set (ZERO_POLICY_EXEMPTIONS in production,
// empty). Calling checkRlsCoverage is async because it imports the schema — an adaptation of
// the old synchronous call, not a weaker assertion.
describe("rls-coverage lint (per-table)", () => {
  it("flags the table missing a policy, naming it, even when a sibling table has one", async () => {
    freshFixture();
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
  () => [
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

    const violations = await checkRlsCoverage(fixtureDir);
    expect(violations).toHaveLength(1);
    expect(violations[0].table).toBe("uncovered");
    expect(violations[0].file).toBe("src/modules/example/schema.ts");
  });

  it("flags a non-exported household table with no policy, even directly below a policied table", async () => {
    freshFixture();
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
  () => [
    pgPolicy("covered_household_isolation", { as: "permissive", for: "all" }),
  ],
);

const uncoveredNonExported = pgTable(
  "uncovered_non_exported",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
  },
  () => [],
);
`,
    );

    const violations = await checkRlsCoverage(fixtureDir);
    expect(violations).toHaveLength(1);
    expect(violations[0].table).toBe("uncovered_non_exported");
  });

  it("passes when every table in the file has its own policy", async () => {
    freshFixture();
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
  () => [pgPolicy("first_isolation", { as: "permissive", for: "all" })],
);

export const second = pgTable(
  "second",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
  },
  () => [pgPolicy("second_isolation", { as: "permissive", for: "all" })],
);
`,
    );

    expect(await checkRlsCoverage(fixtureDir)).toHaveLength(0);
  });

  it("does not flag a table with no household_id and no policy (join_attempt shape)", async () => {
    freshFixture();
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

    expect(await checkRlsCoverage(fixtureDir)).toHaveLength(0);
  });

  // The marker comment used to exempt a table. It no longer does: the exemption is a named
  // list, because getTableConfig cannot see the comment. This is the old escape-hatch case,
  // ported onto that list.
  it("allows a household_id table with zero policies when its name is in the exemption set", () => {
    const deliberatelyOpen = pgTable(
      "deliberately_open",
      {
        id: uuid("id").primaryKey().defaultRandom(),
        householdId: uuid("household_id").notNull(),
      },
      () => [],
    );

    expect(
      checkRlsCoverageOfTables(
        [{ file: "src/modules/example/schema.ts", table: deliberatelyOpen }],
        new Set(["deliberately_open"]),
      ),
    ).toHaveLength(0);
  });

  it("does not let one table's exemption cover a different table", () => {
    const deliberatelyOpen = pgTable(
      "deliberately_open",
      { id: uuid("id").primaryKey().defaultRandom() },
      () => [],
    );
    const shouldStillBeFlagged = pgTable(
      "should_still_be_flagged",
      {
        id: uuid("id").primaryKey().defaultRandom(),
        householdId: uuid("household_id").notNull(),
      },
      () => [],
    );

    const violations = checkRlsCoverageOfTables(
      [
        { file: "src/modules/example/schema.ts", table: deliberatelyOpen },
        { file: "src/modules/example/schema.ts", table: shouldStillBeFlagged },
      ],
      new Set(["deliberately_open"]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].table).toBe("should_still_be_flagged");
  });

  it.each(["\n", "\r\n"] as const)(
    "flags the zero-policy table under %j line endings, marker comment or not",
    async (eol) => {
      const source = [
        'import { pgPolicy, pgTable, uuid } from "drizzle-orm/pg-core";',
        "",
        'export const policied = pgTable("policied", { householdId: uuid("household_id") }, () => [pgPolicy("p")]);',
        "",
        "// rls-coverage: zero-policy by design - probe",
        'export const marked = pgTable("marked", { householdId: uuid("household_id") }, () => []);',
        "",
      ].join(eol);
      freshFixture();
      writeFixture("src/modules/example/schema.ts", source);
      expect((await checkRlsCoverage(fixtureDir)).map((v) => v.table)).toEqual(["marked"]);

      rmSync(fixtureDir, { recursive: true, force: true });
      freshFixture();
      writeFixture(
        "src/modules/example/schema.ts",
        source.replace(`// rls-coverage: zero-policy by design - probe${eol}`, ""),
      );
      expect((await checkRlsCoverage(fixtureDir)).map((v) => v.table)).toEqual(["marked"]);
    },
  );

  it("does not count a comment that mentions household_id as declaring the column", async () => {
    freshFixture();
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
    expect(await checkRlsCoverage(fixtureDir)).toHaveLength(0);
  });

  it.each(["\n", "\r\n"] as const)("passes on the repo's real schema files with %j line endings", async (eol) => {
    freshFixture();
    const modulesDir = join(process.cwd(), "src", "modules");
    // Every file next to a schema.ts, because a schema imports its siblings (./vote-values).
    for (const mod of readdirSync(modulesDir)) {
      if (!existsSync(join(modulesDir, mod, "schema.ts"))) continue;
      for (const name of readdirSync(join(modulesDir, mod))) {
        if (!name.endsWith(".ts")) continue;
        const normalised = readFileSync(join(modulesDir, mod, name), "utf8").replace(/\r?\n/g, eol);
        writeFixture(`src/modules/${mod}/${name}`, normalised);
      }
    }
    const predicates = join(process.cwd(), "src", "db", "rls-predicates.ts");
    writeFixture("src/db/rls-predicates.ts", readFileSync(predicates, "utf8").replace(/\r?\n/g, eol));
    expect(await checkRlsCoverage(fixtureDir)).toEqual([]);
  });
});
