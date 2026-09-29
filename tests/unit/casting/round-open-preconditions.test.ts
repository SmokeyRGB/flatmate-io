import { afterEach, describe, expect, it } from "vitest";
import { createRoom, createRound, openRound, RoundOpenPreconditionError, transitionRoomStatus } from "@/modules/casting/repository";
import {
  cleanupAll,
  createNonResidentModerator,
  createTestModerator,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

describe("Round-open preconditions (EC-1.1, EC-1.2, EC-1.3, EC-1.4)", () => {
  it("refuses opening a round with no rooms selected (EC-1.1)", async () => {
    hh = await registerTestHousehold();
    // Design D13: rounds are created and opened by a moderator (also the eligible resident).
    const mod = await createTestModerator(hh, "Resident1");
    const modActor = { accountId: mod.accountId, profileId: mod.profileId };

    const round = await createRound(mod.context, "Round", [], modActor);
    await expect(openRound(mod.context, round.id, modActor)).rejects.toThrow(RoundOpenPreconditionError);
  });

  it("refuses opening when every covered room is occupied/not_available (EC-1.2)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const mod = await createTestModerator(hh, "Resident1");
    const modActor = { accountId: mod.accountId, profileId: mod.profileId };

    const roomA = await createRoom(hh.context, "Room A", actor);
    await transitionRoomStatus(hh.context, roomA.id, "open", actor);
    await transitionRoomStatus(hh.context, roomA.id, "not_available", actor);

    const round = await createRound(mod.context, "Round", [roomA.id], modActor);
    await expect(openRound(mod.context, round.id, modActor)).rejects.toThrow(RoundOpenPreconditionError);
  });

  it("refuses opening with zero eligible residents (EC-1.3)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const roomA = await createRoom(hh.context, "Room A", actor);
    // Design D13: a moderator must open the round, and a resident moderator is itself an active
    // resident, which would make EC-1.3 unreachable. A non-resident moderator can act but is no
    // eligible resident to snapshot.
    const mod = await createNonResidentModerator(hh);
    const modActor = { accountId: mod.accountId, profileId: mod.profileId };
    const round = await createRound(mod.context, "Round", [roomA.id], modActor);
    await expect(openRound(mod.context, round.id, modActor)).rejects.toThrow(RoundOpenPreconditionError);
  });

  it("permits opening with exactly one eligible resident (EC-1.4)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const mod = await createTestModerator(hh, "OnlyResident");
    const modActor = { accountId: mod.accountId, profileId: mod.profileId };
    const roomA = await createRoom(hh.context, "Room A", actor);

    const round = await createRound(mod.context, "Round", [roomA.id], modActor);
    const opened = await openRound(mod.context, round.id, modActor);
    expect(opened.status).toBe("open");
  });
});
