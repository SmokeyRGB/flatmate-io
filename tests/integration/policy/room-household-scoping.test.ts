import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { createRoom } from "@/modules/casting/repository";
import { room } from "@/modules/casting/schema";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// G-C7, via the policy layer: household A must see none of household B's rooms.
describe("room household isolation — policy layer", () => {
  it("household A sees none of household B's rooms", async () => {
    let hhA: TestHousehold | undefined;
    let hhB: TestHousehold | undefined;
    try {
      hhA = await registerTestHousehold();
      hhB = await registerTestHousehold();
      const a = hhA;
      const b = hhB;
      const actorA = { accountId: a.accountId, profileId: null };
      const actorB = { accountId: b.accountId, profileId: null };

      const roomA = await createRoom(a.context, "Room in A", actorA);
      const roomB = await createRoom(b.context, "Room in B", actorB);

      const roomsSeenByA = await withSessionContext(a.context, (tx) => tx.select().from(room));

      expect(roomsSeenByA.map((r) => r.id)).toContain(roomA.id);
      expect(roomsSeenByA.map((r) => r.id)).not.toContain(roomB.id);
      expect(roomsSeenByA.every((r) => r.householdId === a.householdId)).toBe(true);
    } finally {
      if (hhA) await hhA.cleanup();
      if (hhB) await hhB.cleanup();
    }
  });
});
