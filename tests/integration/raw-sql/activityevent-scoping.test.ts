import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { uuid } from "../../helpers/uuid";

// FR-0.2/AC-0.6, via raw SQL — the raw-SQL half of the ActivityEvent household-isolation
// guarantee (found missing by /speckit-analyze, 2026-09-16), mirroring
// tests/integration/raw-sql/household-scoping.test.ts for the second household_id-carrying table.
describe("ActivityEvent household isolation — raw SQL (FR-0.2/AC-0.6)", () => {
  it("returns zero rows from another household via a raw, unscoped SELECT", async () => {
    const householdA = uuid();
    const householdB = uuid();

    const rowA = await withSessionContext(
      { accountId: uuid(), householdId: householdA, profileId: uuid() },
      async (tx) => {
        const result = await tx.execute<{ id: string }>(
          sql`INSERT INTO activity_event (household_id, event_type, subject_type, subject_id, payload)
              VALUES (${householdA}::uuid, 'application.state_changed', 'application', ${uuid()}::uuid, '{}'::jsonb)
              RETURNING id`,
        );
        return result[0];
      },
    );

    const rowB = await withSessionContext(
      { accountId: uuid(), householdId: householdB, profileId: uuid() },
      async (tx) => {
        const result = await tx.execute<{ id: string }>(
          sql`INSERT INTO activity_event (household_id, event_type, subject_type, subject_id, payload)
              VALUES (${householdB}::uuid, 'application.state_changed', 'application', ${uuid()}::uuid, '{}'::jsonb)
              RETURNING id`,
        );
        return result[0];
      },
    );

    type ActivityEventRow = { id: string; household_id: string };

    const rowsSeenByA = await withSessionContext(
      { accountId: uuid(), householdId: householdA, profileId: uuid() },
      (tx) =>
        tx.execute<ActivityEventRow>(sql`SELECT id, household_id FROM activity_event`),
    );

    const ids = rowsSeenByA.map((r: ActivityEventRow) => r.id);
    expect(ids).toContain(rowA.id);
    expect(ids).not.toContain(rowB.id);
    expect(rowsSeenByA.every((r: ActivityEventRow) => r.household_id === householdA)).toBe(true);
  });
});
