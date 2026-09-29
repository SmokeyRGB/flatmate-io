import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { application, castingRound } from "@/modules/casting/schema";
import {
  assertPayloadAllowed,
  payloadKeysWithoutValueRule,
  PayloadValidationError,
  recordActivityEvent,
  redactExpiredActivityEvents,
} from "@/modules/audit/repository";
import { insertTestRound, syntheticApplication } from "../../helpers/applications";
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

  // join-by-link (FR-2.19/AC-2.19, design.md Decision 8): membership.joined is registered with an
  // EMPTY key list — the issuance is the joinedViaIssuanceId column, never a second copy here, and
  // the code (G-A5) never enters a payload at all.
  it("accepts an empty payload for membership.joined but rejects any key at all", () => {
    expect(() => assertPayloadAllowed("membership.joined", {})).not.toThrow();
    expect(() => assertPayloadAllowed("membership.joined", { issuanceId: "x" })).toThrow(
      PayloadValidationError,
    );
  });
});

// G-D7 for VALUES (Copilot, PR #41): a key on the allowlist still refused free text as its value,
// at the write boundary, for every caller of recordActivityEvent. Breaks: drop the value check in
// assertPayloadAllowed and the free-text cases pass through; remove one rule and the coverage case
// names it.
describe("ActivityEvent payload values (G-D7)", () => {
  const SENTINEL = "Lea Testbewerbung, 0151 23125 0100";

  it("every allowlisted key has a value rule, so a new key must declare its shape", () => {
    expect(payloadKeysWithoutValueRule()).toEqual([]);
  });

  it("accepts the fixed shapes the writers produce", () => {
    expect(() => assertPayloadAllowed("application.updated", { fields: ["messageRaw", "collectedFrom"] })).not.toThrow();
    expect(() => assertPayloadAllowed("application.created", { source: "manual_form", collectedFrom: "third_party" })).not.toThrow();
    expect(() => assertPayloadAllowed("casting_round.opened", { participantCount: 0 })).not.toThrow();
    expect(() =>
      assertPayloadAllowed("household_settings.changed", { field: "quorumShare,scaleWeights" }),
    ).not.toThrow();
    expect(() =>
      assertPayloadAllowed("household_settings.changed_while_round_open", {
        field: "quorumShare",
        roundId: "5f3c2a10-8f6e-4d2b-9a41-2c7e3b9d1f00",
      }),
    ).not.toThrow();
    expect(() => assertPayloadAllowed("membership.role_changed", { fromRole: "member", toRole: "moderator" })).not.toThrow();
  });

  const refused: [string, string, Record<string, unknown>][] = [
    ["free text in the correction's field list", "application.updated", { fields: [SENTINEL] }],
    ["a real field name next to free text", "application.updated", { fields: ["messageRaw", SENTINEL] }],
    ["an empty field list", "application.updated", { fields: [] }],
    ["a repeated field name", "application.updated", { fields: ["age", "age"] }],
    ["the field list as a string", "application.updated", { fields: "messageRaw" }],
    ["free text as a state", "application.state_changed", { fromState: "new", toState: SENTINEL }],
    ["free text as the collection source", "application.created", { source: "manual_form", collectedFrom: SENTINEL }],
    ["free text as a settings field", "household_settings.changed", { field: `quorumShare,${SENTINEL}` }],
    ["a round id that is not an id", "household_settings.changed_while_round_open", { field: "quorumShare", roundId: SENTINEL }],
    ["a count that is text", "casting_round.opened", { participantCount: SENTINEL }],
    ["a role that is free text", "membership.role_changed", { fromRole: "member", toRole: SENTINEL }],
  ];
  for (const [label, eventType, payload] of refused) {
    it(`refuses ${label}, and the error never carries the value`, () => {
      let caught: unknown;
      try {
        assertPayloadAllowed(eventType, payload);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(PayloadValidationError);
      expect((caught as Error).message).not.toContain(SENTINEL);
    });
  }
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
    // G-D15 (openspec application-requires-resident-profile, design Decision 6, human-approved
    // 2026-09-24, teardown only): `application` now carries a RESTRICTIVE policy requiring a
    // resident profile. A profile-less context here would make this DELETE match zero rows and
    // silently orphan the seeded rows instead of removing them — a synthetic profile id is used
    // only to satisfy the policy for this teardown delete (Decision 1's policy checks presence,
    // not identity).
    for (const householdId of seededHouseholds) {
      await withSessionContext({ accountId: uuid(), householdId, profileId: uuid() }, (tx) =>
        tx.delete(application).where(eq(application.householdId, householdId)),
      );
      // The seeded round (drizzle/0023: an application needs a real round) is removed as well.
      await withSessionContext({ accountId: uuid(), householdId, profileId: uuid() }, (tx) =>
        tx.delete(castingRound).where(eq(castingRound.householdId, householdId)),
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
      async (tx) => {
        const roundId = await insertTestRound(tx, householdId);
        return tx
          .insert(application)
          .values(
            syntheticApplication(
              { householdId, roundId, createdByAccountId: uuid(), createdByProfileId: profileId },
              { state: "archived", retentionUntil: pastDate },
            ),
          )
          .returning();
      },
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
      async (tx) => {
        const roundId = await insertTestRound(tx, householdId);
        return tx
          .insert(application)
          .values(
            syntheticApplication(
              { householdId, roundId, createdByAccountId: uuid(), createdByProfileId: profileId },
              { state: "new", retentionUntil: futureDate },
            ),
          )
          .returning();
      },
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
