// The regex segmenter and getTableConfig were compared before the segmenter was removed.
// They agreed on all 13 exported tables (household_id presence, and pgPolicy presence versus
// policyCount > 0), including session, room, application, household_settings, join_code_issuance,
// activity_event, and membership. This test locks that agreed shape. A later schema change that
// adds a household_id column or a policy has to update the snapshot in the same commit.
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const AGREED = [
  { name: "account", hasHouseholdId: true, policyCount: 1 },
  { name: "activity_event", hasHouseholdId: true, policyCount: 4 },
  { name: "application", hasHouseholdId: true, policyCount: 2 },
  { name: "casting_round", hasHouseholdId: true, policyCount: 1 },
  { name: "household", hasHouseholdId: false, policyCount: 1 },
  { name: "household_settings", hasHouseholdId: true, policyCount: 1 },
  { name: "join_attempt", hasHouseholdId: false, policyCount: 0 },
  { name: "join_code_issuance", hasHouseholdId: true, policyCount: 1 },
  { name: "membership", hasHouseholdId: true, policyCount: 1 },
  { name: "resident_profile", hasHouseholdId: true, policyCount: 1 },
  { name: "room", hasHouseholdId: true, policyCount: 1 },
  { name: "round_participation", hasHouseholdId: true, policyCount: 1 },
  { name: "session", hasHouseholdId: true, policyCount: 1 },
];

describe("rls-coverage schema shape agreed by the regex path and getTableConfig", () => {
  it("still matches the agreed table facts", async () => {
    const modulesDir = join(process.cwd(), "src", "modules");
    const rows: Array<{ name: string; hasHouseholdId: boolean; policyCount: number }> = [];

    for (const mod of readdirSync(modulesDir)) {
      const schemaFile = join(modulesDir, mod, "schema.ts");
      if (!existsSync(schemaFile)) continue;
      const moduleExports: Record<string, unknown> = await import(pathToFileURL(schemaFile).href);
      const seen = new Set<PgTable>();
      for (const value of Object.values(moduleExports)) {
        if (!is(value, PgTable) || seen.has(value)) continue;
        seen.add(value);
        const config = getTableConfig(value);
        rows.push({
          name: config.name,
          hasHouseholdId: config.columns.some((column) => column.name === "household_id"),
          policyCount: config.policies.length,
        });
      }
    }

    expect(rows.sort((a, b) => a.name.localeCompare(b.name))).toEqual(AGREED);
  });
});
