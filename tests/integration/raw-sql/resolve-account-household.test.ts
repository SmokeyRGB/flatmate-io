import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { issueJoinCode } from "@/modules/identity/repository";
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
    //
    // review fix: `SELECT * FROM (SELECT f(x)) AS t` is vacuous — wrapping a function call as a
    // scalar expression in a subquery's select-list ALWAYS yields exactly one output column named
    // after the function, regardless of what f actually returns (even a RETURNS TABLE function,
    // called that way, collapses to one column). Calling the function directly in the FROM clause
    // instead (`SELECT * FROM f(x) AS t`) is the shape that would actually expand a set-returning
    // or composite result into several columns — see the sanity check below, which proves this
    // query shape is capable of catching a widened column set, using resolve_join_code (RETURNS
    // TABLE, drizzle/0015) as the case that WOULD show more than one column.
    hh = await registerTestHousehold();

    // `AS t(household_id)` names the single output column explicitly — Postgres otherwise names
    // a bare-aliased scalar function's one column after the alias itself ("t"), which would make
    // the assertion below check the alias, not the function's actual output shape.
    const rows = await db.execute<Record<string, unknown>>(
      sql`SELECT * FROM resolve_account_household(${hh.accountId}::uuid) AS t(household_id)`,
    );

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).toEqual(["household_id"]);
  });

  it("sanity check: the same query shape against a RETURNS TABLE function expands into several columns", async () => {
    // Proves the previous test's query shape is non-vacuous, without altering the database:
    // resolve_join_code (drizzle/0015) RETURNS TABLE with five columns. If it came back as a
    // single column here, that would mean `SELECT * FROM f(x) AS t` collapses results the same
    // way the old `SELECT * FROM (SELECT f(x)) AS t` did — which would make the narrowness
    // assertion above meaningless. It doesn't: it expands, so the assertion above is real.
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    const rows = await db.execute<Record<string, unknown>>(sql`SELECT * FROM resolve_join_code(${link.code}) AS t`);

    expect(rows).toHaveLength(1);
    // resident-settings design.md Decision 4: widened from five to six columns — `purpose` is new.
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        "household_id",
        "issuance_id",
        "household_name",
        "bound_resident_profile_id",
        "bound_resident_display_name",
        "purpose",
      ].sort(),
    );
  });
});
