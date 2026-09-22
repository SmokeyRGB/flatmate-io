import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { issueJoinCode } from "@/modules/identity/repository";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hhA: TestHousehold | undefined;
let hhB: TestHousehold | undefined;

afterEach(async () => {
  await cleanupAll(hhA?.cleanup(), hhB?.cleanup());
  hhA = undefined;
  hhB = undefined;
});

// C-2.10/G-C7, raw SQL half: the SAME scoping claim as the policy-layer test
// (tests/integration/policy/join-code-isolation.test.ts), issued as a raw SQL string under the
// application role with session context set — bypassing this repo's own query-builder entirely.
describe("Join code issuance household isolation — raw SQL (C-2.10)", () => {
  it("returns zero rows of another household via a raw, unscoped SELECT", async () => {
    hhA = await registerTestHousehold();
    hhB = await registerTestHousehold();
    const linkA = await issueJoinCode(hhA.context, hhA.accountId, { validDays: 7, maxUses: 1 });
    const linkB = await issueJoinCode(hhB.context, hhB.accountId, { validDays: 7, maxUses: 1 });

    type IssuanceRow = { id: string; household_id: string; code: string };
    const rowsSeenByA: IssuanceRow[] = await withSessionContext(hhA.context, (tx) =>
      tx.execute<IssuanceRow>(sql`SELECT id, household_id, code FROM join_code_issuance`), // deliberately no WHERE clause
    );

    const ids = rowsSeenByA.map((r: IssuanceRow) => r.id);
    expect(ids).toContain(linkA.id);
    expect(ids).not.toContain(linkB.id);
    expect(rowsSeenByA.every((r: IssuanceRow) => r.household_id === hhA!.householdId)).toBe(true);
  });

  // design.md Decision 2: resolve_join_code/claim_join_code are the one deliberate hole in the RLS
  // wall for this capability — this asserts they leak nothing beyond their declared three columns,
  // even called for a code belonging to a household the caller's own session isn't scoped to
  // (the functions are SECURITY DEFINER precisely because a code-presenting caller has no
  // session/household yet at all).
  describe("resolve_join_code / claim_join_code leak nothing beyond their declared columns (Decision 2)", () => {
    it("resolve_join_code returns exactly (household_id, issuance_id, household_name)", async () => {
      hhA = await registerTestHousehold();
      const link = await issueJoinCode(hhA.context, hhA.accountId, { validDays: 7, maxUses: 1 });

      // A session for an unrelated household (or no real session at all) can still call the
      // function — that is the point of the bootstrap exception — but must get back only the
      // three declared columns, nothing else about the household or the row.
      hhB = await registerTestHousehold();
      const rows = await withSessionContext(hhB.context, (tx) =>
        tx.execute<Record<string, unknown>>(sql`SELECT * FROM resolve_join_code(${link.code})`),
      );

      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]).sort()).toEqual(["household_id", "household_name", "issuance_id"]);
      expect(rows[0].household_id).toBe(hhA.householdId);
      expect(rows[0].issuance_id).toBe(link.id);
      expect(rows[0].household_name).toBe("WG");
    });

    it("claim_join_code returns exactly (household_id, issuance_id, household_name)", async () => {
      hhA = await registerTestHousehold();
      const link = await issueJoinCode(hhA.context, hhA.accountId, { validDays: 7, maxUses: 1 });

      hhB = await registerTestHousehold();
      const rows = await withSessionContext(hhB.context, (tx) =>
        tx.execute<Record<string, unknown>>(sql`SELECT * FROM claim_join_code(${link.code})`),
      );

      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]).sort()).toEqual(["household_id", "household_name", "issuance_id"]);
      expect(rows[0].household_id).toBe(hhA.householdId);
      expect(rows[0].issuance_id).toBe(link.id);
    });
  });
});
