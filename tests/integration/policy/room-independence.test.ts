import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { createRoom, removeRoom, RoomInUseByOpenRoundError, transitionRoomStatus } from "@/modules/casting/repository";
import { castingRound, room } from "@/modules/casting/schema";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// AC-1.7/FR-1.11: filling one room leaves the round running and the other rooms unaffected.
describe("Room independence and removal (US2)", () => {
  it("setting room A to occupied leaves the round open and rooms B/C unchanged (AC-1.7)", async () => {
    let hh: TestHousehold | undefined;
    try {
      hh = await registerTestHousehold();
      const h = hh;
      const actor = { accountId: h.accountId, profileId: null };

      const roomA = await createRoom(h.context, "Room A", actor);
      const roomB = await createRoom(h.context, "Room B", actor);
      const roomC = await createRoom(h.context, "Room C", actor);

      // Test setup only — round-opening's own atomic snapshot semantics (US3) aren't under test
      // here, only that a round covering these rooms stays unaffected by a room's own transition.
      const [round] = await withSessionContext(h.context, (tx) =>
        tx
          .insert(castingRound)
          .values({
            householdId: h.householdId,
            title: "Test round",
            status: "open",
            roomIds: [roomA.id, roomB.id, roomC.id],
          })
          .returning(),
      );

      await transitionRoomStatus(h.context, roomA.id, "open", actor);
      await transitionRoomStatus(h.context, roomA.id, "on_hold", actor);

      const [roundAfter, roomAAfter, roomBAfter, roomCAfter] = await withSessionContext(
        h.context,
        async (tx) => {
          const [r] = await tx.select().from(castingRound).where(eq(castingRound.id, round.id));
          const [a] = await tx.select().from(room).where(eq(room.id, roomA.id));
          const [b] = await tx.select().from(room).where(eq(room.id, roomB.id));
          const [c] = await tx.select().from(room).where(eq(room.id, roomC.id));
          return [r, a, b, c];
        },
      );

      expect(roundAfter.status).toBe("open");
      expect(roomAAfter.status).toBe("on_hold");
      expect(roomBAfter.status).toBe("planned");
      expect(roomCAfter.status).toBe("planned");
    } finally {
      if (hh) await hh.cleanup();
    }
  });

  it("refuses removal while an open round covers the room; not_available succeeds instead (EC-1.6)", async () => {
    let hh: TestHousehold | undefined;
    try {
      hh = await registerTestHousehold();
      const h = hh;
      const actor = { accountId: h.accountId, profileId: null };

      const roomA = await createRoom(h.context, "Room A", actor);
      await transitionRoomStatus(h.context, roomA.id, "open", actor);

      await withSessionContext(h.context, (tx) =>
        tx.insert(castingRound).values({
          householdId: h.householdId,
          title: "Test round",
          status: "open",
          roomIds: [roomA.id],
        }),
      );

      await expect(removeRoom(h.context, roomA.id, actor)).rejects.toThrow(RoomInUseByOpenRoundError);

      await expect(
        transitionRoomStatus(h.context, roomA.id, "not_available", actor),
      ).resolves.toMatchObject({ status: "not_available" });
    } finally {
      if (hh) await hh.cleanup();
    }
  });
});
