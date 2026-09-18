import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { createRoom, createRound, openRound } from "@/modules/casting/repository";
import { castingRound, roundParticipation } from "@/modules/casting/schema";
import { deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hhA: TestHousehold | undefined;
let hhB: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  for (const id of accountIds) await deleteTestAccount(id);
  accountIds.length = 0;
  if (hhA) await hhA.cleanup();
  if (hhB) await hhB.cleanup();
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
    const roundA = await createRound(a.context, "Round A", [roomA.id], actorA);

    const roomB = await createRoom(b.context, "Room B", actorB);
    const roundB = await createRound(b.context, "Round B", [roomB.id], actorB);
    await openRound(b.context, roundB.id, actorB);

    const [roundsSeenByA, participationsSeenByA] = await withSessionContext(a.context, async (tx) => [
      await tx.select().from(castingRound),
      await tx.select().from(roundParticipation),
    ]);

    expect(roundsSeenByA.map((r) => r.id)).toContain(roundA.id);
    expect(roundsSeenByA.map((r) => r.id)).not.toContain(roundB.id);
    expect(participationsSeenByA.map((p) => p.roundId)).not.toContain(roundB.id);
  });
});
