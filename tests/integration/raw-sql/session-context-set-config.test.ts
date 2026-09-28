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
// A dedicated `max: 1` client keeps this test on one client-side connection. Behind Supavisor's
// transaction mode that does not pin a server backend, so the test itself waits until it observes
// the backend its first transaction used. That backend reaching a second transaction is exactly
// the shape a transaction-mode pooler can hand to a DIFFERENT tenant, which is the leak this
// guards against.
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

    // Outside any transaction on the SAME client. `max: 1` pins the client-side connection only:
    // Supavisor's transaction mode hands each transaction whichever server backend is free, so
    // this retries until the pid actually matches, and never passes by luck.
    //
    // The retry is bounded by elapsed time, not by a count. It used to stop after 20 attempts,
    // which was enough on an idle pool (a match on the first attempt) but not while another suite
    // shares flatmate-io-dev (CI's verify-hosted during a pre-push run): another client's
    // transaction can hold backend A for as long as it stays open, and several tests hold one
    // for 1-1.5 s on purpose. 20 attempts at ~30 ms each gave up after ~0.6 s and failed as
    // inconclusive (CI verify-hosted runs 36354921063 and 36387423611, both while a second suite
    // ran against dev). Measured with three 1.5 s transactions held against the pool: 8 of 25
    // trials needed more than 20 attempts, and every one matched within 3 s. 15 s covers that
    // five times over and stays well inside the 60 s test budget. The short pause after a miss
    // keeps this loop from adding a burst of round trips to the pool it is waiting on.
    const retryUntil = Date.now() + 15_000;
    let pidB: number | undefined;
    let leaked: string | null = null;
    let matched = false;
    while (Date.now() < retryUntil) {
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
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    // No match within 15 s means the test is INCONCLUSIVE, not a pass — it must never claim
    // the guarantee holds without having actually observed the same backend.
    expect(matched).toBe(true);
    expect(leaked === null || leaked === "").toBe(true);
    expect(leaked).not.toBe(householdA);
  });
});
