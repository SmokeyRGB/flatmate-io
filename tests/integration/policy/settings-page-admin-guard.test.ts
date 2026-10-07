import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  createResidentProfile,
  getHouseholdSettings,
  PermissionDeniedError,
  setMemberRole,
} from "@/modules/identity/repository";
import { membership } from "@/modules/identity/schema";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

async function claim(household: TestHousehold, name: string) {
  const actor = { accountId: household.accountId, profileId: null };
  const profile = await createResidentProfile(household.context, name, actor);
  const claimed = await claimResidentProfile(household.context, profile.id, "test-password-not-real-1234", "de");
  accountIds.push(claimed.accountId);
  return {
    accountId: claimed.accountId,
    context: { accountId: claimed.accountId, householdId: household.householdId, profileId: profile.id },
  };
}

// Convergence (Copilot PR #4 review): the O20 settings page (src/app/(org)/settings/page.tsx) had no
// authorization check at all — any signed-in resident could read the household's quorum share. F3
// change 2b moved the check into the repository's getHouseholdSettings itself (authorization lives
// in the repository function, not in the route that happens to call it) and from the role to the
// stored permission `manage_voting_procedure` (matrix row „Abstimmungsverfahren ändern": household
// ✅, moderator ⬜). This pins that guard directly.
describe("Settings read guard (O20): getHouseholdSettings checks manage_voting_procedure", () => {
  it("refuses a plain resident and a moderator, permits the household account", async () => {
    hh = await registerTestHousehold();
    const resident = await claim(hh, "Resident1");
    const moderator = await claim(hh, "Moderator1");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");

    await expect(getHouseholdSettings(resident.context)).rejects.toThrow(PermissionDeniedError);
    await expect(getHouseholdSettings(moderator.context)).rejects.toThrow(PermissionDeniedError);
    await expect(getHouseholdSettings(hh.context)).resolves.not.toBeUndefined();
  });

  it("permits a moderator that was individually granted manage_voting_procedure (the one grant the matrix leaves)", async () => {
    hh = await registerTestHousehold();
    const moderator = await claim(hh, "GrantedModerator");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");
    // No screen or function grants one; this is the row write the real thing would produce.
    await withSessionContext(hh.context, (tx) =>
      tx
        .update(membership)
        .set({ permissions: sql`permissions || ARRAY['manage_voting_procedure']::text[]` })
        .where(eq(membership.accountId, moderator.accountId)),
    );

    await expect(getHouseholdSettings(moderator.context)).resolves.not.toBeUndefined();
  });
});
