import { afterEach, describe, expect, it } from "vitest";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, PermissionDeniedError } from "@/modules/identity/repository";
import { addResidentToRound, createRoom, createRound, openRound, removeRoom, renameRoom, transitionRoomStatus } from "@/modules/casting/repository";
import { deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

async function claim(hh: TestHousehold, name: string) {
  const actor = { accountId: hh.accountId, profileId: null };
  const profile = await createResidentProfile(hh.context, name, actor);
  const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
  return { profileId: profile.id, accountId };
}

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  for (const id of accountIds) await deleteTestAccount(id);
  accountIds.length = 0;
  if (hh) await hh.cleanup();
  hh = undefined;
});

// G-C (speckit-analyze finding C1): room/round mutations had no authorization check of their own,
// relying entirely on the calling Server Action — same bug class already fixed once for
// updateHouseholdSettingsWithProcedureLock (see procedure-lock.test.ts's own regression test).
describe("Room and round mutations require their documented permission", () => {
  it("refuses a plain resident (no manage_rooms) on every room mutation", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const room = await createRoom(hh.context, "Room A", adminActor);
    const resident = await claim(hh, "Resident1");
    accountIds.push(resident.accountId);
    const residentActor = { accountId: resident.accountId, profileId: resident.profileId };

    await expect(createRoom(hh.context, "Room B", residentActor)).rejects.toThrow(PermissionDeniedError);
    await expect(renameRoom(hh.context, room.id, "Renamed", residentActor)).rejects.toThrow(PermissionDeniedError);
    await expect(transitionRoomStatus(hh.context, room.id, "open", residentActor)).rejects.toThrow(PermissionDeniedError);
    await expect(removeRoom(hh.context, room.id, residentActor)).rejects.toThrow(PermissionDeniedError);
  });

  it("refuses a plain resident (no close_round) on every round-lifecycle mutation", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const room = await createRoom(hh.context, "Room A", adminActor);
    const round = await createRound(hh.context, "Round", [room.id], adminActor);
    // auth.ts's claimResidentProfile grants `close_round` to a household's FIRST claimed
    // resident only (spec.md Assumptions). Claim a first one to consume that default, then
    // test against the second — a genuinely permission-less plain resident.
    const first = await claim(hh, "Resident1");
    accountIds.push(first.accountId);
    const resident = await claim(hh, "Resident2");
    accountIds.push(resident.accountId);
    const residentActor = { accountId: resident.accountId, profileId: resident.profileId };

    await expect(createRound(hh.context, "Round 2", [room.id], residentActor)).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(openRound(hh.context, round.id, residentActor)).rejects.toThrow(PermissionDeniedError);
    await expect(
      addResidentToRound(hh.context, round.id, resident.profileId, residentActor),
    ).rejects.toThrow(PermissionDeniedError);
  });
});
