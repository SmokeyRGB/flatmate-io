// Before rls-coverage.ts is rewritten over getTableConfig, the regex segmenter and Drizzle's
// own table config must agree on the real schema. A disagreement means the regex path and the
// schema disagree; that is a stop, not a lint change.
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { splitIntoTableSegments } from "../../../scripts/lint/rls-coverage";

// Mirrors stripLineComments and the household_id / pgPolicy checks in rls-coverage.ts.
// Duplicated here so this test characterises the exported segmenter plus those two checks
// without depending on unexported helpers.
function regexFacts(content: string): Array<{ name: string; hasHouseholdId: boolean; hasPolicy: boolean }> {
  const facts = [];
  for (const table of splitIntoTableSegments(content)) {
    const code = table.segment.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    facts.push({
      name: table.tableName ?? table.exportName,
      hasHouseholdId: /household_id/.test(code),
      hasPolicy: /\bpgPolicy\s*\(/.test(code),
    });
  }
  return facts;
}

const KNOWN_NAMES = [
  "session",
  "room",
  "application",
  "household_settings",
  "join_code_issuance",
  "activity_event",
  "membership",
];

describe("rls-coverage regex path agrees with getTableConfig", () => {
  it("agrees table for table on the real schema files", async () => {
    const modulesDir = join(process.cwd(), "src", "modules");
    const introspected: Array<{ name: string; hasHouseholdId: boolean; policyCount: number }> = [];
    const fromRegex: Array<{ name: string; hasHouseholdId: boolean; hasPolicy: boolean }> = [];

    for (const mod of readdirSync(modulesDir)) {
      const schemaFile = join(modulesDir, mod, "schema.ts");
      if (!existsSync(schemaFile)) continue;

      fromRegex.push(...regexFacts(readFileSync(schemaFile, "utf8")));

      const moduleExports: Record<string, unknown> = await import(pathToFileURL(schemaFile).href);
      const seen = new Set<PgTable>();
      for (const value of Object.values(moduleExports)) {
        if (!is(value, PgTable) || seen.has(value)) continue;
        seen.add(value);
        const config = getTableConfig(value);
        introspected.push({
          name: config.name,
          hasHouseholdId: config.columns.some((column) => column.name === "household_id"),
          policyCount: config.policies.length,
        });
      }
    }

    const regexByName = new Map(fromRegex.map((fact) => [fact.name, fact]));
    const introByName = new Map(introspected.map((fact) => [fact.name, fact]));

    expect([...regexByName.keys()].sort()).toEqual([...introByName.keys()].sort());
    expect(introspected.map((fact) => fact.name).sort()).toEqual([...introByName.keys()].sort());

    const disagreements = [];
    for (const [name, intro] of introByName) {
      const regex = regexByName.get(name);
      if (!regex) {
        disagreements.push({ name, reason: "missing from regex path" });
        continue;
      }
      if (regex.hasHouseholdId !== intro.hasHouseholdId) {
        disagreements.push({
          name,
          reason: "household_id",
          regex: regex.hasHouseholdId,
          introspected: intro.hasHouseholdId,
        });
      }
      if (regex.hasPolicy !== intro.policyCount > 0) {
        disagreements.push({
          name,
          reason: "policy presence",
          regexHasPolicy: regex.hasPolicy,
          policyCount: intro.policyCount,
        });
      }
    }

    expect(disagreements).toEqual([]);
    for (const name of KNOWN_NAMES) {
      expect(introByName.has(name), name).toBe(true);
    }
    expect(introByName.size).toBeGreaterThanOrEqual(KNOWN_NAMES.length);
  });
});
