import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { createRoom, createRound } from "@/modules/casting/repository";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

type Row = { id: string; household_id: string };

// G-C7, the same scenario as the policy-layer test, bypassing it via raw SQL.
describe("casting_round household isolation — raw SQL", () => {
  it("household A sees none of household B's rounds", async () => {
    let hhA: TestHousehold | undefined;
    let hhB: TestHousehold | undefined;
    try {
      hhA = await registerTestHousehold();
      hhB = await registerTestHousehold();
      const a = hhA;
      const b = hhB;
      const actorA = { accountId: a.accountId, profileId: null };
      const actorB = { accountId: b.accountId, profileId: null };

      const roomA = await createRoom(a.context, "Room A", actorA);
      const roundA = await createRound(a.context, "Round A", [roomA.id], actorA);
      const roomB = await createRoom(b.context, "Room B", actorB);
      const roundB = await createRound(b.context, "Round B", [roomB.id], actorB);

      const rows = await withSessionContext(a.context, (tx) =>
        tx.execute<Row>(sql`SELECT id, household_id FROM casting_round`),
      );

      expect(rows.map((r: Row) => r.id)).toContain(roundA.id);
      expect(rows.map((r: Row) => r.id)).not.toContain(roundB.id);
      expect(rows.every((r: Row) => r.household_id === a.householdId)).toBe(true);
    } finally {
      if (hhA) await hhA.cleanup();
      if (hhB) await hhB.cleanup();
    }
  });
});
