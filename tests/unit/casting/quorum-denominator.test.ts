import { eq, isNull, and } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { addResidentToRound, createRoom, createRound, openRound } from "@/modules/casting/repository";
import { roundParticipation } from "@/modules/casting/schema";
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

async function activeParticipants(hh: TestHousehold, roundId: string) {
  return withSessionContext(hh.context, (tx) =>
    tx
      .select()
      .from(roundParticipation)
      .where(and(eq(roundParticipation.roundId, roundId), isNull(roundParticipation.removedAt))),
  );
}

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

// FR-1.18 (revised 2026-09-17)/AC-1.11/AC-1.12/FR-1.17: a resident joining after opening
// automatically joins every open round, marked distinctly from the snapshot.
describe("Quorum denominator growth after opening", () => {
  it("automatically includes a resident who claims their profile after the round opened", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const r1 = await claim(hh, "Resident1");
    accountIds.push(r1.accountId);
    const roomA = await createRoom(hh.context, "Room A", actor);
    const round = await createRound(hh.context, "Round", [roomA.id], actor);
    await openRound(hh.context, round.id, actor);

    expect(await activeParticipants(hh, round.id)).toHaveLength(1);

    // AC-1.11: a resident joins (claims their profile) after the round opened.
    const preparedProfile = await createResidentProfile(hh.context, "Resident2", actor);
    const { accountId: r2AccountId } = await claimResidentProfile(
      hh.context,
      preparedProfile.id,
      "test-password-not-real-1234",
    );
    accountIds.push(r2AccountId);

    const afterClaim = await activeParticipants(hh, round.id);
    expect(afterClaim).toHaveLength(2); // automatic — no moderator action taken
    const autoRow = afterClaim.find((p) => p.residentProfileId === preparedProfile.id);
    expect(autoRow?.source).toBe("joined_after_open"); // AC-1.12: distinguishable from the snapshot
  });

  it("addResidentToRound remains available as a moderator's manual correction path", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const r1 = await claim(hh, "Resident1");
    accountIds.push(r1.accountId);
    const roomA = await createRoom(hh.context, "Room A", actor);
    const round = await createRound(hh.context, "Round", [roomA.id], actor);
    await openRound(hh.context, round.id, actor);

    // A resident who somehow wasn't auto-added (e.g. claimed before this round existed at all,
    // in a household with no open round yet) can still be added by hand.
    const r2 = await claim(hh, "Resident2");
    accountIds.push(r2.accountId);
    // (claim() above happens while the round is already open in this test, so it WAS
    // auto-added — this call exercises the manual path as a correction on top of that, which
    // must not create a duplicate entry with a different source for the same profile pairing.)
    const addedRow = await addResidentToRound(hh.context, round.id, r2.profileId, actor);
    expect(addedRow?.source).toBe("joined_after_open"); // the trigger's row wins, not a second row

    const active = await activeParticipants(hh, round.id);
    const r2Rows = active.filter((p) => p.residentProfileId === r2.profileId);
    expect(r2Rows).toHaveLength(1); // no duplicate denominator row for the same pairing
  });

  it("addResidentToRound called twice for the same resident does not duplicate the row", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const r1 = await claim(hh, "Resident1");
    accountIds.push(r1.accountId);
    const roomA = await createRoom(hh.context, "Room A", actor);
    const round = await createRound(hh.context, "Round", [roomA.id], actor);
    await openRound(hh.context, round.id, actor);

    // A profile with no Membership yet (not claimed) — never touched by the auto-join trigger —
    // isolates the manual-path insert from a second manual-path insert for the same pairing.
    const profile = await createResidentProfile(hh.context, "Resident2", actor);

    const first = await addResidentToRound(hh.context, round.id, profile.id, actor);
    const second = await addResidentToRound(hh.context, round.id, profile.id, actor);
    expect(second?.id).toBe(first?.id);

    const active = await activeParticipants(hh, round.id);
    expect(active.filter((p) => p.residentProfileId === profile.id)).toHaveLength(1);
  });
});
