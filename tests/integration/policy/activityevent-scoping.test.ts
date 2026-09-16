import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { recordActivityEvent } from "@/modules/audit/repository";
import { uuid } from "../../helpers/uuid";

// FR-0.2/AC-0.6, via the policy layer — found missing for ActivityEvent by /speckit-analyze
// (2026-09-16): the same household-isolation guarantee User Story 1 requires for Application,
// since ActivityEvent also carries household_id (data-model.md's "RLS-Anker"). Rows are never
// deleted here (FR-0.13, append-only) — unique per-run UUIDs keep runs independent instead.
describe("ActivityEvent household isolation — policy layer (FR-0.2/AC-0.6)", () => {
  it("returns zero rows from another household, with no WHERE clause in the query", async () => {
    const householdA = uuid();
    const householdB = uuid();
    const subjectA = uuid();
    const subjectB = uuid();

    const eventA = await withSessionContext(
      { householdId: householdA, residentProfileId: uuid() },
      (tx) =>
        recordActivityEvent(tx, {
          householdId: householdA,
          eventType: "application.state_changed",
          subjectType: "application",
          subjectId: subjectA,
          actorAccountId: null,
          actorProfileId: null,
          payload: { fromState: "new", toState: "screened" },
        }),
    );

    const eventB = await withSessionContext(
      { householdId: householdB, residentProfileId: uuid() },
      (tx) =>
        recordActivityEvent(tx, {
          householdId: householdB,
          eventType: "application.state_changed",
          subjectType: "application",
          subjectId: subjectB,
          actorAccountId: null,
          actorProfileId: null,
          payload: { fromState: "new", toState: "screened" },
        }),
    );

    const rowsSeenByA = await withSessionContext(
      { householdId: householdA, residentProfileId: uuid() },
      (tx) => tx.select().from(activityEvent), // deliberately no .where(...)
    );

    const ids = rowsSeenByA.map((r) => r.id);
    expect(ids).toContain(eventA.id);
    expect(ids).not.toContain(eventB.id);
    expect(rowsSeenByA.every((row) => row.householdId === householdA)).toBe(true);
  });
});
