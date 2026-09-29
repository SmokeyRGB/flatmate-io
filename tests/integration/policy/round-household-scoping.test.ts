import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { createRoom, createRound, openRound } from "@/modules/casting/repository";
import { castingRound, roundParticipation } from "@/modules/casting/schema";
import {
  cleanupAll,
  createTestModerator,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

let hhA: TestHousehold | undefined;
let hhB: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hhA?.cleanup(), hhB?.cleanup());
  accountIds.length = 0;
  hhA = undefined;
  hhB = undefined;
});

// G-C7, via the policy layer: household A must see none of household B's rounds/participations.
describe("casting_round/round_participation household isolation — policy layer", () => {
  it("household A sees none of household B's rounds or participations", async () => {
    hhA = await registerTestHousehold();
    hhB = await registerTestHousehold();
    const a = hhA;
    const b = hhB;
    const actorA = { accountId: a.accountId, profileId: null };
    const actorB = { accountId: b.accountId, profileId: null };

    const profileB = await createResidentProfile(b.context, "ResidentB", actorB);
    const { accountId: residentAccountId } = await claimResidentProfile(
      b.context,
      profileB.id,
      "test-password-not-real-1234",
    );
    accountIds.push(residentAccountId);

    const roomA = await createRoom(a.context, "Room A", actorA);
    // Setup only (design D13): rounds are created and opened by a moderator of each household.
    const modA = await createTestModerator(a);
    const roundA = await createRound(modA.context, "Round A", [roomA.id], {
      accountId: modA.accountId,
      profileId: modA.profileId,
    });

    const roomB = await createRoom(b.context, "Room B", actorB);
    const modB = await createTestModerator(b);
    const actorModB = { accountId: modB.accountId, profileId: modB.profileId };
    const roundB = await createRound(modB.context, "Round B", [roomB.id], actorModB);
    await openRound(modB.context, roundB.id, actorModB);

    const [roundsSeenByA, participationsSeenByA] = await withSessionContext(a.context, async (tx) => [
      await tx.select().from(castingRound),
      await tx.select().from(roundParticipation),
    ]);

    expect(roundsSeenByA.map((r) => r.id)).toContain(roundA.id);
    expect(roundsSeenByA.map((r) => r.id)).not.toContain(roundB.id);
    expect(participationsSeenByA.map((p) => p.roundId)).not.toContain(roundB.id);
  });
});
