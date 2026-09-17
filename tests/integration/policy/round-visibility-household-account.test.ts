import { describe, expect, it } from "vitest";
import { createRoom, createRound, getRoundForSession } from "@/modules/casting/repository";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// [GUARDED] G-D15 (policy layer) — GUARDRAIL: G-D15 — siehe GUARDRAILS.md / ADR-014.
// A profile-less session reads a round's identity/lifecycle only — nothing Application-derived.
describe("[GUARDED] G-D15: a household-account session sees round identity/lifecycle only", () => {
  it("returns exactly the ADR-014 column set via the policy layer", async () => {
    let hh: TestHousehold | undefined;
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };
      const roomA = await createRoom(hh.context, "Room A", actor);
      const round = await createRound(hh.context, "Test round", [roomA.id], actor);

      // hh.context.profileId is already null (a household-account session).
      const seen = await getRoundForSession(hh.context, round.id);

      expect(seen).not.toBeNull();
      expect(Object.keys(seen!).sort()).toEqual(
        [
          "id",
          "household_id",
          "title",
          "status",
          "room_ids",
          "opened_at",
          "closed_at",
          "phase_deadline_at",
          "retention_until",
          "retention_extensions",
          "retention_warned_at",
        ].sort(),
      );
    } finally {
      if (hh) await hh.cleanup();
    }
  });
});
