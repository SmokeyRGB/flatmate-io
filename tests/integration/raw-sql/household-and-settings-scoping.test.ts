import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

type HouseholdRow = { id: string };
type SettingsRow = { household_id: string };

let hhA: TestHousehold | undefined;
let hhB: TestHousehold | undefined;

afterEach(async () => {
  if (hhA) await hhA.cleanup();
  if (hhB) await hhB.cleanup();
  hhA = undefined;
  hhB = undefined;
});

// G-C7, the same scenario as the policy-layer test, bypassing it via raw SQL.
describe("household/household_settings isolation — raw SQL", () => {
  it("household A sees only its own Household and HouseholdSettings rows", async () => {
    hhA = await registerTestHousehold();
    hhB = await registerTestHousehold();
    const a = hhA;
    const b = hhB;

    const [householdRows, settingsRows] = await withSessionContext(a.context, async (tx) => [
      await tx.execute<HouseholdRow>(sql`SELECT id FROM household`),
      await tx.execute<SettingsRow>(sql`SELECT household_id FROM household_settings`),
    ]);

    expect(householdRows.map((r: HouseholdRow) => r.id)).toEqual([a.householdId]);
    expect(householdRows.map((r: HouseholdRow) => r.id)).not.toContain(b.householdId);
    expect(settingsRows.map((r: SettingsRow) => r.household_id)).toEqual([a.householdId]);
  });
});
