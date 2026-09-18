import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { application } from "@/modules/casting/schema";
import { transitionApplication } from "@/modules/casting/repository";
import { isBackwardTransition } from "@/modules/casting/transitions";
import { uuid } from "../../helpers/uuid";

// FR-0.11: a permitted backward transition produces exactly one ActivityEvent naming the acting
// account and profile and recording the originating and target state.
describe("Backward transition produces exactly one ActivityEvent (FR-0.11, G-D3)", () => {
  // These households are invented uuids that no Household row backs, so registerTestHousehold's
  // cleanup() never covered them and each run leaked its Application. The ActivityEvent this test
  // asserts on is append-only (FR-0.13) and stays by design.
  const seededHouseholds: string[] = [];

  afterEach(async () => {
    for (const householdId of seededHouseholds) {
      await withSessionContext({ accountId: uuid(), householdId, profileId: null }, (tx) =>
        tx.delete(application).where(eq(application.householdId, householdId)),
      );
    }
    seededHouseholds.length = 0;
  });

  it("records actor_account_id, actor_profile_id, fromState, and toState on screened -> new", async () => {
    expect(isBackwardTransition("screened", "new")).toBe(true);

    const householdId = uuid();
    seededHouseholds.push(householdId);
    const profileId = uuid();
    const actor = { accountId: uuid(), profileId };

    const [seed] = await withSessionContext({ accountId: uuid(), householdId, profileId: profileId }, (tx) =>
      tx
        .insert(application)
        .values({
          householdId,
          state: "screened",
          createdByAccountId: uuid(),
          createdByProfileId: profileId,
        })
        .returning(),
    );

    await transitionApplication(
      { accountId: uuid(), householdId, profileId: profileId },
      seed.id,
      "new",
      actor,
    );

    const events = await withSessionContext({ accountId: uuid(), householdId, profileId: profileId }, (tx) =>
      tx
        .select()
        .from(activityEvent)
        .where(eq(activityEvent.subjectId, seed.id)),
    );

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.actorAccountId).toBe(actor.accountId);
    expect(event.actorProfileId).toBe(actor.profileId);
    expect(event.payload).toEqual({ fromState: "screened", toState: "new" });
  });
});
