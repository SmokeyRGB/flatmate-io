import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { application } from "@/modules/casting/schema";
import {
  assertPayloadAllowed,
  PayloadValidationError,
  recordActivityEvent,
  redactExpiredActivityEvents,
} from "@/modules/audit/repository";
import { uuid } from "../../helpers/uuid";

// FR-0.14/EC-0.5/G-D7: payload validated against a positive list of allowed keys per event_type.
describe("ActivityEvent payload allowlist (FR-0.14, EC-0.5, G-D7)", () => {
  it("accepts a references/counters-shaped payload for a registered event_type", () => {
    expect(() =>
      assertPayloadAllowed("application.state_changed", { fromState: "new", toState: "screened" }),
    ).not.toThrow();
  });

  it("rejects a bare `value` key", () => {
    expect(() => assertPayloadAllowed("application.state_changed", { value: "no" })).toThrow(
      PayloadValidationError,
    );
  });

  it("rejects free text on any key not on the positive list", () => {
    expect(() =>
      assertPayloadAllowed("application.state_changed", {
        fromState: "new",
        note: "the applicant seemed nice",
      }),
    ).toThrow(PayloadValidationError);
  });

  it("rejects an event_type with no registered allowlist at all", () => {
    expect(() => assertPayloadAllowed("something.unregistered", { anything: 1 })).toThrow(
      PayloadValidationError,
    );
  });
});

// FR-0.13/G-D8: end-of-retention redaction nulls only the 🔴/⚫-classified payload keys for an
// event_type, leaving everything else — structure, timestamps, the actor/action-kind chain, and
// any non-sensitive key — readable. Fixed 2026-09-17 (/speckit-converge T046): this test
// originally asserted the payload became `{}` entirely, which was the bug, not the spec — see
// src/modules/audit/repository.ts's REDACTABLE_KEYS comment for the full history.
describe("ActivityEvent retention redaction (FR-0.13, EC-0.6, G-D8)", () => {
  // These households are invented uuids that no Household row backs, so registerTestHousehold's
  // cleanup() never covered them and each run leaked two Applications. The ActivityEvents these
  // tests assert on are append-only (FR-0.13) and stay by design.
  const seededHouseholds: string[] = [];

  afterEach(async () => {
    for (const householdId of seededHouseholds) {
      await withSessionContext({ accountId: uuid(), householdId, profileId: null }, (tx) =>
        tx.delete(application).where(eq(application.householdId, householdId)),
      );
    }
    seededHouseholds.length = 0;
  });

  it("leaves application.state_changed's payload untouched — fromState/toState are state names, not personal data, so nothing is classified sensitive for this event_type", async () => {
    const householdId = uuid();
    seededHouseholds.push(householdId);
    const profileId = uuid();
    const pastDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [expiredApplication] = await withSessionContext(
      { accountId: uuid(), householdId, profileId: profileId },
      (tx) =>
        tx
          .insert(application)
          .values({
            householdId,
            state: "archived",
            createdByAccountId: uuid(),
            createdByProfileId: profileId,
            retentionUntil: pastDate,
          })
          .returning(),
    );

    const event = await withSessionContext({ accountId: uuid(), householdId, profileId: profileId }, (tx) =>
      recordActivityEvent(tx, {
        householdId,
        eventType: "application.state_changed",
        subjectType: "application",
        subjectId: expiredApplication.id,
        actorAccountId: uuid(),
        actorProfileId: profileId,
        payload: { fromState: "new", toState: "archived" },
      }),
    );

    const redactedCount = await withSessionContext(
      { accountId: uuid(), householdId, profileId: profileId },
      (tx) => redactExpiredActivityEvents(tx),
    );

    // Nothing classified sensitive for this event_type — correctly a no-op, not a partial clear.
    expect(redactedCount).toBe(0);

    const [afterRedaction] = await withSessionContext(
      { accountId: uuid(), householdId, profileId: profileId },
      (tx) => tx.select().from(activityEvent).where(eq(activityEvent.id, event.id)),
    );

    // The accountability data (what state it moved from/to) survives, exactly as FR-0.13's own
    // rationale requires ("die Rechenschaftskette ist noch lesbar") — plus structure/timestamps.
    expect(afterRedaction.payload).toEqual({ fromState: "new", toState: "archived" });
    expect(afterRedaction.id).toBe(event.id);
    expect(afterRedaction.eventType).toBe("application.state_changed");
    expect(afterRedaction.actorProfileId).toBe(profileId);
    expect(afterRedaction.occurredAt).toBeInstanceOf(Date);
  });

  it("does not touch events referencing an Application whose retention has not yet expired", async () => {
    const householdId = uuid();
    seededHouseholds.push(householdId);
    const profileId = uuid();
    const futureDate = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [activeApplication] = await withSessionContext(
      { accountId: uuid(), householdId, profileId: profileId },
      (tx) =>
        tx
          .insert(application)
          .values({
            householdId,
            state: "new",
            createdByAccountId: uuid(),
            createdByProfileId: profileId,
            retentionUntil: futureDate,
          })
          .returning(),
    );

    await withSessionContext({ accountId: uuid(), householdId, profileId: profileId }, (tx) =>
      recordActivityEvent(tx, {
        householdId,
        eventType: "application.state_changed",
        subjectType: "application",
        subjectId: activeApplication.id,
        actorAccountId: null,
        actorProfileId: profileId,
        payload: { fromState: "new", toState: "screened" },
      }),
    );

    const redactedCount = await withSessionContext(
      { accountId: uuid(), householdId, profileId: profileId },
      (tx) => redactExpiredActivityEvents(tx),
    );

    expect(redactedCount).toBe(0);
  });
});
