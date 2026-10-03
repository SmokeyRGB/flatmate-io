import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMINISTRATION_PERMISSIONS,
  HOUSEHOLD_CEILING_UNTIL_CONTRACT,
  HOUSEHOLD_FLOOR_UNTIL_CONTRACT,
  HOUSEHOLD_ONLY_PERMISSIONS,
  HOUSEHOLD_PERMISSIONS,
  HOUSEHOLD_PERMISSIONS_AT_0024,
  MODERATOR_FLOOR_UNTIL_CONTRACT,
  MODERATOR_ONLY_PERMISSIONS,
  MODERATOR_ONLY_PERMISSIONS_AT_0027,
  MODERATOR_PERMISSIONS,
  RESIDENT_ONLY_PERMISSIONS,
  RESIDENT_PERMISSIONS,
  RESIDENT_PERMISSIONS_AT_0024,
  REPLACED_PERMISSIONS,
} from "@/modules/identity/schema";

// drizzle/0024, 0027 and 0029 hand-write the array literals of the role sets, because SQL cannot
// import a TypeScript constant. schema.ts builds the CHECKs from the constants; this test keeps the
// hand-written migrations honest against them (design D2, D8). Compared as SORTED SETS, so a
// reordering is harmless and a value added to one side only is not.
//
// A constraint is read from the LAST migration file (by file name) that adds it, because a later
// migration replaces it: 0027 widened the moderator CHECK that 0024 created, 0029 widened it again.
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
const MIGRATION_0029 = readMigration("0029_");

// History: the moderator set as 0024 wrote it. 0024 is applied and never edited, so its backfill
// is pinned to this frozen four-value list, not to the live constant.
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

function updatesOf(migration: string): string[] {
  return migration.split("--> statement-breakpoint").filter((stmt) => /^\s*UPDATE "membership"/.test(stmt));
}

