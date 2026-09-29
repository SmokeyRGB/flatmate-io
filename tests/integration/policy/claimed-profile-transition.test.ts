import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import {
  ClaimedProfileTransitionError,
  transitionResidentProfileStatus,
} from "@/modules/identity/repository";
import { membership, residentProfile } from "@/modules/identity/schema";
import {
  cleanupAll,
  createTestModerator,
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

// Copilot, PR #39: a direct status change of a CLAIMED profile (one with a membership row) would
// leave a live membership acting for a moved-out person (V-3). It is refused; setMovedOut,
// removeMember and reactivateMember are the paths that also revoke or restore the membership.
describe("transitionResidentProfileStatus refuses a claimed profile", () => {
  it("refuses moved_out and removed for a claimed moderator and leaves membership and profile unchanged", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const moderator = await createTestModerator(hh);
    accountIds.push(moderator.accountId);

    const membershipBefore = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.accountId, moderator.accountId)),
    );

    for (const target of ["moved_out", "removed"] as const) {
      let caught: unknown;
      try {
        await transitionResidentProfileStatus(hh.context, moderator.profileId, target, adminActor);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ClaimedProfileTransitionError);
      expect((caught as ClaimedProfileTransitionError).code).toBe("claimed_profile_transition");
    }

    const membershipAfter = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.accountId, moderator.accountId)),
    );
    expect(membershipAfter).toEqual(membershipBefore);
    expect(membershipAfter[0].revokedAt).toBeNull();

    const [profile] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.id, moderator.profileId)),
    );
    expect(profile.status).toBe("active");
  });

  // Deliberate break: delete the ClaimedProfileTransitionError refusal in
  // transitionResidentProfileStatus. The moderator's profile is then moved out with the membership
  // still live, so the first caught value is undefined and toBeInstanceOf fails.
});
