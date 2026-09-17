import { describe, expect, it } from "vitest";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { createRoom, createRound, getRoundParticipants, openRound } from "@/modules/casting/repository";
import { deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// AC-1.18/FR-1.19/FR-1.28: names only — no actions, contact details, or join dates.
describe("Round participant list", () => {
  it("returns display names only, nothing else", async () => {
    let hh: TestHousehold | undefined;
    const accountIds: string[] = [];
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };
      const profile = await createResidentProfile(hh.context, "Visible Name", actor);
      const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
      accountIds.push(accountId);
      const roomA = await createRoom(hh.context, "Room A", actor);
      const round = await createRound(hh.context, "Round", [roomA.id], actor);
      await openRound(hh.context, round.id, actor);

      const participants = await getRoundParticipants(hh.context, round.id);

      expect(participants).toHaveLength(1);
      expect(participants[0]).toEqual({ displayName: "Visible Name" });
      expect(Object.keys(participants[0])).toEqual(["displayName"]);
    } finally {
      for (const id of accountIds) await deleteTestAccount(id);
      if (hh) await hh.cleanup();
    }
  });
});
