import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
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

// FR-0.13/G-D8: end-of-retention redaction clears payload but leaves structure, timestamps, and
// the actor/action-kind chain readable.
describe("ActivityEvent retention redaction (FR-0.13, EC-0.6, G-D8)", () => {
  it("clears payload on events referencing an Application past its retention_until, keeps the rest readable", async () => {
    const householdId = uuid();
    const profileId = uuid();
    const pastDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [expiredApplication] = await withSessionContext(
      { householdId, residentProfileId: profileId },
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

    const event = await withSessionContext({ householdId, residentProfileId: profileId }, (tx) =>
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

    await withSessionContext({ householdId, residentProfileId: profileId }, (tx) =>
      redactExpiredActivityEvents(tx),
    );

    const [redacted] = await withSessionContext(
      { householdId, residentProfileId: profileId },
      (tx) => tx.select().from(activityEvent).where(eq(activityEvent.id, event.id)),
    );

    expect(redacted.payload).toEqual({});
    // Structure, timestamps, and the actor/action-kind chain stay readable.
    expect(redacted.id).toBe(event.id);
    expect(redacted.eventType).toBe("application.state_changed");
    expect(redacted.actorProfileId).toBe(profileId);
    expect(redacted.occurredAt).toBeInstanceOf(Date);
  });
});
