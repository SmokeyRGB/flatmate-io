import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { application } from "@/modules/casting/schema";
import { uuid } from "../../helpers/uuid";

let cleanupIds: string[] = [];

afterEach(async () => {
  for (const id of cleanupIds) {
    // Deleted through the row's own household context, since app_runtime's RLS policy scopes
    // DELETE to household_id like every other command (schema.ts's `for: "all"` policy).
    await withSessionContext({ householdId: HOUSEHOLD_FOR_CLEANUP[id], residentProfileId: uuid() }, (tx) =>
      tx.delete(application).where(eq(application.id, id)),
    );
  }
  cleanupIds = [];
});

const HOUSEHOLD_FOR_CLEANUP: Record<string, string> = {};

// AC-0.6/G-C7, via the policy layer: a query scoped to household A must return zero rows from
// household B — even though this query omits any WHERE household_id clause itself. RLS, not the
// query, is what must do the filtering.
describe("Application household isolation — policy layer (AC-0.6)", () => {
  it("returns zero rows from another household, with no WHERE clause in the query", async () => {
    const householdA = uuid();
    const householdB = uuid();
    const profileA = uuid();
    const profileB = uuid();

    const [rowA] = await withSessionContext(
      { householdId: householdA, residentProfileId: profileA },
      (tx) =>
        tx
          .insert(application)
          .values({
            householdId: householdA,
            state: "new",
            createdByAccountId: uuid(),
            createdByProfileId: profileA,
          })
          .returning(),
    );
    HOUSEHOLD_FOR_CLEANUP[rowA.id] = householdA;
    cleanupIds.push(rowA.id);

    const [rowB] = await withSessionContext(
      { householdId: householdB, residentProfileId: profileB },
      (tx) =>
        tx
          .insert(application)
          .values({
            householdId: householdB,
            state: "new",
            createdByAccountId: uuid(),
            createdByProfileId: profileB,
          })
          .returning(),
    );
    HOUSEHOLD_FOR_CLEANUP[rowB.id] = householdB;
    cleanupIds.push(rowB.id);

    const rowsSeenByA = await withSessionContext(
      { householdId: householdA, residentProfileId: profileA },
      (tx) => tx.select().from(application), // deliberately no .where(...)
    );

    expect(rowsSeenByA.map((r) => r.id)).toContain(rowA.id);
    expect(rowsSeenByA.map((r) => r.id)).not.toContain(rowB.id);
    expect(rowsSeenByA.every((row) => row.householdId === householdA)).toBe(true);
  });
});
