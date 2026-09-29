import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOUSEHOLD_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  RESIDENT_PERMISSIONS,
} from "@/modules/identity/schema";

// drizzle/0024 hand-writes the array literals of the three role sets, because SQL cannot import a
// TypeScript constant. schema.ts builds the CHECKs from the constants; this test keeps the
// hand-written migration honest against them (design D2). Compared as SORTED SETS, so a reordering
// is harmless and a value added to one side only is not.
const MIGRATION = readFileSync(
  join(__dirname, "..", "..", "..", "drizzle", "0024_membership_role_integrity.sql"),
  "utf8",
);

function literalsIn(sql: string): string[][] {
  // ARRAY['a', 'b']::text[]  and  '{}'::text[]
  const out: string[][] = [];
  const re = /ARRAY\[([^\]]*)\]::text\[\]|'\{\}'::text\[\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    out.push(m[1] === undefined ? [] : [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).sort());
  }
  return out;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

// The migration's CHECK statements, one per constraint name.
function constraintBody(name: string): string {
  const m = MIGRATION.match(new RegExp(`ADD CONSTRAINT "${name}" CHECK \(([^;]*)\);`));
  if (!m) throw new Error(`constraint ${name} not found in 0024`);
  return m[1];
}

describe("drizzle/0024 role-set literals equal the schema.ts constants", () => {
  it("the moderator CHECK holds exactly MODERATOR_PERMISSIONS", () => {
    const literals = literalsIn(constraintBody("membership_moderator_holds_role_permissions"));
    expect(literals).toEqual([sorted(MODERATOR_PERMISSIONS)]);
  });

  it("the household CHECK holds exactly HOUSEHOLD_PERMISSIONS, twice (contains and contained-in)", () => {
    const literals = literalsIn(constraintBody("membership_household_admin_holds_role_permissions"));
    expect(literals).toEqual([sorted(HOUSEHOLD_PERMISSIONS), sorted(HOUSEHOLD_PERMISSIONS)]);
  });

  it("the resident CHECK holds exactly RESIDENT_PERMISSIONS", () => {
    const literals = literalsIn(constraintBody("membership_resident_holds_role_permissions"));
    expect(literals).toEqual([sorted(RESIDENT_PERMISSIONS)]);
  });

  it("every backfill uses the same literals as its constant", () => {
    const backfills = MIGRATION.split("--> statement-breakpoint").filter((stmt) => /^\s*UPDATE "membership"/.test(stmt));
    expect(backfills).toHaveLength(4);
    const [, moderator, household, resident] = backfills.map(literalsIn);
    expect(moderator).toContainEqual(sorted(MODERATOR_PERMISSIONS));
    expect(household).toContainEqual(sorted(HOUSEHOLD_PERMISSIONS));
    expect(resident).toContainEqual(sorted(RESIDENT_PERMISSIONS));
    // every literal in a backfill is one of the three sets, never a stray value
    for (const literal of [...moderator, ...household, ...resident]) {
      expect([sorted(MODERATOR_PERMISSIONS), sorted(HOUSEHOLD_PERMISSIONS), sorted(RESIDENT_PERMISSIONS)]).toContainEqual(literal);
    }
  });

  it("the household set does not contain close_round (03-PRD.md §4.0.1, S-50/U-20)", () => {
    expect(HOUSEHOLD_PERMISSIONS).not.toContain("close_round");
  });

  it("the file contains no bound-parameter placeholder ($1): drizzle-kit drops a check() parameter", () => {
    expect(MIGRATION).not.toMatch(/\$\d/);
  });
});

describe("drizzle/0023 has no bound-parameter placeholder either", () => {
  it("contains no $1", () => {
    const m0023 = readFileSync(
      join(__dirname, "..", "..", "..", "drizzle", "0023_application_capture.sql"),
      "utf8",
    );
    expect(m0023).not.toMatch(/\$\d/);
  });
});
