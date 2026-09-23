import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionContext } from "@/db/session-context";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, removeMember, setMovedOut } from "@/modules/identity/repository";
import { roundParticipation } from "@/modules/casting/schema";
import { createRoom, createRound, getRoundParticipants, openRound } from "@/modules/casting/repository";
import {
  cleanupAll,
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

  // final-member-removal design.md Decision 7 (V-3/FR-1.19, human decision 2026-09-22): neither
  // tier belongs on "current residents taking part" any more. The round_participation row itself
  // is left untouched (removed_at stays null) — F4's denominator still needs it.
  it("drops a moved-out or removed participant from the list, without touching round_participation", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const movedOutProfile = await createResidentProfile(hh.context, "WillMoveOut", actor);
    const { accountId: movedOutAccountId } = await claimResidentProfile(
      hh.context,
      movedOutProfile.id,
      "test-password-not-real-1234",
    );
    accountIds.push(movedOutAccountId);

    const removedProfile = await createResidentProfile(hh.context, "WillBeRemoved", actor);
    const { accountId: removedAccountId } = await claimResidentProfile(
      hh.context,
      removedProfile.id,
      "test-password-not-real-1234",
    );
    accountIds.push(removedAccountId);

    const stillHereProfile = await createResidentProfile(hh.context, "StillHere", actor);
    const { accountId: stillHereAccountId } = await claimResidentProfile(
      hh.context,
      stillHereProfile.id,
      "test-password-not-real-1234",
    );
    accountIds.push(stillHereAccountId);

    const roomA = await createRoom(hh.context, "Room A", actor);
    const round = await createRound(hh.context, "Round", [roomA.id], actor);
    await openRound(hh.context, round.id, actor);

    await setMovedOut(hh.context, hh.accountId, movedOutAccountId);
    await removeMember(hh.context, hh.accountId, removedAccountId, "WillBeRemoved");

    const residentContext: SessionContext = {
      accountId: stillHereAccountId,
      householdId: hh.householdId,
      profileId: stillHereProfile.id,
    };
    const participants = await getRoundParticipants(residentContext, round.id);
    const names = participants.map((p) => p.displayName);
    expect(names).toContain("StillHere");
    expect(names).not.toContain("WillMoveOut");
    expect(names).not.toContain("WillBeRemoved");

    // The underlying round_participation rows are untouched (F4's denominator reads them) — only
    // the LIST reads through resident_profile.status; removed_at stays null for both.
    const rows = await withSessionContext(hh.context, (tx) =>
      tx.select().from(roundParticipation).where(eq(roundParticipation.roundId, round.id)),
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.removedAt === null)).toBe(true);
  });
});
