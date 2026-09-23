import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAME_RELEASING_STATUSES } from "@/modules/identity/transitions";

// design.md Decision 4: "the schema comment names the constant, and a unit test asserts the
// index's WHERE text lists exactly its members" — SQL can't import a TS constant, so this test is
// the mechanism that keeps schema.ts's partial index, drizzle/0017's rebuilt copy of it, and
// transitions.ts's NAME_RELEASING_STATUSES from drifting apart silently.
function extractNotInStatuses(sourceText: string, indexName: string): string[] {
  // Finds `status NOT IN ('a', 'b')` on the same statement as the given index name, tolerant of
  // either drizzle's generated SQL (double-quoted identifiers) or the schema.ts template literal.
  const indexPos = sourceText.indexOf(indexName);
  if (indexPos === -1) {
    throw new Error(`Index name "${indexName}" not found in the given source text`);
  }
  const afterIndex = sourceText.slice(indexPos);
  const match = afterIndex.match(/status\s+NOT IN\s*\(([^)]+)\)/i);
  if (!match) {
    throw new Error(`No "status NOT IN (...)" clause found after "${indexName}"`);
  }
  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
}

describe("NAME_RELEASING_STATUSES stays in sync with the partial unique index text", () => {
  it("schema.ts's index predicate lists exactly NAME_RELEASING_STATUSES", () => {
    const schemaPath = join(__dirname, "../../../src/modules/identity/schema.ts");
    const schemaText = readFileSync(schemaPath, "utf8");
    const statuses = extractNotInStatuses(schemaText, "resident_profile_display_name_active_idx");
    expect(new Set(statuses)).toEqual(new Set(NAME_RELEASING_STATUSES));
  });

  it("drizzle/0017's rebuilt index predicate lists exactly NAME_RELEASING_STATUSES", () => {
    const migrationPath = join(__dirname, "../../../drizzle/0017_resident_profile_removal_final.sql");
    const migrationText = readFileSync(migrationPath, "utf8");
    const statuses = extractNotInStatuses(migrationText, "resident_profile_display_name_active_idx");
    expect(new Set(statuses)).toEqual(new Set(NAME_RELEASING_STATUSES));
  });

  it("NAME_RELEASING_STATUSES itself is exactly moved_out and removed", () => {
    expect(new Set(NAME_RELEASING_STATUSES)).toEqual(new Set(["moved_out", "removed"]));
  });
});
