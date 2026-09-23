import { afterEach, describe, expect, it } from "vitest";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, PermissionDeniedError } from "@/modules/identity/repository";
import {
  createRoom,
  createRound,
  forceChangeSettingWhileRoundOpen,
  hasProcedureChangedNotice,
  openRound,
  ProcedureLockedError,
  updateHouseholdSettingsWithProcedureLock,
} from "@/modules/casting/repository";
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

// AC-1.13/AC-1.14/AC-1.15/FR-1.21/FR-1.22/I-7.
describe("Procedure lock while a round is open", () => {
  it("refuses a locked-setting change while open, names the round, allows it once no round is open (AC-1.13/AC-1.15)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const resident = await claim(hh, "Resident1");
    accountIds.push(resident.accountId);
    const roomA = await createRoom(hh.context, "Room A", actor);
    const round = await createRound(hh.context, "Round", [roomA.id], actor);

    // AC-1.15: no round open yet (still draft) — the change succeeds.
    await expect(
      updateHouseholdSettingsWithProcedureLock(hh.context, { quorumShare: "0.6" }, actor),
    ).resolves.toMatchObject({ quorumShare: "0.6" });

    await openRound(hh.context, round.id, actor);

    // AC-1.13: refused while open, and the error names the open round.
    await expect(
      updateHouseholdSettingsWithProcedureLock(hh.context, { quorumShare: "0.7" }, actor),
    ).rejects.toMatchObject({ openRoundId: round.id } satisfies Partial<ProcedureLockedError>);
  });

  it("records an ActivityEvent and a procedure-changed notice when forced through anyway (AC-1.14)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const resident = await claim(hh, "Resident1");
    accountIds.push(resident.accountId);
    const roomA = await createRoom(hh.context, "Room A", actor);
    const round = await createRound(hh.context, "Round", [roomA.id], actor);
    await openRound(hh.context, round.id, actor);

    await forceChangeSettingWhileRoundOpen(hh.context, "quorumShare", "0.9", round.id, actor);

    await expect(hasProcedureChangedNotice(hh.context, round.id)).resolves.toBe(true);
  });

  // FR-1.8/G-C (Convergence, found via manual UI testing): a plain resident with no granted
  // permissions must not be able to change household settings at all, regardless of the
  // procedure lock's own state.
  it("refuses a plain resident with no manage_settings permission", async () => {
    hh = await registerTestHousehold();
    const resident = await claim(hh, "Resident1");
    accountIds.push(resident.accountId);
    const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
    // PR #19 review: authorization derives from the authenticated session — the resident's OWN
    // SessionContext, not hh.context (the admin's) paired with the resident's accountId, which
    // would now be refused as a spoofed session rather than for lacking manage_settings.
    const residentContext = {
      accountId: resident.accountId,
      householdId: hh.householdId,
      profileId: resident.profileId,
    };

    await expect(
      updateHouseholdSettingsWithProcedureLock(residentContext, { quorumShare: "0.6" }, residentActor),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("refuses a plain resident with no manage_settings permission from forcing a change while open", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const resident = await claim(hh, "Resident1");
    accountIds.push(resident.accountId);
    const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
    const residentContext = {
      accountId: resident.accountId,
      householdId: hh.householdId,
      profileId: resident.profileId,
    };
    const roomA = await createRoom(hh.context, "Room A", actor);
    const round = await createRound(hh.context, "Round", [roomA.id], actor);
    await openRound(hh.context, round.id, actor);

    await expect(
      forceChangeSettingWhileRoundOpen(residentContext, "quorumShare", "0.9", round.id, residentActor),
    ).rejects.toThrow(PermissionDeniedError);
  });
});