describe("the migrations' role-set literals equal the schema.ts constants", () => {
  it("the moderator CHECK holds exactly the moderator FLOOR (0029), the four old ∩ new values", () => {
    const literals = literalsIn(constraintBody("membership_moderator_holds_role_permissions"));
    expect(literals).toEqual([sorted(MODERATOR_FLOOR_UNTIL_CONTRACT)]);
    expect(sorted(MODERATOR_FLOOR_UNTIL_CONTRACT)).toEqual(
      sorted(["manage_rooms", "create_application", "change_application_state", "reverse_application_state"]),
    );
    expect(MIGRATION_0029).toContain('ADD CONSTRAINT "membership_moderator_holds_role_permissions"');
  });

  it("the moderator-only CHECK holds exactly MODERATOR_ONLY_PERMISSIONS (0029)", () => {
    const literals = literalsIn(constraintBody("membership_moderator_only_permissions"));
    expect(literals).toEqual([sorted(MODERATOR_ONLY_PERMISSIONS)]);
    expect(sorted(MODERATOR_ONLY_PERMISSIONS)).toEqual(
      sorted(["reverse_application_state", "manage_rounds", "manage_round_participation"]),
    );
  });

  it("the household-only, administration and resident-only CHECKs hold exactly their groups", () => {
    expect(literalsIn(constraintBody("membership_household_only_permissions"))).toEqual([
      sorted(HOUSEHOLD_ONLY_PERMISSIONS),
    ]);
    expect(literalsIn(constraintBody("membership_administration_permissions"))).toEqual([
      sorted(ADMINISTRATION_PERMISSIONS),
    ]);
    expect(literalsIn(constraintBody("membership_resident_only_permissions"))).toEqual([
      sorted(RESIDENT_ONLY_PERMISSIONS),
    ]);
    expect(sorted(RESIDENT_ONLY_PERMISSIONS)).toEqual(["vote"]);
    expect(sorted(ADMINISTRATION_PERMISSIONS)).toHaveLength(6);
  });

  it("the household CHECK is a floor (manage_rooms) and a ceiling (the eight plus manage_settings), never the exact set", () => {
    const literals = literalsIn(constraintBody("membership_household_admin_holds_role_permissions"));
    expect(literals).toEqual([sorted(HOUSEHOLD_FLOOR_UNTIL_CONTRACT), sorted(HOUSEHOLD_CEILING_UNTIL_CONTRACT)]);
    expect(HOUSEHOLD_FLOOR_UNTIL_CONTRACT).toEqual(["manage_rooms"]);
    // Not the eight-value set as floor: old-code registration writes two values and would be refused.
    expect(sorted(HOUSEHOLD_FLOOR_UNTIL_CONTRACT)).not.toEqual(sorted(HOUSEHOLD_PERMISSIONS));
    // Without manage_settings in the ceiling 0029 aborts on every backfilled household row.
    expect(literals[1]).toContain("manage_settings");
    for (const p of HOUSEHOLD_PERMISSIONS) expect(literals[1]).toContain(p);
    expect(HOUSEHOLD_CEILING_UNTIL_CONTRACT).toContain("manage_settings");
  });

  it("the resident CHECK still holds exactly the empty 0024 set (0029 leaves it unchanged)", () => {
    const literals = literalsIn(constraintBody("membership_resident_holds_role_permissions"));
    expect(literals).toEqual([sorted(RESIDENT_PERMISSIONS_AT_0024)]);
    expect(RESIDENT_PERMISSIONS_AT_0024).toHaveLength(0);
  });

  it("every 0029 backfill uses the literals of its constant", () => {
    const backfills = updatesOf(MIGRATION_0029);
    expect(backfills).toHaveLength(5);
    const [household, renameRounds, renameSettings, moderator, resident] = [
      backfills[0],
      backfills[1],
      backfills[2],
      backfills[3],
      backfills[4],
    ];
    // household: the eight
    expect(literalsIn(household)).toContainEqual(sorted(HOUSEHOLD_PERMISSIONS));
    expect(household).toContain("role = 'household_admin'");
    // one rename backfill per REPLACED_PERMISSIONS entry, each limited to the roles the target allows
    expect(Object.keys(REPLACED_PERMISSIONS).sort()).toEqual(["close_round", "manage_settings"]);
    expect(literalsIn(renameRounds)).toEqual([["manage_rounds"], ["close_round"], ["manage_rounds"]]);
    expect(renameRounds).toContain("role = 'moderator'");
    expect(literalsIn(renameSettings)).toEqual([
      ["manage_voting_procedure"],
      ["manage_settings"],
      ["manage_voting_procedure"],
    ]);
    expect(renameSettings).toContain("role IN ('household_admin', 'moderator')");
    // the moderator's six: its set minus what the floor already holds and minus manage_rounds (rename)
    const six = MODERATOR_PERMISSIONS.filter(
      (p) => !MODERATOR_FLOOR_UNTIL_CONTRACT.includes(p) && p !== "manage_rounds",
    );
    expect(six).toHaveLength(6);
    expect(literalsIn(moderator)).toContainEqual(sorted(six));
    expect(moderator).toContain("role = 'moderator'");
    // vote for residents
    expect(literalsIn(resident)).toContainEqual(sorted(RESIDENT_PERMISSIONS));
    expect(resident).toContain("is_resident");
  });

  it("the history pins: 0024 backfills use the frozen old sets, 0027 the frozen moderator-only value", () => {
    const backfills = updatesOf(MIGRATION_0024);
    expect(backfills).toHaveLength(4);
    const [, moderator, household, resident] = backfills.map(literalsIn);
    expect(moderator).toContainEqual(sorted(MODERATOR_PERMISSIONS_AT_0024));
    expect(household).toContainEqual(sorted(HOUSEHOLD_PERMISSIONS_AT_0024));
    expect(resident).toContainEqual(sorted(RESIDENT_PERMISSIONS_AT_0024));
    // every literal in a backfill is one of the three frozen sets, never a stray value
    for (const literal of [...moderator, ...household, ...resident]) {
      expect([
        sorted(MODERATOR_PERMISSIONS_AT_0024),
        sorted(HOUSEHOLD_PERMISSIONS_AT_0024),
        sorted(RESIDENT_PERMISSIONS_AT_0024),
      ]).toContainEqual(literal);
    }
    const b27 = updatesOf(MIGRATION_0027);
    expect(b27).toHaveLength(1);
    const literals = literalsIn(b27[0]);
    expect(literals.length).toBeGreaterThan(0);
    for (const literal of literals) expect(literal).toEqual(sorted(MODERATOR_ONLY_PERMISSIONS_AT_0027));
  });

  it("the moderator set is the four 0024 values plus the new ones (nothing 0024 wrote is lost but close_round's name)", () => {
    for (const p of MODERATOR_FLOOR_UNTIL_CONTRACT) expect(MODERATOR_PERMISSIONS).toContain(p);
    expect(MODERATOR_PERMISSIONS).not.toContain("close_round");
    expect(MODERATOR_PERMISSIONS).toContain("manage_rounds");
  });

  it("the household set does not contain close_round (03-PRD.md §4.0.1, S-50/U-20)", () => {
    expect(HOUSEHOLD_PERMISSIONS).not.toContain("close_round");
  });

  it("0024, 0027 and 0029 contain no bound-parameter placeholder ($1): drizzle-kit drops a check() parameter", () => {
    expect(MIGRATION_0024).not.toMatch(/\$\d/);
    expect(MIGRATION_0027).not.toMatch(/\$\d/);
    expect(MIGRATION_0029).not.toMatch(/\$\d/);
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
