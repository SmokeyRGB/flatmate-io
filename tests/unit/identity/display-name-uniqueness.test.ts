import { afterEach, describe, expect, it } from "vitest";
import {
  createResidentProfile,
  DuplicateDisplayNameError,
  transitionResidentProfileStatus,
} from "@/modules/identity/repository";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;

afterEach(async () => {
  if (hh) await hh.cleanup();
  hh = undefined;
});

// AC-1.3/AC-1.4, FR-1.4: unique among status != moved_out profiles within a household.
describe("ResidentProfile display_name uniqueness", () => {
  it("refuses a second active profile with the same name (AC-1.3)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    await createResidentProfile(hh.context, "Jonas", actor);

    await expect(createResidentProfile(hh.context, "Jonas", actor)).rejects.toThrow(
      DuplicateDisplayNameError,
    );
  });

  it("allows a new profile once the only same-named one is moved_out (AC-1.4)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const first = await createResidentProfile(hh.context, "Jonas", actor);
    await transitionResidentProfileStatus(hh.context, first.id, "moved_out", actor);

    await expect(createResidentProfile(hh.context, "Jonas", actor)).resolves.toMatchObject({
      displayName: "Jonas",
      status: "prepared",
    });
  });
});
