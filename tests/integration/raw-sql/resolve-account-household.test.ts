import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";
import { uuid } from "../../helpers/uuid";

// M3 (P1): resolve_account_household (drizzle/0005_identity_login_bootstrap_function.sql) is the
// FIRST deliberate hole in this project's RLS wall — SECURITY DEFINER, called with no session
// context at all (that is exactly the bootstrap problem it exists to solve: sign-in needs
// household_id before household_id can be set). It had no test naming it by name before this file
// — the "definer coverage" lint (scripts/lint/definer-coverage.ts) fails on that gap; this closes
// it, called by raw SQL as app_runtime, exactly as signIn's own resolveAccountHousehold does
// (identity/repository.ts).
let hh: TestHousehold | undefined;

afterEach(async () => {
  await cleanupAll(hh?.cleanup());
  hh = undefined;
});

describe("resolve_account_household — raw SQL (M3/P1)", () => {
  it("returns the account's own household id for a real account", async () => {
    hh = await registerTestHousehold();

    const rows = await db.execute<{ household_id: string | null }>(
      sql`SELECT resolve_account_household(${hh.accountId}::uuid) AS household_id`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].household_id).toBe(hh.householdId);
  });

  it("returns NULL for an account id that does not exist", async () => {
    const unknownAccountId = uuid();

    const rows = await db.execute<{ household_id: string | null }>(
      sql`SELECT resolve_account_household(${unknownAccountId}::uuid) AS household_id`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].household_id).toBeNull();
  });

  it("discloses nothing beyond the single household_id column (the function's own narrowness contract)", async () => {
    // The function's own comment (drizzle/0005): "returns only that account's household_id — no
    // other column, no other row". Asserted here rather than trusted from the comment — a widened
    // return shape (e.g. a later change accidentally returning the whole account row) would be
    // exactly the kind of drift join-code-protections' resolve_join_code/claim_join_code widening
    // already went through once (drizzle/0015) and is now expected to re-justify (P2's "widened
    // without re-making the narrowness argument").
    hh = await registerTestHousehold();

    const rows = await db.execute<Record<string, unknown>>(
      sql`SELECT * FROM (SELECT resolve_account_household(${hh.accountId}::uuid)) AS t`,
    );

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).toEqual(["resolve_account_household"]);
  });
});
