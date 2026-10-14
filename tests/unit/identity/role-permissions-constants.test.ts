import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMINISTRATION_PERMISSIONS,
  HOUSEHOLD_ONLY_PERMISSIONS,
  HOUSEHOLD_PERMISSIONS,
  MODERATOR_ONLY_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  PERMISSIONS,
  RESIDENT_ONLY_PERMISSIONS,
  RESIDENT_PERMISSIONS,
} from "@/modules/identity/schema";

// drizzle/0024, 0027, 0029 and 0037 hand-write the array literals of the role sets, because SQL
// cannot import a TypeScript constant. schema.ts builds the CHECKs from the constants; this test
// keeps the hand-written migrations honest against them (design D2, D8). Compared as SORTED SETS, so
// a reordering is harmless and a value added to one side only is not.
//
// A constraint is read from the LAST migration file (by file name) that adds it, because a later
// migration replaces it: 0027 widened the moderator CHECK that 0024 created, 0029 widened it again,
// 0037 made it the whole set. The live constants are compared against that last file (0037 today);
// the history of 0024/0027/0029 is pinned to frozen literals declared in this test, since those files
// are applied and never edited and schema.ts no longer carries them.
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
const MIGRATION_0037 = readMigration("0037_");

// History: the sets as 0024, 0027 and 0029 wrote them, frozen.
const MODERATOR_PERMISSIONS_AT_0024 = [
  "manage_rooms",
  "close_round",
  "create_application",
  "change_application_state",
] as const;
const HOUSEHOLD_PERMISSIONS_AT_0024 = ["manage_rooms", "manage_settings"] as const;
const RESIDENT_PERMISSIONS_AT_0024: readonly string[] = [];
const MODERATOR_ONLY_PERMISSIONS_AT_0027 = ["reverse_application_state"] as const;
// 0029 (expand): the lower bounds old code still wrote, and the sets it backfilled.
const MODERATOR_FLOOR_AT_0029 = [
  "manage_rooms",
  "create_application",
  "change_application_state",
  "reverse_application_state",
] as const;
const MODERATOR_ONLY_AT_0029 = ["reverse_application_state", "manage_rounds", "manage_round_participation"] as const;
const ADMINISTRATION_AT_0029 = [
  "manage_voting_procedure",
  "manage_join_codes",
  "create_resident_profile",
  "appoint_moderator",
  "manage_members",
  "export_subject_access",
] as const;
const HOUSEHOLD_AT_0029 = [
  "manage_voting_procedure",
  "manage_rooms",
  "manage_join_codes",
  "create_resident_profile",
  "appoint_moderator",
  "manage_members",
  "export_subject_access",
  "issue_password_reset_link",
] as const;
const HOUSEHOLD_FLOOR_AT_0029 = ["manage_rooms"] as const;
const HOUSEHOLD_CEILING_AT_0029 = [...HOUSEHOLD_AT_0029, "manage_settings"] as const;
const MODERATOR_SIX_AT_0029 = [
  "manage_join_codes",
  "create_resident_profile",
  "appoint_moderator",
  "manage_members",
  "export_subject_access",
  "manage_round_participation",
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

// The same, from one named migration file (the history pins).
function constraintBodyIn(migration: string, name: string): string {
  const m = migration.match(new RegExp(`ADD CONSTRAINT "${name}" CHECK (([^;]*));`));
  if (!m) throw new Error(`constraint ${name} not in that migration`);
  return m[1];
}

function updatesOf(migration: string): string[] {
  return migration.split("--> statement-breakpoint").filter((stmt) => /^\s*UPDATE "membership"/.test(stmt));
}

describe("the live CHECKs (drizzle/0037) hold exactly the schema.ts constants", () => {
  it("the moderator CHECK holds exactly the moderator set, all eleven", () => {
    expect(literalsIn(constraintBody("membership_moderator_holds_role_permissions"))).toEqual([
      sorted(MODERATOR_PERMISSIONS),
    ]);
    expect(MODERATOR_PERMISSIONS).toHaveLength(11);
    expect(constraintBodyIn(MIGRATION_0037, "membership_moderator_holds_role_permissions")).toBeDefined();
  });

  it("the household CHECK is exact: the eight as floor and as ceiling", () => {
    const literals = literalsIn(constraintBody("membership_household_admin_holds_role_permissions"));
    expect(literals).toEqual([sorted(HOUSEHOLD_PERMISSIONS), sorted(HOUSEHOLD_PERMISSIONS)]);
    expect(HOUSEHOLD_PERMISSIONS).toHaveLength(8);
    expect(HOUSEHOLD_PERMISSIONS).not.toContain("manage_settings");
  });

  it("the resident CHECK requires exactly vote", () => {
    expect(literalsIn(constraintBody("membership_resident_holds_role_permissions"))).toEqual([
      sorted(RESIDENT_PERMISSIONS),
    ]);
    expect(sorted(RESIDENT_PERMISSIONS)).toEqual(["vote"]);
  });

  it("the moderator-only, household-only, administration and resident-only CHECKs hold exactly their groups", () => {
    expect(literalsIn(constraintBody("membership_moderator_only_permissions"))).toEqual([
      sorted(MODERATOR_ONLY_PERMISSIONS),
    ]);
    expect(sorted(MODERATOR_ONLY_PERMISSIONS)).toEqual(
      sorted([
        "reverse_application_state",
        "manage_rounds",
        "manage_round_participation",
        "create_application",
        "change_application_state",
      ]),
    );
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
    expect(sorted(ADMINISTRATION_PERMISSIONS)).toHaveLength(7);
    expect(ADMINISTRATION_PERMISSIONS).toContain("manage_rooms");
  });

  it("the declared-names CHECK holds exactly the fourteen declared permissions", () => {
    expect(literalsIn(constraintBody("membership_declared_permissions"))).toEqual([sorted(Object.keys(PERMISSIONS))]);
    expect(Object.keys(PERMISSIONS)).toHaveLength(14);
    expect(Object.keys(PERMISSIONS)).not.toContain("close_round");
    expect(Object.keys(PERMISSIONS)).not.toContain("manage_settings");
  });
});

describe("drizzle/0037's data statements use the literals of the constants", () => {
  const updates = updatesOf(MIGRATION_0037);
  const [carryOver, household, moderator, resident, strip, plainMember] = updates;

  it("has the six UPDATE statements, in order", () => {
    expect(updates).toHaveLength(6);
  });

  it("carries manage_settings over to manage_voting_procedure for live moderators", () => {
    expect(literalsIn(carryOver)).toEqual([["manage_voting_procedure"], ["manage_settings"], ["manage_voting_procedure"]]);
    expect(carryOver).toContain("role = 'moderator'");
  });

  it("backfills the household eight, the moderator eleven and vote for live residents", () => {
    expect(literalsIn(household)).toContainEqual(sorted(HOUSEHOLD_PERMISSIONS));
    expect(household).toContain("role = 'household_admin'");
    expect(literalsIn(moderator)).toContainEqual(sorted(MODERATOR_PERMISSIONS));
    expect(moderator).toContain("role = 'moderator'");
    expect(literalsIn(resident)).toContainEqual(sorted(RESIDENT_PERMISSIONS));
    expect(resident).toContain("is_resident");
  });

  it("strips every undeclared name from every row, and reduces live plain members to vote", () => {
    expect(literalsIn(strip)).toContainEqual(sorted(Object.keys(PERMISSIONS)));
    expect(literalsIn(plainMember)).toContainEqual(sorted(RESIDENT_PERMISSIONS));
    expect(plainMember).toContain("role = 'member'");
  });

  it("the report counts use the same literals", () => {
    const report = MIGRATION_0037.split("--> statement-breakpoint").find((stmt) => /^\s*DO \$\$/m.test(stmt)) ?? "";
    const literals = literalsIn(report);
    expect(literals).toContainEqual(sorted(HOUSEHOLD_PERMISSIONS));
    expect(literals).toContainEqual(sorted(MODERATOR_PERMISSIONS));
    expect(literals).toContainEqual(sorted(Object.keys(PERMISSIONS)));
    expect(literals).toContainEqual(["close_round", "manage_settings"]);
    expect((report.match(/RAISE NOTICE/g) ?? []).length).toBe(5);
  });

  // The replay test (raw-sql/role-permissions-contract.test.ts) redirects only the quoted name
  // "membership" to a scratch table. An unquoted reference would hit the real table, scoped by RLS
  // to an empty household, and pass silently (design D3).
  it("every non-comment line that names the table quotes it", () => {
    const code = MIGRATION_0037.split(/\r?\n/).filter((line) => !line.trimStart().startsWith("--"));
    for (const line of code) {
      expect(line.replaceAll('"membership"', ""), line).not.toMatch(/\bmembership\b/);
    }
    expect(code.join("\n")).toContain('"membership"');
  });
});

describe("the history of 0024, 0027 and 0029 stays pinned to frozen literals", () => {
  it("0029's CHECKs hold the frozen expand-era bounds", () => {
    const at29 = (name: string) => literalsIn(constraintBodyIn(MIGRATION_0029, name));
    expect(at29("membership_moderator_holds_role_permissions")).toEqual([sorted(MODERATOR_FLOOR_AT_0029)]);
    expect(at29("membership_moderator_only_permissions")).toEqual([sorted(MODERATOR_ONLY_AT_0029)]);
    expect(at29("membership_administration_permissions")).toEqual([sorted(ADMINISTRATION_AT_0029)]);
    expect(at29("membership_household_only_permissions")).toEqual([["issue_password_reset_link"]]);
    expect(at29("membership_resident_only_permissions")).toEqual([["vote"]]);
    expect(at29("membership_household_admin_holds_role_permissions")).toEqual([
      sorted(HOUSEHOLD_FLOOR_AT_0029),
      sorted(HOUSEHOLD_CEILING_AT_0029),
    ]);
  });

  it("every 0029 backfill uses its frozen literals", () => {
    const backfills = updatesOf(MIGRATION_0029);
    expect(backfills).toHaveLength(5);
    const [household, renameRounds, renameSettings, moderator, resident] = backfills;
    expect(literalsIn(household)).toContainEqual(sorted(HOUSEHOLD_AT_0029));
    expect(household).toContain("role = 'household_admin'");
    expect(literalsIn(renameRounds)).toEqual([["manage_rounds"], ["close_round"], ["manage_rounds"]]);
    expect(renameRounds).toContain("role = 'moderator'");
    expect(literalsIn(renameSettings)).toEqual([
      ["manage_voting_procedure"],
      ["manage_settings"],
      ["manage_voting_procedure"],
    ]);
    expect(renameSettings).toContain("role IN ('household_admin', 'moderator')");
    expect(literalsIn(moderator)).toContainEqual(sorted(MODERATOR_SIX_AT_0029));
    expect(moderator).toContain("role = 'moderator'");
    expect(literalsIn(resident)).toContainEqual(["vote"]);
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

  it("the moderator set keeps the four values 0029 required, and no retired name", () => {
    for (const p of MODERATOR_FLOOR_AT_0029) expect(MODERATOR_PERMISSIONS).toContain(p);
    expect(MODERATOR_PERMISSIONS).not.toContain("close_round");
    expect(MODERATOR_PERMISSIONS).toContain("manage_rounds");
  });

  it("the household set does not contain close_round (03-PRD.md §4.0.1, S-50/U-20)", () => {
    expect(HOUSEHOLD_PERMISSIONS).not.toContain("close_round");
  });

  it("0024, 0027, 0029 and 0037 contain no bound-parameter placeholder ($1): drizzle-kit drops a check() parameter", () => {
    expect(MIGRATION_0024).not.toMatch(/\$\d/);
    expect(MIGRATION_0027).not.toMatch(/\$\d/);
    expect(MIGRATION_0029).not.toMatch(/\$\d/);
    expect(MIGRATION_0037).not.toMatch(/\$\d/);
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
