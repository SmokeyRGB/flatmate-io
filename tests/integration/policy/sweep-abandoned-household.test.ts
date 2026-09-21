import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// Regression test for proposal.md: a test that ends while registerTestHousehold() is still
// in flight leaves no binding for its own afterEach to clean up. This reproduces that scenario
// without a real 60s timeout — start the registration and deliberately let the test end without
// awaiting it, the way an abandoned test would — then prove tests/setup.ts's global afterEach
// swept it once it resolved. Without that global hook (task 2.1), this fails.
describe("sweepAbandonedHouseholds closes the abandoned-registration window", () => {
  let pending: Promise<TestHousehold>;

  it("starts a registration and abandons it, the way a timed-out test would", () => {
    pending = registerTestHousehold();
    // Deliberately no await — the test ends with the registration still in flight, so no
    // binding exists for this test's own afterEach to find. tests/setup.ts's global sweep
    // is the only thing that can still observe it.
  });

  it("finds the household gone once the sweep has run", async () => {
    const household = await pending;

    const rows = await withSessionContext(household.context, (tx) =>
      tx.execute(sql`SELECT id FROM household WHERE id = ${household.context.householdId}::uuid`),
    );

    expect(rows).toHaveLength(0);
  });
});
