import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { withSessionContextOn } from "../../../src/db/session-context";
import { uuid } from "../../helpers/uuid";

// design.md D9: G-D10's pool-leak guarantee, exercised through the REAL mechanism
// (applySessionContext / one set_config statement) rather than pool-reuse.test.ts's own hand-
// written `SET LOCAL` — pool-reuse.test.ts ([GUARDED], G-D10) stays byte-identical; this is its
// sibling for the new code path.
//
// A dedicated `max: 1` client forces every transaction here onto the SAME physical connection —
// exactly the shape a transaction-mode pooler (Supavisor) can hand to a DIFFERENT tenant between
// transactions, which is the leak this guards against.
describe("[GUARDED] session context set_config pool-reuse (G-D10, sibling of pool-reuse.test.ts)", () => {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const db = drizzle(client);

  afterEach(async () => {
    // Net beneath the test itself: a failed assertion must never leave a stray session-wide
    // setting on this pinned connection for the next test (or the next tenant) to inherit.
    await client.unsafe("RESET app.household_id");
  });

  afterAll(async () => {
    await client.end();
  });

  it("never leaks app.household_id set via withSessionContextOn past COMMIT", async () => {
    const householdA = uuid();

    // Household A's transaction, through the real mechanism, records which physical backend it
    // ran on.
    const pidA = await withSessionContextOn(
      db as unknown as Parameters<typeof withSessionContextOn>[0],
      { accountId: uuid(), householdId: householdA, profileId: null },
      async (tx) => {
        const result = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
        return result[0]?.pid;
      },
    );

    // Outside any transaction on the SAME client (pool max: 1 guarantees the same physical
    // connection — Supavisor's transaction mode may still have handed it elsewhere in principle,
    // so this retries until the pid actually matches, and never passes by luck).
    let pidB: number | undefined;
    let leaked: string | null = null;
    let matched = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      // Reads the setting and clears it in ONE statement, so both run on the same server
      // connection. Supavisor's transaction mode may route a separate RESET to a different
      // backend, which would leave a leaked value behind on the shared dev database. '' is the
      // value a pooled connection normally holds after a SET LOCAL has ended (drizzle/0018).
      const result = await db.execute<{ pid: number; value: string | null }>(
        sql`SELECT pg_backend_pid() AS pid,
                   current_setting('app.household_id', true) AS value,
                   set_config('app.household_id', '', false) AS cleared`,
      );
      pidB = result[0]?.pid;
      leaked = result[0]?.value ?? null;
      if (pidB === pidA) {
        matched = true;
        break;
      }
    }

    // No match after 20 attempts means the test is INCONCLUSIVE, not a pass — it must never claim
    // the guarantee holds without having actually observed the same backend.
    expect(matched).toBe(true);
    expect(leaked === null || leaked === "").toBe(true);
    expect(leaked).not.toBe(householdA);
  });
});
