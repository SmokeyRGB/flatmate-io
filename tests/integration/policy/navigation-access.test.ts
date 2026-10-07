import { eq, sql } from "drizzle-orm";
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
  const { accountId } = await claimResidentProfile(household.context, profile.id, "test-password-not-real-1234", "de");
  accountIds.push(accountId);
  return {
    profileId: profile.id,
    accountId,
    displayName: name,
    context: { accountId, householdId: household.householdId, profileId: profile.id },
  };
}

describe("getNavigationAccess (start-screen design.md Decision 4; role-permissions design D6, D9)", () => {
  it("household_admin -> every flag true (it holds manage_rooms and manage_voting_procedure)", async () => {
    hh = await registerTestHousehold();
    const access = await getNavigationAccess(hh.context);
    expect(access).toEqual({ organisation: true, membersList: true, rooms: true, settings: true });
  });

  it("moderator -> organisation, members list and rooms, but not the voting-procedure settings (matrix ⬜)", async () => {
    hh = await registerTestHousehold();
    const moderator = await claim(hh, "Moderator");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");

    const access = await getNavigationAccess(moderator.context);
    expect(access).toEqual({ organisation: true, membersList: true, rooms: true, settings: false });
  });

  it("a moderator individually granted manage_voting_procedure -> settings true (the one grant the matrix leaves)", async () => {
    hh = await registerTestHousehold();
    const moderator = await claim(hh, "GrantedModerator");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");
    await withSessionContext(hh.context, (tx) =>
      tx
        .update(membership)
        .set({ permissions: sql`permissions || ARRAY['manage_voting_procedure']::text[]` })
        .where(eq(membership.accountId, moderator.accountId)),
    );

    const access = await getNavigationAccess(moderator.context);
    expect(access.settings).toBe(true);
  });

  // F3 change 2b (human decision, 2026-10-01): a plain resident holds the resident set (`vote`) and
  // nothing else. `vote` alone never opens the organisation area.
  it("a plain resident (the resident set only) -> every flag false", async () => {
    hh = await registerTestHousehold();
    const member = await claim(hh, "PlainMember");

    const access = await getNavigationAccess(member.context);
    expect(access).toEqual({ organisation: false, membersList: false, rooms: false, settings: false });
  });

  it("after removeMember revokes the membership -> every flag false", async () => {
    hh = await registerTestHousehold();
    const moderator = await claim(hh, "SoonRemoved");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");
    expect((await getNavigationAccess(moderator.context)).organisation).toBe(true);

    await removeMember(hh.context, hh.accountId, moderator.accountId, moderator.displayName);

    const access = await getNavigationAccess(moderator.context);
    expect(access).toEqual({ organisation: false, membersList: false, rooms: false, settings: false });
  });

  it("after a demotion the moderator loses the organisation flags at once, with no new sign-in", async () => {
    hh = await registerTestHousehold();
    const moderator = await claim(hh, "SoonDemoted");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");
    expect((await getNavigationAccess(moderator.context)).organisation).toBe(true);

    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "member");

    const access = await getNavigationAccess(moderator.context);
    expect(access).toEqual({ organisation: false, membersList: false, rooms: false, settings: false });
  });
});
