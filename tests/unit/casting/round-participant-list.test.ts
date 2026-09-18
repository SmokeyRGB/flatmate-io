import { afterEach, describe, expect, it } from "vitest";
import type { SessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { createRoom, createRound, getRoundParticipants, openRound } from "@/modules/casting/repository";
import { deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  for (const id of accountIds) await deleteTestAccount(id);
  accountIds.length = 0;
  if (hh) await hh.cleanup();
  hh = undefined;
});

// AC-1.18/FR-1.19/FR-1.28: names only — no actions, contact details, or join dates.
describe("Round participant list", () => {
  it("returns display names only, nothing else", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "Visible Name", actor);
    const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
    accountIds.push(accountId);
    const roomA = await createRoom(hh.context, "Room A", actor);
    const round = await createRound(hh.context, "Round", [roomA.id], actor);
    await openRound(hh.context, round.id, actor);

    // rounds-page-participant-leak: read as the claimed RESIDENT session (profileId set), not
    // hh.context (the profile-less household-account session) — ADR-014/G-D15 now refuses
    // participant data for the latter, and this test asserts the resident-visible behavior.
    const residentContext: SessionContext = {
      accountId,
      householdId: hh.householdId,
      profileId: profile.id,
    };
    const participants = await getRoundParticipants(residentContext, round.id);

    expect(participants).toHaveLength(1);
    expect(participants[0]).toEqual({ displayName: "Visible Name" });
    expect(Object.keys(participants[0])).toEqual(["displayName"]);
  });
});
