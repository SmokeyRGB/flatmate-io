import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { application } from "@/modules/casting/schema";
import { transitionApplication } from "@/modules/casting/repository";
import { isBackwardTransition } from "@/modules/casting/transitions";
import { insertTestRound, syntheticApplication } from "../../helpers/applications";
import { createTestModerator, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// FR-0.11: a permitted backward transition produces exactly one ActivityEvent naming the acting
// account and profile and recording the originating and target state.
describe("Backward transition produces exactly one ActivityEvent (FR-0.11, G-D3)", () => {
  // Setup only (F3 change 3, FR-3.24): transitionApplication now checks the caller's permission
  // in the repository, so the acting account must be a real moderator of a real household. The
  // ActivityEvent this test asserts on is append-only (FR-0.13) and stays by design; everything
  // else, the seeded round and application included, goes with hh.cleanup().
  let hh: TestHousehold | undefined;

  afterEach(async () => {
    await hh?.cleanup();
    hh = undefined;
  });

  it("records actor_account_id, actor_profile_id, fromState, and toState on screened -> new", async () => {
    expect(isBackwardTransition("screened", "new")).toBe(true);

    hh = await registerTestHousehold();
    const householdId = hh.householdId;
    const moderator = await createTestModerator(hh);
    const profileId = moderator.profileId;
    const actor = { accountId: moderator.accountId, profileId: moderator.profileId };

    const [seed] = await withSessionContext(moderator.context, async (tx) => {
      const roundId = await insertTestRound(tx, householdId);
      return tx
        .insert(application)
        .values(
          syntheticApplication(
            { householdId, roundId, createdByAccountId: moderator.accountId, createdByProfileId: profileId },
            { state: "screened" },
          ),
        )
        .returning();
    });

    await transitionApplication(moderator.context, seed.id, "new");

    const events = await withSessionContext(moderator.context, (tx) =>
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
