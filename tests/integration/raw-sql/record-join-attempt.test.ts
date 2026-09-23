import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";

// M3 (P1): record_join_attempt (drizzle/0014_join_attempt.sql) is SECURITY DEFINER and, before
// this file, was only exercised under tests/integration/policy/join-rate-limit.test.ts — the G-C7
// raw-SQL half (the only place a leak PAST the TypeScript repository layer would be caught) had no
// coverage. This calls the function directly by raw SQL as app_runtime, with its own small
// window/limit arguments (the function takes them as parameters — this is not a hardcoded
// production constant), and separately asserts app_runtime's own access to the underlying table
// is exactly what design.md Decision 3 says it should be: none, direct or otherwise.
//
// join_attempt cannot go through tests/helpers/identity.ts's cleanup (it has no household_id, see
// identity/schema.ts's own comment on that table), and — this test's third case demonstrates why
// — app_runtime itself has no DELETE access to it either. Teardown uses the Supabase service-role
// client instead (bypasses RLS as Postgres role `service_role`), exactly like
// join-rate-limit.test.ts, and every source hash here is unique per test so no test can pollute
// another's window.
function serviceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const sourceHashesToClean: string[] = [];

afterEach(async () => {
  if (sourceHashesToClean.length > 0) {
    await serviceRoleClient().from("join_attempt").delete().in("source_hash", sourceHashesToClean);
  }
  sourceHashesToClean.length = 0;
});

async function callRecordJoinAttempt(sourceHash: string, windowSeconds: number, limit: number) {
  const rows = await db.execute<{ record_join_attempt: boolean }>(
    sql`SELECT record_join_attempt(${sourceHash}, ${windowSeconds}, ${limit}) AS record_join_attempt`,
  );
  return rows[0].record_join_attempt;
}

describe("record_join_attempt — raw SQL (M3/P1)", () => {
  it("returns true under the limit and false at the limit, for one source hash", async () => {
    const sourceHash = `test-definer-coverage-${randomUUID()}`;
    sourceHashesToClean.push(sourceHash);

    expect(await callRecordJoinAttempt(sourceHash, 60, 2)).toBe(true);
    expect(await callRecordJoinAttempt(sourceHash, 60, 2)).toBe(true);
    // The 3rd attempt against a limit of 2 is refused — every attempt is recorded, including
    // refused ones (design.md Decision 3), so this call itself also counts.
    expect(await callRecordJoinAttempt(sourceHash, 60, 2)).toBe(false);
  });

  it("a different source hash is unaffected by another source's count", async () => {
    const sourceHashA = `test-definer-coverage-a-${randomUUID()}`;
    const sourceHashB = `test-definer-coverage-b-${randomUUID()}`;
    sourceHashesToClean.push(sourceHashA, sourceHashB);

    expect(await callRecordJoinAttempt(sourceHashA, 60, 2)).toBe(true);
    expect(await callRecordJoinAttempt(sourceHashA, 60, 2)).toBe(true);
    expect(await callRecordJoinAttempt(sourceHashA, 60, 2)).toBe(false); // A now exhausted

    // B's own counter starts fresh — A's exhaustion has no effect on it.
    expect(await callRecordJoinAttempt(sourceHashB, 60, 2)).toBe(true);
  });

  it("app_runtime cannot read join_attempt directly — a raw SELECT returns zero rows (RLS enabled, zero policies)", async () => {
    const sourceHash = `test-definer-coverage-read-${randomUUID()}`;
    sourceHashesToClean.push(sourceHash);
    await callRecordJoinAttempt(sourceHash, 60, 2); // the row exists — service_role can see it via teardown

    const rows = await db.execute<{ id: string }>(
      sql`SELECT id FROM join_attempt WHERE source_hash = ${sourceHash}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("app_runtime cannot insert into join_attempt directly — a raw INSERT is refused (RLS enabled, zero policies)", async () => {
    const sourceHash = `test-definer-coverage-insert-${randomUUID()}`;
    // Pushed for cleanup on the off chance RLS is ever loosened and this insert starts landing —
    // the assertion below is what actually proves it does not, today.
    sourceHashesToClean.push(sourceHash);

    await expect(
      db.execute(sql`INSERT INTO join_attempt (source_hash) VALUES (${sourceHash})`),
    ).rejects.toThrow();
  });
});
