import { afterEach, describe, expect, it } from "vitest";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, PermissionDeniedError } from "@/modules/identity/repository";
import { addResidentToRound, createRoom, createRound, openRound, removeRoom, renameRoom, transitionRoomStatus } from "@/modules/casting/repository";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

async function claim(hh: TestHousehold, name: string) {
  const actor = { accountId: hh.accountId, profileId: null };
  const profile = await createResidentProfile(hh.context, name, actor);
  const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
  return { profileId: profile.id, accountId };
}

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
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
    // PR #19 review: authorization derives from the authenticated session — the resident's OWN
    // SessionContext, not hh.context (the admin's) paired with the resident's accountId, which
    // would now be refused as a spoofed session rather than for lacking manage_rooms.
    const residentContext = {
      accountId: resident.accountId,
      householdId: hh.householdId,
      profileId: resident.profileId,
    };

    await expect(createRoom(residentContext, "Room B", residentActor)).rejects.toThrow(PermissionDeniedError);
    await expect(renameRoom(residentContext, room.id, "Renamed", residentActor)).rejects.toThrow(PermissionDeniedError);
    await expect(transitionRoomStatus(residentContext, room.id, "open", residentActor)).rejects.toThrow(PermissionDeniedError);
    await expect(removeRoom(residentContext, room.id, residentActor)).rejects.toThrow(PermissionDeniedError);
  });

  it("refuses a plain resident (no close_round) on every round-lifecycle mutation", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const room = await createRoom(hh.context, "Room A", adminActor);
    const round = await createRound(hh.context, "Round", [room.id], adminActor);
    // close_round is a role default (household_admin/moderator, docs/domain/identity.md §2.1) —
    // no claimed resident membership gets it, first or otherwise. Two residents are claimed here
    // only to keep this test's shape close to the room-mutation test above it.
    const first = await claim(hh, "Resident1");
    accountIds.push(first.accountId);
    const resident = await claim(hh, "Resident2");
    accountIds.push(resident.accountId);
    const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
    const residentContext = {
      accountId: resident.accountId,
      householdId: hh.householdId,
      profileId: resident.profileId,
    };

    await expect(createRound(residentContext, "Round 2", [room.id], residentActor)).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(openRound(residentContext, round.id, residentActor)).rejects.toThrow(PermissionDeniedError);
    await expect(
      addResidentToRound(residentContext, round.id, resident.profileId, residentActor),
    ).rejects.toThrow(PermissionDeniedError);
  });
});
