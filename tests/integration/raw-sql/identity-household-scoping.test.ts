import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { createResidentProfile } from "@/modules/identity/repository";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

type Row = { id: string; household_id: string };

// G-C7, the same scenario as the policy-layer test, run as raw SQL under the application role
// with the session context set, bypassing the policy layer entirely — a pass on the policy path
// alone does not satisfy this.
describe("identity tables household isolation — raw SQL", () => {
  it("account/residentProfile/membership: household A sees none of household B's rows", async () => {
    let hhA: TestHousehold | undefined;
    let hhB: TestHousehold | undefined;
    try {
      hhA = await registerTestHousehold();
      hhB = await registerTestHousehold();
      const a = hhA;
      const b = hhB;
      const profileB = await createResidentProfile(b.context, "ProfileInBRaw", {
        accountId: b.accountId,
        profileId: null,
      });

      const [accountRows, profileRows, membershipRows] = await withSessionContext(
        a.context,
        async (tx) => [
          await tx.execute<Row>(sql`SELECT id, household_id FROM account`),
          await tx.execute<Row>(sql`SELECT id, household_id FROM resident_profile`),
          await tx.execute<Row>(sql`SELECT id, household_id FROM membership`),
        ],
      );

      expect(accountRows.map((r: Row) => r.id)).toContain(a.accountId);
      expect(accountRows.map((r: Row) => r.id)).not.toContain(b.accountId);
      expect(accountRows.every((r: Row) => r.household_id === a.householdId)).toBe(true);

      expect(profileRows.map((r: Row) => r.id)).not.toContain(profileB.id);
      expect(profileRows.every((r: Row) => r.household_id === a.householdId)).toBe(true);
      expect(membershipRows.every((r: Row) => r.household_id === a.householdId)).toBe(true);
    } finally {
      if (hhA) await hhA.cleanup();
      if (hhB) await hhB.cleanup();
    }
  });
});
