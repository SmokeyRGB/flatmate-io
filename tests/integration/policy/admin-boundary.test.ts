import { describe, expect, it } from "vitest";
import { assertHasResidentProfile, PermissionDeniedError } from "@/modules/identity/repository";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";
import { uuid } from "../../helpers/uuid";

// AC-1.16/FR-1.23: a profile-less session is refused any route that requires an active resident
// profile. F1 builds no Application/Vote/Slot/Appointment/CastingNote table yet (F3-F5); this
// asserts the boundary check itself, re-exercised against each new table as it lands
// (quickstart.md §4 — not restated here, per the constitution's "cite, don't restate").
describe("Administration boundary (FR-1.23)", () => {
  it("refuses a profile-less session on any route gated by assertHasResidentProfile", () => {
    const profileLessContext = { accountId: uuid(), householdId: uuid(), profileId: null };
    expect(() => assertHasResidentProfile(profileLessContext)).toThrow(PermissionDeniedError);
  });

  it("permits a resident session", async () => {
    let household: TestHousehold | undefined;
    try {
      household = await registerTestHousehold();
      const residentContext = { ...household.context, profileId: uuid() };
      expect(() => assertHasResidentProfile(residentContext)).not.toThrow();
    } finally {
      if (household) await household.cleanup();
    }
  });
});
