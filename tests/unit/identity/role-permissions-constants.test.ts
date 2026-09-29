import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOUSEHOLD_PERMISSIONS,
  MODERATOR_ONLY_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  RESIDENT_PERMISSIONS,
} from "@/modules/identity/schema";

// drizzle/0024 (and 0027 for the moderator sets) hand-write the array literals of the role sets,
// because SQL cannot import a TypeScript constant. schema.ts builds the CHECKs from the constants;
// this test keeps the hand-written migrations honest against them (design D2, D8). Compared as
// SORTED SETS, so a reordering is harmless and a value added to one side only is not.
//
// A constraint is read from the LAST migration file (by file name) that adds it, because a later
// migration replaces it: 0027 widened the moderator CHECK that 0024 created.
const DRIZZLE_DIR = join(__dirname, "..", "..", "..", "drizzle");
const MIGRATION_FILES = readdirSync(DRIZZLE_DIR)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

function readMigration(prefix: string): string {
  const file = MIGRATION_FILES.find((f) => f.startsWith(prefix));
  if (!file) throw new Error(`migration ${prefix} not found`);
  return readFileSync(join(DRIZZLE_DIR, file), "utf8");
}

const MIGRATION_0024 = readMigration("0024_");
const MIGRATION_0027 = readMigration("0027_");

// History: the moderator set as 0024 wrote it. 0024 is applied and never edited, so its backfill
// is pinned to this frozen four-value list, not to the live constant (0027 added the fifth).
const MODERATOR_PERMISSIONS_AT_0024 = [
  "manage_rooms",
  "close_round",
  "create_application",
  "change_application_state",
] as const;

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

// The migration's CHECK statement for one constraint name, from the last file that adds it.
function constraintBody(name: string): string {
  const re = new RegExp(`ADD CONSTRAINT "${name}" CHECK (([^;]*));`);
  for (const file of [...MIGRATION_FILES].reverse()) {
    const m = readFileSync(join(DRIZZLE_DIR, file), "utf8").match(re);
    if (m) return m[1];
  }
  throw new Error(`constraint ${name} not found in any migration`);
}

describe("the migrations' role-set literals equal the schema.ts constants", () => {
  it("the moderator CHECK holds exactly MODERATOR_PERMISSIONS", () => {
    const literals = literalsIn(constraintBody("membership_moderator_holds_role_permissions"));
    expect(literals).toEqual([sorted(MODERATOR_PERMISSIONS)]);
  });

  it("the moderator-only CHECK holds exactly MODERATOR_ONLY_PERMISSIONS (0027)", () => {
    const literals = literalsIn(constraintBody("membership_moderator_only_permissions"));
    expect(literals).toEqual([sorted(MODERATOR_ONLY_PERMISSIONS)]);
  });

  it("the moderator CHECK comes from 0027, not 0024", () => {
    expect(MIGRATION_0027).toContain('ADD CONSTRAINT "membership_moderator_holds_role_permissions"');
  });

  it("the household CHECK holds exactly HOUSEHOLD_PERMISSIONS, twice (contains and contained-in)", () => {
    const literals = literalsIn(constraintBody("membership_household_admin_holds_role_permissions"));
    expect(literals).toEqual([sorted(HOUSEHOLD_PERMISSIONS), sorted(HOUSEHOLD_PERMISSIONS)]);
  });

  it("the resident CHECK holds exactly RESIDENT_PERMISSIONS", () => {
    const literals = literalsIn(constraintBody("membership_resident_holds_role_permissions"));
    expect(literals).toEqual([sorted(RESIDENT_PERMISSIONS)]);
  });

  it("every 0024 backfill uses the same literals as its constant (the moderator one frozen at 0024)", () => {
    const backfills = MIGRATION_0024.split("--> statement-breakpoint").filter((stmt) => /^\s*UPDATE "membership"/.test(stmt));
    expect(backfills).toHaveLength(4);
    const [, moderator, household, resident] = backfills.map(literalsIn);
    expect(moderator).toContainEqual(sorted(MODERATOR_PERMISSIONS_AT_0024));
    expect(household).toContainEqual(sorted(HOUSEHOLD_PERMISSIONS));
    expect(resident).toContainEqual(sorted(RESIDENT_PERMISSIONS));
    // every literal in a backfill is one of the three sets, never a stray value
    for (const literal of [...moderator, ...household, ...resident]) {
      expect([sorted(MODERATOR_PERMISSIONS_AT_0024), sorted(HOUSEHOLD_PERMISSIONS), sorted(RESIDENT_PERMISSIONS)]).toContainEqual(literal);
    }
  });

  it("the 0027 backfill uses MODERATOR_ONLY_PERMISSIONS and nothing else", () => {
    const backfills = MIGRATION_0027.split("--> statement-breakpoint").filter((stmt) => /^\s*UPDATE "membership"/.test(stmt));
    expect(backfills).toHaveLength(1);
    const literals = literalsIn(backfills[0]);
    expect(literals.length).toBeGreaterThan(0);
    for (const literal of literals) expect(literal).toEqual(sorted(MODERATOR_ONLY_PERMISSIONS));
  });

  it("the moderator set is the four 0024 values plus the moderator-only ones", () => {
    expect(sorted(MODERATOR_PERMISSIONS)).toEqual(
      sorted([...MODERATOR_PERMISSIONS_AT_0024, ...MODERATOR_ONLY_PERMISSIONS]),
    );
  });

  it("the household set does not contain close_round (03-PRD.md §4.0.1, S-50/U-20)", () => {
    expect(HOUSEHOLD_PERMISSIONS).not.toContain("close_round");
  });

  it("0024 and 0027 contain no bound-parameter placeholder ($1): drizzle-kit drops a check() parameter", () => {
    expect(MIGRATION_0024).not.toMatch(/\$\d/);
    expect(MIGRATION_0027).not.toMatch(/\$\d/);
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
