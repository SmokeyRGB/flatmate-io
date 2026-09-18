import { afterEach, describe, expect, it } from "vitest";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  assertIsAdministration,
  createResidentProfile,
  ResidentListActionDeniedError,
} from "@/modules/identity/repository";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

let hh: TestHousehold | undefined;
let memberAccountId: string | undefined;

afterEach(async () => {
  await cleanupAll(memberAccountId ? deleteTestAccount(memberAccountId) : undefined, hh?.cleanup());
  memberAccountId = undefined;
  hh = undefined;
});

// Convergence (Copilot PR #4 review): the O20 settings page
// (src/app/(org)/settings/page.tsx) had no authorization check at all — any signed-in resident
// could read the household's quorum share, even though docs/screens/O-organisation.md's O20 says
// "Nur household_admin, unabhängig von acting_profile_id". The page now guards its data fetch
// with assertIsAdministration; this pins that guard's behavior directly.
describe("Settings page admin guard (O20)", () => {
  it("refuses a plain resident and permits household_admin", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "Resident1", actor);
    const claimed = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
    memberAccountId = claimed.accountId;

    await expect(assertIsAdministration(hh.context, memberAccountId)).rejects.toThrow(
      ResidentListActionDeniedError,
    );
    await expect(assertIsAdministration(hh.context, hh.accountId)).resolves.toBeUndefined();
  });
});
