import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { getLastSweepCount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

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

// Behavioural counterpart to the test above (proposal.md, design.md D1): the sweep is a net
// beneath each file's own afterEach, not the primary cleanup path. Registered at this file's
// module scope, like tests/setup.ts's own hook — not nested inside the describe() below — so it
// lands in the same suite as the global sweep hook and actually collides with it under
// `sequence.hooks`, the way tests/setup.ts's real teardown does. Nesting it inside describe()
// would make it a child suite whose hooks always run before the root's regardless of ordering,
// which could never observe an inversion (see proposal.md's measured table).
let household: TestHousehold | undefined;

afterEach(async () => {
  await household?.cleanup();
  household = undefined;
});

// This registers a household and cleans it up the normal way through the module-scope afterEach
// above, then asserts in the *next* test that the sweep which ran after this one found nothing
// left to do — the sweep for test N runs after test N ends (tests/setup.ts), so only test N+1 can
// observe its count (design.md D2).
describe("sweepAbandonedHouseholds is a net, not the primary cleanup path", () => {
  it("registers a household and cleans it up the normal way", async () => {
    household = await registerTestHousehold();
  });

  // A non-zero count here means either the sweep ran before this file's own afterEach above (so
  // the sweep did the cleaning instead of it, not just beneath it), or that afterEach failed to
  // clean up — both worth failing on.
  it("finds nothing left for the sweep to clean", () => {
    expect(getLastSweepCount()).toBe(0);
  });
});
