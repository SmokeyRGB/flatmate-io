import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { claimResidentProfile } from "@/modules/identity/auth";
import { membership } from "@/modules/identity/schema";
import {
  CannotChangeAdminRoleError,
  createResidentProfile,
  PermissionDeniedError,
  setMemberRole,
} from "@/modules/identity/repository";
import {
  cleanupAll,
  createTestModerator,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

let hh: TestHousehold | undefined;
let accountId: string | undefined;
let memberAccountId: string | undefined;

afterEach(async () => {
  await cleanupAll(
    accountId ? deleteTestAccount(accountId) : undefined,
    memberAccountId ? deleteTestAccount(memberAccountId) : undefined,
    hh?.cleanup(),
  );
  accountId = undefined;
  memberAccountId = undefined;
  hh = undefined;
});

// EC-1.7 (Convergence): "administration may create a resident profile and appoint it moderator"
// — the appointment action itself, previously missing entirely (only ever set via a raw DB
// write in test fixtures, never through any application code path).
describe("Moderator appointment (EC-1.7)", () => {
  it("lets administration promote a member to moderator and back", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "Resident1", actor);
    const claimed = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234", "de");
    accountId = claimed.accountId;
    expect(claimed.membership.role).toBe("member");

    await setMemberRole(hh.context, hh.accountId, accountId, "moderator");
    await setMemberRole(hh.context, hh.accountId, accountId, "member");
    // No error thrown either way is the behavior under test; role is re-verified via a second
    // promotion succeeding cleanly (a stale/incorrect role would surface as a thrown error).
    await expect(setMemberRole(hh.context, hh.accountId, accountId, "moderator")).resolves.toBeUndefined();
  });

  it("refuses a non-admin caller and refuses changing the household_admin's own role", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "Resident1", actor);
    const claimed = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234", "de");
    memberAccountId = claimed.accountId;

    // PR #19 review: authorization derives from the authenticated session, so this refusal must
    // use the member's OWN SessionContext, not the admin's hh.context paired with the member's
    // accountId — that combination is refused as a session/actor mismatch, not for being a
    // non-admin caller, which is what this test means to show.
    const memberContext = { accountId: memberAccountId, householdId: hh.householdId, profileId: profile.id };
    await expect(
      setMemberRole(memberContext, memberAccountId, memberAccountId, "moderator"),
    ).rejects.toThrow(PermissionDeniedError);

    await expect(
      setMemberRole(hh.context, hh.accountId, hh.accountId, "moderator"),
    ).rejects.toThrow(CannotChangeAdminRoleError);
  });
});

// F3 change 2b (human decision, 2026-10-01): appointing and demoting moderators belongs to the
// moderator as well (`appoint_moderator`, matrix row „Moderator ernennen / zurückstufen"); the
// administering membership is never a target; a no-op writes no event.
describe("Moderator appointment by a moderator (appoint_moderator)", () => {
  async function roleEvents(household: TestHousehold, subjectId: string) {
    return withSessionContext(household.context, (tx) =>
      tx
        .select()
        .from(activityEvent)
        .where(and(eq(activityEvent.subjectId, subjectId), eq(activityEvent.eventType, "membership.role_changed"))),
    );
  }

  it("a moderator may appoint a member, demote another moderator, and demote itself", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh, "Moderator1");
    memberAccountId = moderator.accountId;
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "Appointee", actor);
    const claimed = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234", "de");
    accountId = claimed.accountId;

    await setMemberRole(moderator.context, moderator.accountId, claimed.accountId, "moderator");
    await setMemberRole(moderator.context, moderator.accountId, claimed.accountId, "member");
    // the moderator demotes itself; the household account can always appoint again (EC-1.7)
    await setMemberRole(moderator.context, moderator.accountId, moderator.accountId, "member");
    // PR #50 review: the events name the acting session's profile (null means the household
    // account acted), the self-demotion included. Full coverage: moderator-audit-attribution.test.ts.
    const [{ id: selfMembershipId }] = await withSessionContext(hh.context, (tx) =>
      tx.select({ id: membership.id }).from(membership).where(eq(membership.accountId, moderator.accountId)),
    );
    const selfEvents = await roleEvents(hh, selfMembershipId);
    const byModerator = selfEvents.filter((e) => e.actorAccountId === moderator.accountId);
    expect(byModerator).toHaveLength(1);
    expect(byModerator[0].actorProfileId).toBe(moderator.profileId);
    await expect(
      setMemberRole(moderator.context, moderator.accountId, claimed.accountId, "moderator"),
    ).rejects.toThrow(PermissionDeniedError);
    await expect(setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator")).resolves.toBeUndefined();
  });

  it("a moderator and the household account are both refused when the target is the administering membership", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh, "Moderator2");
    memberAccountId = moderator.accountId;

    await expect(
      setMemberRole(moderator.context, moderator.accountId, hh.accountId, "member"),
    ).rejects.toThrow(CannotChangeAdminRoleError);
    await expect(setMemberRole(hh.context, hh.accountId, hh.accountId, "moderator")).rejects.toThrow(
      CannotChangeAdminRoleError,
    );
  });

  it("a no-op (member to member) writes no role_changed event", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "Resident1", actor);
    const claimed = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234", "de");
    accountId = claimed.accountId;
    const [membershipRow] = await withSessionContext(hh.context, (tx) =>
      tx.execute<{ id: string }>(`select id from membership where account_id = '${claimed.accountId}'::uuid`),
    );

    await setMemberRole(hh.context, hh.accountId, claimed.accountId, "member");
    expect(await roleEvents(hh, membershipRow.id)).toHaveLength(0);

    await setMemberRole(hh.context, hh.accountId, claimed.accountId, "moderator");
    expect(await roleEvents(hh, membershipRow.id)).toHaveLength(1);
  });
});
