import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { uuid } from "../../helpers/uuid";

// AC-0.6/G-C7, via raw SQL: the SAME scenario as the policy-layer test, but issued as a raw SQL
// string under the application's database role with the session context set — bypassing this
// repo's own TypeScript query-builder/repository abstraction entirely. Per G-C7, a pass on the
// policy-layer test alone does not satisfy this; RLS itself (not app code) must do the filtering.
describe("Application household isolation — raw SQL (AC-0.6)", () => {
  it("returns zero rows from another household via a raw, unscoped SELECT", async () => {
    const householdA = uuid();
    const householdB = uuid();
    const profileA = uuid();
    const profileB = uuid();

    const rowA = await withSessionContext(
      { householdId: householdA, residentProfileId: profileA },
      async (tx) => {
        const result = await tx.execute<{ id: string }>(
          sql`INSERT INTO application (household_id, state, created_by_account_id, created_by_profile_id)
              VALUES (${householdA}::uuid, 'new', ${uuid()}::uuid, ${profileA}::uuid)
              RETURNING id`,
        );
        return result[0];
      },
    );

    const rowB = await withSessionContext(
      { householdId: householdB, residentProfileId: profileB },
      async (tx) => {
        const result = await tx.execute<{ id: string }>(
          sql`INSERT INTO application (household_id, state, created_by_account_id, created_by_profile_id)
              VALUES (${householdB}::uuid, 'new', ${uuid()}::uuid, ${profileB}::uuid)
              RETURNING id`,
        );
        return result[0];
      },
    );

    const rowsSeenByA = await withSessionContext(
      { householdId: householdA, residentProfileId: profileA },
      async (tx) => tx.execute<{ id: string; household_id: string }>(sql`SELECT id, household_id FROM application`),
    );

    const ids = rowsSeenByA.map((r) => r.id);
    expect(ids).toContain(rowA.id);
    expect(ids).not.toContain(rowB.id);
    expect(rowsSeenByA.every((r) => r.household_id === householdA)).toBe(true);

    // Cleanup, from each row's own household context (RLS-scoped DELETE).
    await withSessionContext({ householdId: householdA, residentProfileId: profileA }, (tx) =>
      tx.execute(sql`DELETE FROM application WHERE id = ${rowA.id}::uuid`),
    );
    await withSessionContext({ householdId: householdB, residentProfileId: profileB }, (tx) =>
      tx.execute(sql`DELETE FROM application WHERE id = ${rowB.id}::uuid`),
    );
  });
});
