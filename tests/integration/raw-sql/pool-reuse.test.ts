import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { uuid } from "../../helpers/uuid";

// GUARDRAIL: G-C8 — siehe GUARDRAILS.md
// [GUARDED] G-D10/AC-0.7: two households' requests run sequentially over the SAME physical
// connection (a dedicated pool with max: 1 forces reuse); the second must see nothing set by the
// first. This is the empirical proof research.md §1 says FR-0.3/FR-0.4's SET LOCAL discipline
// requires before it can be trusted as the sole defense under a transaction-mode pooler.
describe("[GUARDED] Pool-reuse leak (G-D10/AC-0.7)", () => {
  it("does not leak session context across two households sharing one physical connection", async () => {
    const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    const db = drizzle(client);
    const householdA = uuid();

    try {
      // Household A's transaction sets context, then COMMITs — SET LOCAL's scope ends there.
      await db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.household_id = '${householdA}'`));
      });

      // Household B's transaction, over the same physical connection (pool max: 1, so this is
      // guaranteed to be the same connection A just used). Sets nothing itself; if A's SET LOCAL
      // had leaked past COMMIT, current_setting would still report householdA here.
      const leaked = await db.transaction(async (tx) => {
        const result = await tx.execute<{ value: string | null }>(
          sql`SELECT current_setting('app.household_id', true) AS value`,
        );
        return result[0]?.value ?? null;
      });

      expect(leaked).not.toBe(householdA);
      expect(leaked === null || leaked === "").toBe(true);
    } finally {
      await client.end();
    }
  });
});
