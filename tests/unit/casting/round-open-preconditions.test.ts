import { describe, expect, it } from "vitest";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { createRoom, createRound, openRound, RoundOpenPreconditionError, transitionRoomStatus } from "@/modules/casting/repository";
import { deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

async function claim(hh: TestHousehold, name: string) {
  const actor = { accountId: hh.accountId, profileId: null };
  const profile = await createResidentProfile(hh.context, name, actor);
  const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
  return { profileId: profile.id, accountId };
}

describe("Round-open preconditions (EC-1.1, EC-1.2, EC-1.3, EC-1.4)", () => {
  it("refuses opening a round with no rooms selected (EC-1.1)", async () => {
    let hh: TestHousehold | undefined;
    const accountIds: string[] = [];
    try {
      hh = await registerTestHousehold();
      const resident = await claim(hh, "Resident1");
      accountIds.push(resident.accountId);

      const round = await createRound(hh.context, "Round", [], { accountId: hh.accountId, profileId: null });
      await expect(
        openRound(hh.context, round.id, { accountId: hh.accountId, profileId: null }),
      ).rejects.toThrow(RoundOpenPreconditionError);
    } finally {
      for (const id of accountIds) await deleteTestAccount(id);
      if (hh) await hh.cleanup();
    }
  });

  it("refuses opening when every covered room is occupied/not_available (EC-1.2)", async () => {
    let hh: TestHousehold | undefined;
    const accountIds: string[] = [];
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };
      const resident = await claim(hh, "Resident1");
      accountIds.push(resident.accountId);

      const roomA = await createRoom(hh.context, "Room A", actor);
      await transitionRoomStatus(hh.context, roomA.id, "open", actor);
      await transitionRoomStatus(hh.context, roomA.id, "not_available", actor);

      const round = await createRound(hh.context, "Round", [roomA.id], actor);
      await expect(openRound(hh.context, round.id, actor)).rejects.toThrow(RoundOpenPreconditionError);
    } finally {
      for (const id of accountIds) await deleteTestAccount(id);
      if (hh) await hh.cleanup();
    }
  });

  it("refuses opening with zero eligible residents (EC-1.3)", async () => {
    let hh: TestHousehold | undefined;
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };
      const roomA = await createRoom(hh.context, "Room A", actor);

      const round = await createRound(hh.context, "Round", [roomA.id], actor);
      await expect(openRound(hh.context, round.id, actor)).rejects.toThrow(RoundOpenPreconditionError);
    } finally {
      if (hh) await hh.cleanup();
    }
  });

  it("permits opening with exactly one eligible resident (EC-1.4)", async () => {
    let hh: TestHousehold | undefined;
    const accountIds: string[] = [];
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };
      const resident = await claim(hh, "OnlyResident");
      accountIds.push(resident.accountId);
      const roomA = await createRoom(hh.context, "Room A", actor);

      const round = await createRound(hh.context, "Round", [roomA.id], actor);
      const opened = await openRound(hh.context, round.id, actor);
      expect(opened.status).toBe("open");
    } finally {
      for (const id of accountIds) await deleteTestAccount(id);
      if (hh) await hh.cleanup();
    }
  });
});
