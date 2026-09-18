import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { household, householdSettings } from "@/modules/identity/schema";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hhA: TestHousehold | undefined;
let hhB: TestHousehold | undefined;

afterEach(async () => {
  if (hhA) await hhA.cleanup();
  if (hhB) await hhB.cleanup();
  hhA = undefined;
  hhB = undefined;
});

// G-C7, via the policy layer: household A must see none of household B's Household/
// HouseholdSettings rows — even though the query omits any WHERE clause. Household's own policy
// is keyed by `id` itself (the tenant root), not a `household_id` column, so this is its own test
// rather than reusing the household_id-column pattern the other tables share.
describe("household/household_settings isolation — policy layer", () => {
  it("household A sees only its own Household and HouseholdSettings rows", async () => {
    hhA = await registerTestHousehold();
    hhB = await registerTestHousehold();
    const a = hhA;
    const b = hhB;

    const [householdsSeenByA, settingsSeenByA] = await withSessionContext(a.context, async (tx) => [
      await tx.select().from(household), // deliberately no .where(...)
      await tx.select().from(householdSettings),
    ]);

    expect(householdsSeenByA.map((h) => h.id)).toEqual([a.householdId]);
    expect(householdsSeenByA.map((h) => h.id)).not.toContain(b.householdId);
    expect(settingsSeenByA.map((s) => s.householdId)).toEqual([a.householdId]);
  });
});
