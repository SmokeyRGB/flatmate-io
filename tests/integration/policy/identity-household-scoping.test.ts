import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { account, membership, residentProfile } from "@/modules/identity/schema";
import { createResidentProfile } from "@/modules/identity/repository";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// G-C7, via the policy layer: a query scoped to household A must return zero rows from household
// B — even though the query itself omits any WHERE household_id clause — for every table this
// feature adds.
describe("identity tables household isolation — policy layer", () => {
  it("account/residentProfile/membership: household A sees none of household B's rows", async () => {
    let hhA: TestHousehold | undefined;
    let hhB: TestHousehold | undefined;
    try {
      hhA = await registerTestHousehold();
      hhB = await registerTestHousehold();
      const a = hhA;
      const b = hhB;
      const profileB = await createResidentProfile(b.context, "ProfileInB", {
        accountId: b.accountId,
        profileId: null,
      });

      const [accountsSeenByA, profilesSeenByA, membershipsSeenByA] = await withSessionContext(
        a.context,
        async (tx) => [
          await tx.select().from(account), // deliberately no .where(...)
          await tx.select().from(residentProfile),
          await tx.select().from(membership),
        ],
      );

      expect(accountsSeenByA.map((r) => r.id)).toContain(a.accountId);
      expect(accountsSeenByA.map((r) => r.id)).not.toContain(b.accountId);
      expect(accountsSeenByA.every((r) => r.householdId === a.householdId)).toBe(true);

      expect(profilesSeenByA.map((r) => r.id)).not.toContain(profileB.id);
      expect(profilesSeenByA.every((r) => r.householdId === a.householdId)).toBe(true);

      expect(membershipsSeenByA.every((r) => r.householdId === a.householdId)).toBe(true);
    } finally {
      if (hhA) await hhA.cleanup();
      if (hhB) await hhB.cleanup();
    }
  });
});
