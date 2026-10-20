// F3 `application-deletion` (FR-3.18, G-D4, G-E5), design D5: every table that declares an
// `application_id` column must be deleted by `deleteApplication`, which walks
// APPLICATION_DEPENDENT_TABLES. With no foreign keys nothing cascades, so a later table (Veto,
// CastingNote, ...) would silently survive its application until this test names it. The sibling of
// cleanup-inventory.test.ts, reading the schemas with the same parser (tests/helpers/schema-tables.ts).
//
// A column that a hand-written migration adds without touching schema.ts is caught by
// tests/integration/schema/data-inventory-live.test.ts instead.
//
// Breaks (seen failing): remove "vote" from APPLICATION_DEPENDENT_TABLES -> (a) fails naming `vote`;
// add a bogus "veto" -> (a) fails naming it.
import { describe, expect, it } from "vitest";
import { APPLICATION_DEPENDENT_TABLES } from "@/modules/casting/schema";
import { parseSchemaTables, parseSchemaText } from "../../helpers/schema-tables";

const HINT =
  "A table that references an application must name the column `application_id` (uuid) and be " +
  "added to APPLICATION_DEPENDENT_TABLES in src/modules/casting/schema.ts, so deleteApplication removes its rows.";

// The pure comparison, so the positive control can run it on synthetic text.
function inventoryProblems(tables: ReturnType<typeof parseSchemaTables>, listed: readonly string[]): string[] {
  const problems: string[] = [];
  const declaring = tables.filter((t) => t.declaresApplicationId);
  for (const t of declaring) {
    if (!listed.includes(t.name)) problems.push(`${t.name} (${t.moduleFile}) declares application_id but is not deleted`);
  }
  for (const name of listed) {
    const t = tables.find((x) => x.name === name);
    if (!t || !t.declaresApplicationId) problems.push(`${name} is listed but no schema declares application_id on it`);
    else if (!t.hasHouseholdId) problems.push(`${name} is listed but declares no household_id, which the delete predicate uses`);
  }
  return problems;
}

describe("application-deletion inventory (FR-3.18, G-D4)", () => {
  const tables = parseSchemaTables();

  it("every table declaring application_id is in APPLICATION_DEPENDENT_TABLES, and none is stale (a, b)", () => {
    expect(inventoryProblems(tables, APPLICATION_DEPENDENT_TABLES), HINT).toEqual([]);
  });

  it("finds the known dependent table (parse sanity)", () => {
    expect(tables.filter((t) => t.declaresApplicationId).map((t) => t.name)).toContain("vote");
  });

  // (c) Not vacuous: the same comparison on synthetic schema text, so a parser that finds nothing
  // cannot pass the real case.
  it("catches an unlisted table, a stale entry and a table without household_id (synthetic text)", () => {
    const text = `
      // a comment that names "application_id" and uuid("application_id") is not a table
      export const veto = pgTable(
        "veto",
        {
          householdId: uuid("household_id").notNull(),
          applicationId: uuid("application_id").notNull(),
        },
      );
      export const note = pgTable("note", { applicationId: uuid("application_id") });
      export const other = pgTable("other", { householdId: uuid("household_id") });
    `;
    const synthetic = parseSchemaText(text, "src/modules/x/schema.ts");
    expect(synthetic.filter((t) => t.declaresApplicationId).map((t) => t.name)).toEqual(["veto", "note"]);
    expect(inventoryProblems(synthetic, [])).toEqual([
      "veto (src/modules/x/schema.ts) declares application_id but is not deleted",
      "note (src/modules/x/schema.ts) declares application_id but is not deleted",
    ]);
    expect(inventoryProblems(synthetic, ["veto", "gone", "note"])).toEqual([
      "gone is listed but no schema declares application_id on it",
      "note is listed but declares no household_id, which the delete predicate uses",
    ]);
    expect(inventoryProblems(synthetic, ["veto", "note", "other"])).toContain(
      "other is listed but no schema declares application_id on it",
    );
  });
});
