import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { recordActivityEvent } from "@/modules/audit/repository";
import { uuid } from "../../helpers/uuid";

// FR-0.13/AC-0.11: an UPDATE or DELETE on an existing ActivityEvent fails through the application
// and through raw SQL. Both paths run as app_runtime, the role the running application connects
// as; the third path FR-0.13 names — "a migration" — runs as the table-owning role instead, which
// this app's own credentials cannot connect as. That path's guarantee is structural, not
// app-testable: `ALTER TABLE activity_event FORCE ROW LEVEL SECURITY` (in the schema migration)
// applies the same restrictive USING(false) policies to the owner too, per Postgres's own
// semantics for FORCE — not re-asserted here as a redundant, untestable-from-here claim.
describe("ActivityEvent immutability (FR-0.13, AC-0.11)", () => {
  it("rejects UPDATE and DELETE through the Drizzle query builder (no repository path exists for either)", async () => {
    const householdId = uuid();
    const profileId = uuid();

    const event = await withSessionContext({ householdId, residentProfileId: profileId }, (tx) =>
      recordActivityEvent(tx, {
        householdId,
        eventType: "application.state_changed",
        subjectType: "application",
        subjectId: uuid(),
        actorAccountId: null,
        actorProfileId: profileId,
        payload: { fromState: "new", toState: "screened" },
      }),
    );

    const updateResult = await withSessionContext(
      { householdId, residentProfileId: profileId },
      (tx) =>
        tx
          .update(activityEvent)
          .set({ eventType: "tampered" })
          .where(eq(activityEvent.id, event.id))
          .returning(),
    );
    expect(updateResult).toHaveLength(0);

    const deleteResult = await withSessionContext(
      { householdId, residentProfileId: profileId },
      (tx) => tx.delete(activityEvent).where(eq(activityEvent.id, event.id)).returning(),
    );
    expect(deleteResult).toHaveLength(0);

    const [stillThere] = await withSessionContext(
      { householdId, residentProfileId: profileId },
      (tx) => tx.select().from(activityEvent).where(eq(activityEvent.id, event.id)),
    );
    expect(stillThere).toBeDefined();
    expect(stillThere.eventType).toBe("application.state_changed");
  });

  it("rejects UPDATE and DELETE via raw SQL", async () => {
    const householdId = uuid();
    const profileId = uuid();

    const event = await withSessionContext({ householdId, residentProfileId: profileId }, (tx) =>
      recordActivityEvent(tx, {
        householdId,
        eventType: "application.state_changed",
        subjectType: "application",
        subjectId: uuid(),
        actorAccountId: null,
        actorProfileId: profileId,
        payload: {},
      }),
    );

    const rawUpdate = await withSessionContext(
      { householdId, residentProfileId: profileId },
      (tx) =>
        tx.execute(
          sql`UPDATE activity_event SET event_type = 'tampered' WHERE id = ${event.id}::uuid RETURNING id`,
        ),
    );
    expect(rawUpdate).toHaveLength(0);

    const rawDelete = await withSessionContext(
      { householdId, residentProfileId: profileId },
      (tx) => tx.execute(sql`DELETE FROM activity_event WHERE id = ${event.id}::uuid RETURNING id`),
    );
    expect(rawDelete).toHaveLength(0);
  });
});
