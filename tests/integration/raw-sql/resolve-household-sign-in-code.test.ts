import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { withSessionContext } from "@/db/session-context";
import { getHouseholdSignInCode } from "@/modules/identity/repository";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// household-sign-in-code D3 (G-C7, raw SQL as app_runtime, NO session context): the fourth
// deliberate RLS-bootstrap hole, resolve_household_sign_in_code (drizzle/0033, applied by the
// human). definer-coverage.ts requires a test naming it.
const households: TestHousehold[] = [];

afterEach(async () => {
  await cleanupAll(...households.splice(0).map((h) => h.cleanup()));
});

async function codeOf(hh: TestHousehold): Promise<string> {
  const code = await getHouseholdSignInCode(hh.context);
  if (!code) throw new Error("household has no sign-in code");
  return code;
}

async function resolve(code: string): Promise<string | null> {
  const rows = await db.execute<{ id: string | null }>(sql`SELECT resolve_household_sign_in_code(${code}) AS id`);
  return rows[0].id;
}

describe("resolve_household_sign_in_code — raw SQL (D3)", () => {
  it("returns household A's id for A's code", async () => {
    const a = await registerTestHousehold();
    households.push(a);
    const b = await registerTestHousehold();
    households.push(b);

    expect(await resolve(await codeOf(a))).toBe(a.householdId);
    expect(await resolve(await codeOf(b))).toBe(b.householdId);
  });

  it("returns NULL for an unknown well-formed code", async () => {
    expect(await resolve("ZZZZ-ZZZZ-ZZZZ")).toBeNull();
  });

  it("returns NULL for a household whose deleted_at is set (the predicate, not the data, refuses)", async () => {
    const hh = await registerTestHousehold();
    households.push(hh);
    const code = await codeOf(hh);
    // Positive control first: the very same code resolves while the household is live.
    expect(await resolve(code)).toBe(hh.householdId);

    await withSessionContext(hh.context, (tx) =>
      tx.execute(sql`UPDATE household SET deleted_at = now() WHERE id = ${hh.householdId}::uuid`),
    );

    expect(await resolve(code)).toBeNull();
  });

  it("discloses exactly one column and nothing beyond the id", async () => {
    const hh = await registerTestHousehold();
    households.push(hh);
    const rows = await db.execute<Record<string, unknown>>(
      sql`SELECT * FROM resolve_household_sign_in_code(${await codeOf(hh)}) AS t(household_id)`,
    );
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).toEqual(["household_id"]);
  });

  it("RLS still closes the table: a direct SELECT by code returns 0 rows outside the own household", async () => {
    const hh = await registerTestHousehold();
    households.push(hh);
    const other = await registerTestHousehold();
    households.push(other);
    const code = await codeOf(hh);

    // As app_runtime under ANOTHER household's context: the row is invisible. (With no context at
    // all the policy's uuid cast errors, so that is not a "0 rows" case.)
    const rows = await withSessionContext(other.context, (tx) =>
      tx.execute(sql`SELECT id FROM household WHERE sign_in_code = ${code}`),
    );
    expect(rows).toHaveLength(0);
  });
});
