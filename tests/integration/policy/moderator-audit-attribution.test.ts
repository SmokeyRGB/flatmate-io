import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  createResidentProfile,
  deleteJoinCode,
  issueJoinCode,
  reactivateMember,
  removeMember,
  removePreparedProfile,
  setMemberRole,
  setMovedOut,
} from "@/modules/identity/repository";
import { membership } from "@/modules/identity/schema";
import {
  cleanupAll,
  createTestModerator,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

// PR #50 review: since role-permissions a moderator can call these mutators, and the audit event
// must name the acting session's profile (docs/domain/audit-und-notifications.md: a null
// actor_profile_id means "the household account acted"). Each used to write a hard-coded null.
// Break: put `actorProfileId: null` (or an Actor with `profileId: null`) back in any of them and
// the matching assertion below fails.

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

async function eventsFor(household: TestHousehold, eventType: string, subjectId: string) {
  return withSessionContext(household.context, (tx) =>
    tx
      .select({ actorAccountId: activityEvent.actorAccountId, actorProfileId: activityEvent.actorProfileId })
      .from(activityEvent)
      .where(
        and(
          eq(activityEvent.householdId, household.householdId),
          eq(activityEvent.eventType, eventType),
          eq(activityEvent.subjectId, subjectId),
        ),
      ),
  );
}

// The events a given account wrote, order-independent (the table has no insertion-order column).
const byAccount = (events: { actorAccountId: string | null }[], accountId: string) =>
  events.filter((e) => e.actorAccountId === accountId);

async function membershipIdOf(household: TestHousehold, accountId: string): Promise<string> {
  const [row] = await withSessionContext(household.context, (tx) =>
    tx.select({ id: membership.id }).from(membership).where(eq(membership.accountId, accountId)),
  );
  return row.id;
}

async function claimedMember(household: TestHousehold, displayName: string) {
  const profile = await createResidentProfile(household.context, displayName, {
    accountId: household.accountId,
    profileId: null,
  });
  const claimed = await claimResidentProfile(household.context, profile.id, "test-password-not-real-1234");
  accountIds.push(claimed.accountId);
  return { profileId: profile.id, accountId: claimed.accountId };
}

describe("a moderator's audit events name the moderator's profile", () => {
  it("role change, including the moderator demoting itself", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh, "Moderator1");
    const member = await claimedMember(hh, "Appointee");
    const memberMembership = await membershipIdOf(hh, member.accountId);
    const moderatorMembership = await membershipIdOf(hh, moderator.accountId);
    const actedAsModerator = { actorAccountId: moderator.accountId, actorProfileId: moderator.profileId };

    await setMemberRole(moderator.context, moderator.accountId, member.accountId, "moderator");
    expect(await eventsFor(hh, "membership.role_changed", memberMembership)).toEqual([actedAsModerator]);

    await setMemberRole(moderator.context, moderator.accountId, moderator.accountId, "member");
    const selfEvents = await eventsFor(hh, "membership.role_changed", moderatorMembership);
    expect(byAccount(selfEvents, moderator.accountId)).toEqual([actedAsModerator]);
    // createTestModerator's own appointment was made by the household account: null profile
    expect(byAccount(selfEvents, hh.accountId)).toEqual([{ actorAccountId: hh.accountId, actorProfileId: null }]);
  });

  it("the household account's own role change keeps a null profile", async () => {
    hh = await registerTestHousehold();
    const member = await claimedMember(hh, "Appointee");
    await setMemberRole(hh.context, hh.accountId, member.accountId, "moderator");
    expect(await eventsFor(hh, "membership.role_changed", await membershipIdOf(hh, member.accountId))).toEqual([
      { actorAccountId: hh.accountId, actorProfileId: null },
    ]);
  });

  it("move-out, reactivation and removal (status change, revocation, reactivation events)", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh, "Moderator1");
    const a = await claimedMember(hh, "Anna");
    const b = await claimedMember(hh, "Berta");
    const aMembership = await membershipIdOf(hh, a.accountId);
    const bMembership = await membershipIdOf(hh, b.accountId);
    const acted = { actorAccountId: moderator.accountId, actorProfileId: moderator.profileId };

    await setMovedOut(moderator.context, moderator.accountId, a.accountId);
    expect(await eventsFor(hh, "membership.revoked", aMembership)).toEqual([acted]);
    expect(byAccount(await eventsFor(hh, "resident_profile.status_changed", a.profileId), moderator.accountId)).toEqual([acted]);

    await reactivateMember(moderator.context, moderator.accountId, a.accountId);
    expect(await eventsFor(hh, "membership.reactivated", aMembership)).toEqual([acted]);
    // move-out and reactivation: two status changes, both the moderator's
    expect(byAccount(await eventsFor(hh, "resident_profile.status_changed", a.profileId), moderator.accountId)).toEqual([acted, acted]);

    await removeMember(moderator.context, moderator.accountId, b.accountId, "Berta");
    expect(byAccount(await eventsFor(hh, "resident_profile.status_changed", b.profileId), moderator.accountId)).toEqual([acted]);
    expect(await eventsFor(hh, "membership.removed_as_intruder", bMembership)).toEqual([acted]);
  });

  it("join links: issue, delete, and deleting a prepared profile's bound links", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh, "Moderator1");
    const acted = { actorAccountId: moderator.accountId, actorProfileId: moderator.profileId };

    const link = await issueJoinCode(moderator.context, moderator.accountId, { validDays: 7, maxUses: 1 });
    expect(await eventsFor(hh, "household.join_code_issued", link.id)).toEqual([acted]);
    await deleteJoinCode(moderator.context, moderator.accountId, link.id);
    expect(await eventsFor(hh, "household.join_code_deleted", link.id)).toEqual([acted]);

    const prepared = await createResidentProfile(moderator.context, "Vera", {
      accountId: moderator.accountId,
      profileId: moderator.profileId,
    });
    expect(await eventsFor(hh, "resident_profile.created", prepared.id)).toEqual([acted]);
    const bound = await issueJoinCode(moderator.context, moderator.accountId, {
      validDays: 7,
      maxUses: 1,
      residentProfileId: prepared.id,
    });
    await removePreparedProfile(moderator.context, moderator.accountId, prepared.id);
    expect(await eventsFor(hh, "household.join_code_deleted", bound.id)).toEqual([acted]);
    expect(byAccount(await eventsFor(hh, "resident_profile.status_changed", prepared.id), moderator.accountId)).toEqual([acted]);
  });

  it("the household account issuing a link keeps a null profile", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    expect(await eventsFor(hh, "household.join_code_issued", link.id)).toEqual([
      { actorAccountId: hh.accountId, actorProfileId: null },
    ]);
  });
});
