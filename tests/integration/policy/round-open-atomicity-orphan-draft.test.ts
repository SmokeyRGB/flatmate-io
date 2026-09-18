import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import {
  createAndOpenRound,
  createRoom,
  RoundOpenPreconditionError,
} from "@/modules/casting/repository";
import { castingRound } from "@/modules/casting/schema";
import { deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  for (const id of accountIds) await deleteTestAccount(id);
  accountIds.length = 0;
  if (hh) await hh.cleanup();
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
    const actor = { accountId: hh.accountId, profileId: null };

    // No rooms passed -> openRoundTx's EC-1.1 check fails inside the same transaction as the
    // draft insert.
    await expect(
      createAndOpenRound(hh.context, "Orphan attempt", [], actor),
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
    const actor = { accountId: hh.accountId, profileId: null };
    const roomA = await createRoom(hh.context, "Room A", actor);

    // A room exists but no resident has claimed a profile -> EC-1.3 fails.
    await expect(
      createAndOpenRound(hh.context, "Orphan attempt 2", [roomA.id], actor),
    ).rejects.toThrow(RoundOpenPreconditionError);

    const rounds = await withSessionContext(hh.context, (tx) =>
      tx.select().from(castingRound).where(eq(castingRound.householdId, hh!.householdId)),
    );
    expect(rounds).toHaveLength(0);
  });

  it("still succeeds and produces exactly one round when preconditions pass", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "Resident1", actor);
    const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
    accountIds.push(accountId);
    const roomA = await createRoom(hh.context, "Room A", actor);

    const opened = await createAndOpenRound(hh.context, "Good round", [roomA.id], actor);
    expect(opened.status).toBe("open");

    const rounds = await withSessionContext(hh.context, (tx) =>
      tx.select().from(castingRound).where(eq(castingRound.householdId, hh!.householdId)),
    );
    expect(rounds).toHaveLength(1);
  });
});
