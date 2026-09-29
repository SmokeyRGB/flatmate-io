import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { applicationInsertValuesSql, APPLICATION_INSERT_COLUMNS_SQL, insertTestRound } from "../../helpers/applications";
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
      { accountId: uuid(), householdId: householdA, profileId: profileA },
      async (tx) => {
        // Setup only (drizzle/0023): every NOT NULL column, and a real round of the household.
        const roundId = await insertTestRound(tx, householdA);
        const result = await tx.execute<{ id: string }>(
          sql`INSERT INTO application (${APPLICATION_INSERT_COLUMNS_SQL})
              VALUES ${applicationInsertValuesSql({ householdId: householdA, roundId, accountId: uuid(), profileId: profileA })}
              RETURNING id`,
        );
        return result[0];
      },
    );

    const rowB = await withSessionContext(
      { accountId: uuid(), householdId: householdB, profileId: profileB },
      async (tx) => {
        // Setup only (drizzle/0023): every NOT NULL column, and a real round of the household.
        const roundId = await insertTestRound(tx, householdB);
        const result = await tx.execute<{ id: string }>(
          sql`INSERT INTO application (${APPLICATION_INSERT_COLUMNS_SQL})
              VALUES ${applicationInsertValuesSql({ householdId: householdB, roundId, accountId: uuid(), profileId: profileB })}
              RETURNING id`,
        );
        return result[0];
      },
    );

    type ApplicationRow = { id: string; household_id: string };

    const rowsSeenByA = await withSessionContext(
      { accountId: uuid(), householdId: householdA, profileId: profileA },
      async (tx) => tx.execute<ApplicationRow>(sql`SELECT id, household_id FROM application`),
    );

    const ids = rowsSeenByA.map((r: ApplicationRow) => r.id);
    expect(ids).toContain(rowA.id);
    expect(ids).not.toContain(rowB.id);
    expect(rowsSeenByA.every((r: ApplicationRow) => r.household_id === householdA)).toBe(true);

    // Cleanup, from each row's own household context (RLS-scoped DELETE).
    await withSessionContext({ accountId: uuid(), householdId: householdA, profileId: profileA }, (tx) =>
      tx.execute(sql`DELETE FROM application WHERE id = ${rowA.id}::uuid`),
    );
    await withSessionContext({ accountId: uuid(), householdId: householdB, profileId: profileB }, (tx) =>
      tx.execute(sql`DELETE FROM application WHERE id = ${rowB.id}::uuid`),
    );
    // Teardown of the rounds seeded above.
    await withSessionContext({ accountId: uuid(), householdId: householdA, profileId: profileA }, (tx) =>
      tx.execute(sql`DELETE FROM casting_round WHERE household_id = ${householdA}::uuid`),
    );
    await withSessionContext({ accountId: uuid(), householdId: householdB, profileId: profileB }, (tx) =>
      tx.execute(sql`DELETE FROM casting_round WHERE household_id = ${householdB}::uuid`),
    );
  });
});
