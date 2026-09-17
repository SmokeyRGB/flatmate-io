import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";

// G-C2 (T016/T033): the application's Postgres role must not own the tables it queries —
// Postgres exempts a table's owner from RLS by default, so an owner-role connection would make
// every policy above a no-op regardless of how carefully it's written. Structural enforcement,
// not a convention: this queries live catalog metadata, not documentation.
describe("Application role is not the table owner (G-C2)", () => {
  it("app_runtime does not own application or activity_event", async () => {
    const rows = await db.execute<{ tablename: string; tableowner: string }>(
      sql`SELECT tablename, tableowner FROM pg_tables WHERE tablename IN ('application', 'activity_event')`,
    );

    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.tableowner).not.toBe("app_runtime");
    }
  });
});
