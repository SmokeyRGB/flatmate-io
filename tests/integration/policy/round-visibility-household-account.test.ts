import { afterEach, describe, expect, it } from "vitest";
import {
  createRoom,
  createRound,
  getRoundForSession,
  getRoundParticipants,
} from "@/modules/casting/repository";
import { createTestModerator, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;

afterEach(async () => {
  if (hh) await hh.cleanup();
  hh = undefined;
});

// [GUARDED] G-D15 (policy layer) — GUARDRAIL: G-D15 — siehe GUARDRAILS.md / ADR-014.
// A profile-less session reads a round's identity/lifecycle only — nothing Application-derived.
describe("[GUARDED] G-D15: a household-account session sees round identity/lifecycle only", () => {
  it("returns exactly the ADR-014 column set via the policy layer", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const roomA = await createRoom(hh.context, "Room A", actor);
    // Setup only (design D13): the household account no longer creates rounds (S-50/U-20), so a
    // moderator does. The assertions below still read the round as the household account.
    const moderator = await createTestModerator(hh);
    const round = await createRound(moderator.context, "Test round", [roomA.id], {
      accountId: moderator.accountId,
      profileId: moderator.profileId,
    });

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
  });

  // rounds-page-participant-leak: getRoundForSession's column restriction above was covered, but
  // getRoundParticipants (a sibling repository read used by the round-detail route) had no
  // equivalent profile-less guard — it leaked participant display names. Pins the fix in place.
  it("getRoundParticipants refuses participant data for a profile-less session", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const roomA = await createRoom(hh.context, "Room A", actor);
    // Setup only (design D13): the household account no longer creates rounds (S-50/U-20), so a
    // moderator does. The assertions below still read the round as the household account.
    const moderator = await createTestModerator(hh);
    const round = await createRound(moderator.context, "Test round", [roomA.id], {
      accountId: moderator.accountId,
      profileId: moderator.profileId,
    });

    const participants = await getRoundParticipants(hh.context, round.id);

    expect(participants).toEqual([]);
  });
});
