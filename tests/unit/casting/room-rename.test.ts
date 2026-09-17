import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { createRoom, renameRoom, transitionRoomStatus } from "@/modules/casting/repository";
import { castingRound } from "@/modules/casting/schema";
import { activityEvent } from "@/modules/audit/schema";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// Clarifications (Session 2026-09-17): renaming succeeds at every room state and every round
// state, including with an open round covering it, and produces exactly one ActivityEvent.
describe("Room renaming", () => {
  it("succeeds with an open round covering the room and records one room.renamed event", async () => {
    let hh: TestHousehold | undefined;
    try {
      hh = await registerTestHousehold();
      const h = hh;
      const actor = { accountId: h.accountId, profileId: null };

      const roomA = await createRoom(h.context, "Original label", actor);
      await transitionRoomStatus(h.context, roomA.id, "open", actor);
      await withSessionContext(h.context, (tx) =>
        tx.insert(castingRound).values({
          householdId: h.householdId,
          title: "Test round",
          status: "open",
          roomIds: [roomA.id],
        }),
      );

      const renamed = await renameRoom(h.context, roomA.id, "New label", actor);
      expect(renamed.label).toBe("New label");

      const events = await withSessionContext(h.context, (tx) =>
        tx
          .select()
          .from(activityEvent)
          .where(eq(activityEvent.subjectId, roomA.id)),
      );
      const renameEvents = events.filter((e) => e.eventType === "room.renamed");
      expect(renameEvents).toHaveLength(1);
    } finally {
      if (hh) await hh.cleanup();
    }
  });
});
