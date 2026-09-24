import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  createResidentProfile,
  getNavigationAccess,
  membership,
  removeMember,
  setMemberRole,
} from "@/modules/identity/repository";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";
import type { SessionContext } from "@/db/session-context";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

async function claim(household: TestHousehold, name: string): Promise<{
  profileId: string;
  accountId: string;
  displayName: string;
  context: SessionContext;
}> {
  const actor = { accountId: household.accountId, profileId: null };
  const profile = await createResidentProfile(household.context, name, actor);
  const { accountId } = await claimResidentProfile(household.context, profile.id, "test-password-not-real-1234");
  accountIds.push(accountId);
  return {
    profileId: profile.id,
    accountId,
    displayName: name,
    context: { accountId, householdId: household.householdId, profileId: profile.id },
  };
}

describe("getNavigationAccess (start-screen design.md Decision 4)", () => {
  it("household_admin -> both true", async () => {
    hh = await registerTestHousehold();
    const access = await getNavigationAccess(hh.context);
    expect(access).toEqual({ organisation: true, membersList: true });
  });

  it("moderator -> both true", async () => {
    hh = await registerTestHousehold();
    const moderator = await claim(hh, "Moderator");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");

    const access = await getNavigationAccess(moderator.context);
    expect(access).toEqual({ organisation: true, membersList: true });
  });

  it("a member with any permission -> organisation true, membersList false", async () => {
    hh = await registerTestHousehold();
    const member = await claim(hh, "SomePermission");
    await withSessionContext(hh.context, (tx) =>
      tx.update(membership).set({ permissions: ["manage_settings"] }).where(eq(membership.accountId, member.accountId)),
    );

    const access = await getNavigationAccess(member.context);
    expect(access).toEqual({ organisation: true, membersList: false });
  });

  it("a plain member -> both false", async () => {
    hh = await registerTestHousehold();
    const member = await claim(hh, "PlainMember");

    const access = await getNavigationAccess(member.context);
    expect(access).toEqual({ organisation: false, membersList: false });
  });

  it("after removeMember revokes the membership -> both false", async () => {
    hh = await registerTestHousehold();
    const moderator = await claim(hh, "SoonRemoved");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");
    expect(await getNavigationAccess(moderator.context)).toEqual({ organisation: true, membersList: true });

    await removeMember(hh.context, hh.accountId, moderator.accountId, moderator.displayName);

    const access = await getNavigationAccess(moderator.context);
    expect(access).toEqual({ organisation: false, membersList: false });
  });
});
