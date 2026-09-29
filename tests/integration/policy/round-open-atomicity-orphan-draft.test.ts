import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import {
  createAndOpenRound,
  createRoom,
  RoundOpenPreconditionError,
} from "@/modules/casting/repository";
import { castingRound } from "@/modules/casting/schema";
import {
  cleanupAll,
  createNonResidentModerator,
  createTestModerator,
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

// rounds-new-orphan-draft-atomicity: createRound (draft insert) and openRound (precondition
// checks + snapshot) used to run as two separately committed transactions. A precondition
// failure in the second left the draft round and its casting_round.created ActivityEvent
// permanently behind — every failed "new round" submission accumulated an orphan draft visible
// on the dashboard. createAndOpenRound now runs both steps in one transaction, so a thrown
// RoundOpenPreconditionError must roll back the draft insert too.
describe("createAndOpenRound: no orphan draft on a failed open (rounds-new-orphan-draft-atomicity)", () => {
  it("leaves zero casting_round rows and zero casting_round.created events after EC-1.1 (no rooms selected)", async () => {
    hh = await registerTestHousehold();
    // Design D13: the household account no longer runs rounds, so a moderator attempts it.
    const moderator = await createTestModerator(hh);
    const actor = { accountId: moderator.accountId, profileId: moderator.profileId };

    // No rooms passed -> openRoundTx's EC-1.1 check fails inside the same transaction as the
    // draft insert.
    await expect(
      createAndOpenRound(moderator.context, "Orphan attempt", [], actor),
    ).rejects.toThrow(RoundOpenPreconditionError);

    const rounds = await withSessionContext(hh.context, (tx) =>
      tx.select().from(castingRound).where(eq(castingRound.householdId, hh!.householdId)),
    );
    expect(rounds).toHaveLength(0);

    const events = await withSessionContext(hh.context, (tx) =>
      tx
        .select()
        .from(activityEvent)
        .where(eq(activityEvent.eventType, "casting_round.created")),
    );
    expect(events).toHaveLength(0);
  });

  it("leaves zero casting_round rows after EC-1.3 (no eligible residents)", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const roomA = await createRoom(hh.context, "Room A", adminActor);
    // Design D13: a moderator must attempt the round, and a resident moderator is itself an active
    // resident, which would make EC-1.3 unreachable. A non-resident moderator can act but is no
    // eligible resident to snapshot -> EC-1.3 fails.
    const moderator = await createNonResidentModerator(hh);
    const actor = { accountId: moderator.accountId, profileId: moderator.profileId };

    // A room exists but no ACTIVE resident is left -> EC-1.3 fails.
    await expect(
      createAndOpenRound(moderator.context, "Orphan attempt 2", [roomA.id], actor),
    ).rejects.toThrow(RoundOpenPreconditionError);

    const rounds = await withSessionContext(hh.context, (tx) =>
      tx.select().from(castingRound).where(eq(castingRound.householdId, hh!.householdId)),
    );
    expect(rounds).toHaveLength(0);
  });

  it("still succeeds and produces exactly one round when preconditions pass", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    // The moderator (design D13) is the one eligible resident and opens the round.
    const moderator = await createTestModerator(hh, "Resident1");
    const actor = { accountId: moderator.accountId, profileId: moderator.profileId };
    const roomA = await createRoom(hh.context, "Room A", adminActor);

    const opened = await createAndOpenRound(moderator.context, "Good round", [roomA.id], actor);
    expect(opened.status).toBe("open");

    const rounds = await withSessionContext(hh.context, (tx) =>
      tx.select().from(castingRound).where(eq(castingRound.householdId, hh!.householdId)),
    );
    expect(rounds).toHaveLength(1);
  });
});
