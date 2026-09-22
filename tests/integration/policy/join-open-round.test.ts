import { and, eq, isNull } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile, joinHousehold } from "@/modules/identity/auth";
import { createRoom, createRound, openRound } from "@/modules/casting/repository";
import { roundParticipation } from "@/modules/casting/schema";
import { createResidentProfile, issueJoinCode } from "@/modules/identity/repository";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

async function activeParticipants(household: TestHousehold, roundId: string) {
  return withSessionContext(household.context, (tx) =>
    tx
      .select()
      .from(roundParticipation)
      .where(and(eq(roundParticipation.roundId, roundId), isNull(roundParticipation.removedAt))),
  );
}

// EC-2.2/EC-2.3 (F1 FR-1.18 as revised 2026-09-17): joining while a round is open makes the new
// resident a participant of it, marked joined_after_open (the drizzle/0010 trigger fires on ANY
// membership insert, joinHousehold's own included — not just claimResidentProfile's). Joining with
// no round open succeeds and is not an error.
describe("Joining and open rounds (EC-2.2/EC-2.3)", () => {
  it("adds the new resident to a currently open round, marked joined_after_open", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };

    // openRound needs at least one eligible resident to snapshot (EC-1.4) — unrelated to the join
    // path itself, just a precondition of opening a round at all.
    const firstProfile = await createResidentProfile(hh.context, "Founder", adminActor);
    const { accountId: firstAccountId } = await claimResidentProfile(
      hh.context,
      firstProfile.id,
      "test-password-not-real-1234",
    );
    accountIds.push(firstAccountId);

    const room = await createRoom(hh.context, "Room A", adminActor);
    const round = await createRound(hh.context, "Round", [room.id], adminActor);
    await openRound(hh.context, round.id, adminActor);

    expect(await activeParticipants(hh, round.id)).toHaveLength(1); // the founding snapshot

    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    const result = await joinHousehold(link.code, {
      displayName: "Jonas",
      password: "test-password-not-real-1234",
    });
    accountIds.push(result.context.accountId);

    const participants = await activeParticipants(hh, round.id);
    expect(participants).toHaveLength(2); // the founding snapshot plus the new joiner
    const joinerRow = participants.find((p) => p.residentProfileId === result.context.profileId);
    expect(joinerRow?.source).toBe("joined_after_open");
  });

  it("succeeds without error when no round is open (EC-2.3)", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    const result = await joinHousehold(link.code, {
      displayName: "Jonas",
      password: "test-password-not-real-1234",
    });
    accountIds.push(result.context.accountId);

    expect(result.context.profileId).toBeTruthy();
  });
});
