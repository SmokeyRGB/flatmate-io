import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  createResidentProfile,
  getResidentList,
  PermissionDeniedError,
  setMovedOut,
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

// FR-1.25/FR-1.26/FR-1.27 (revised 2026-09-17, U-30)/AC-1.20/AC-1.21.
describe("Resident list access by role", () => {
  it("administration and a moderator both get full data and canAct = true (parity, U-30)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const modProfile = await createResidentProfile(hh.context, "Moderator", actor);
    const { accountId: modAccountId } = await claimResidentProfile(
      hh.context,
      modProfile.id,
      "test-password-not-real-1234",
    );
    accountIds.push(modAccountId);
    await withSessionContext(hh.context, (tx) =>
      tx.update(membership).set({ role: "moderator" }).where(eq(membership.accountId, modAccountId)),
    );

    const memberProfile = await createResidentProfile(hh.context, "PlainMember", actor);
    const { accountId: memberAccountId } = await claimResidentProfile(
      hh.context,
      memberProfile.id,
      "test-password-not-real-1234",
    );
    accountIds.push(memberAccountId);

    const asAdmin = await getResidentList(hh.context, hh.accountId);
    expect(asAdmin.canAct).toBe(true);
    expect(asAdmin.members.length).toBeGreaterThanOrEqual(2);

    // getResidentList enforces its own inline admin/moderator gate (not one of the four
    // assertHasPermission/assertIsAdministration[OrModerator]/assertAccountCanVote helpers), so
    // it is unaffected by PR #19 review's session-derived check and can still be called with
    // hh.context regardless of which accountId is passed.
    const asModerator = await getResidentList(hh.context, modAccountId);
    expect(asModerator.canAct).toBe(true); // U-30: full parity, not read-only
    expect(asModerator.members.length).toBe(asAdmin.members.length);

    // Parity means a moderator can actually act, not just see canAct = true. setMovedOut DOES
    // route through assertIsAdministrationOrModerator, so PR #19 review's check requires the
    // moderator's OWN SessionContext here, not hh.context (the admin's).
    const modContext = { accountId: modAccountId, householdId: hh.householdId, profileId: modProfile.id };
    await expect(setMovedOut(modContext, modAccountId, memberAccountId)).resolves.not.toThrow();

    // AC-1.21: a non-moderator member is refused by the one function this list has.
    await expect(getResidentList(hh.context, memberAccountId)).rejects.toThrow(PermissionDeniedError);
  });
});
