import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Copilot review fix (PR #18): the backfill must never run while the OLD partial unique index
// (which excludes only `moved_out`, not `removed`) is still live — promoting a row to `removed`
// mid-backfill would put it back inside that old index's scope and could collide with a row that
// already reused the released display_name, aborting the migration. This test reads the actual
// migration file and asserts the statement order mechanically: DROP INDEX before the backfill,
// CREATE UNIQUE INDEX after it — see drizzle/0017_resident_profile_removal_final.sql's own
// top-of-file comment for the full reasoning.
function readMigration(): string {
  const migrationPath = join(__dirname, "../../../drizzle/0017_resident_profile_removal_final.sql");
  return readFileSync(migrationPath, "utf8");
}

describe("drizzle/0017's statement order keeps the backfill outside either index's scope", () => {
  it("DROP INDEX precedes the backfill, which precedes CREATE UNIQUE INDEX", () => {
    const text = readMigration();

    const dropIndexPos = text.indexOf('DROP INDEX IF EXISTS "resident_profile_display_name_active_idx"');
    const backfillBeginPos = text.indexOf("-- backfill:begin");
    const backfillEndPos = text.indexOf("-- backfill:end");
    const createIndexPos = text.indexOf(
      'CREATE UNIQUE INDEX IF NOT EXISTS "resident_profile_display_name_active_idx"',
    );

    expect(dropIndexPos).toBeGreaterThan(-1);
    expect(backfillBeginPos).toBeGreaterThan(-1);
    expect(backfillEndPos).toBeGreaterThan(-1);
    expect(createIndexPos).toBeGreaterThan(-1);

    // The order this test falsifies: the file used to run the backfill FIRST, then DROP + CREATE
    // the index — which is exactly the ordering that lets a promoted row collide with the old
    // index while it's still live. Asserting each boundary individually (rather than one big
    // "position array is sorted" check) means a future edit that reorders only two of the four
    // markers fails on the specific pair that broke, not a single opaque assertion.
    expect(dropIndexPos).toBeLessThan(backfillBeginPos);
    expect(backfillBeginPos).toBeLessThan(backfillEndPos);
    expect(backfillEndPos).toBeLessThan(createIndexPos);
  });

  it("is falsified by the old (pre-fix) ordering: backfill, then DROP INDEX, then CREATE INDEX", () => {
    // A minimal stand-in for the historical file shape, not the real migration text — proves this
    // test's own assertions actually fail against the ordering the fix replaces, rather than
    // passing vacuously against any input.
    const oldOrderShape = [
      "-- backfill:begin",
      "UPDATE resident_profile ...",
      "-- backfill:end",
      'DROP INDEX IF EXISTS "resident_profile_display_name_active_idx";',
      'CREATE UNIQUE INDEX IF NOT EXISTS "resident_profile_display_name_active_idx" ON ...',
    ].join("\n");

    const dropIndexPos = oldOrderShape.indexOf('DROP INDEX IF EXISTS "resident_profile_display_name_active_idx"');
    const backfillBeginPos = oldOrderShape.indexOf("-- backfill:begin");

    // Under the old shape, DROP INDEX comes AFTER the backfill begins — the opposite of what the
    // fixed migration must satisfy.
    expect(dropIndexPos).toBeGreaterThan(backfillBeginPos);
  });
});
