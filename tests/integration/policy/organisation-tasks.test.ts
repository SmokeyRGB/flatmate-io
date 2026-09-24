import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { createResidentProfile, getNavigationAccess, membership, setMemberRole } from "@/modules/identity/repository";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  createRoom,
  createRound,
  listOrganisationTasks,
  openRound,
  transitionRoomStatus,
} from "@/modules/casting/repository";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";
import type { SessionContext } from "@/db/session-context";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

const adminActor = () => ({ accountId: hh!.accountId, profileId: null });

async function claim(household: TestHousehold, name: string): Promise<{
  profileId: string;
  accountId: string;
  context: SessionContext;
}> {
  const actor = { accountId: household.accountId, profileId: null };
  const profile = await createResidentProfile(household.context, name, actor);
  const { accountId } = await claimResidentProfile(household.context, profile.id, "test-password-not-real-1234");
  accountIds.push(accountId);
  return {
    profileId: profile.id,
    accountId,
    context: { accountId, householdId: household.householdId, profileId: profile.id },
  };
}

async function openRoom(household: TestHousehold, roomId: string) {
  await transitionRoomStatus(household.context, roomId, "open", adminActor());
}

describe("listOrganisationTasks (start-screen design.md Decision 4)", () => {
  it("(a) an open room covered by no round appears once, with its label", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room A", adminActor());
    await openRoom(hh, room.id);

    const tasks = await listOrganisationTasks(hh.context);
    expect(tasks).toEqual([{ kind: "open_round_for_room", roomId: room.id, label: "Room A" }]);
  });

  it("(b) covered by an open OR a draft round: not counted", async () => {
    hh = await registerTestHousehold();
    const founder = await claim(hh, "Founder"); // eligible resident for openRound below
    const roomOpenCovered = await createRoom(hh.context, "Room B", adminActor());
    await openRoom(hh, roomOpenCovered.id);
    const roomDraftCovered = await createRoom(hh.context, "Room C", adminActor());
    await openRoom(hh, roomDraftCovered.id);

    const round = await createRound(hh.context, "Round", [roomOpenCovered.id], adminActor());
    await openRound(hh.context, round.id, adminActor());
    await createRound(hh.context, "Draft round", [roomDraftCovered.id], adminActor());

    const tasks = await listOrganisationTasks(hh.context);
    expect(tasks.map((t) => t.roomId)).not.toContain(roomOpenCovered.id);
    expect(tasks.map((t) => t.roomId)).not.toContain(roomDraftCovered.id);
    void founder;
  });

  it("(c) a planned room never appears", async () => {
    hh = await registerTestHousehold();
    await createRoom(hh.context, "Room D", adminActor()); // stays 'planned'

    const tasks = await listOrganisationTasks(hh.context);
    expect(tasks).toEqual([]);
  });

  it("(d) a plain member resident gets []", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room E", adminActor());
    await openRoom(hh, room.id);
    const member = await claim(hh, "PlainMember");

    const tasks = await listOrganisationTasks(member.context);
    expect(tasks).toEqual([]);
  });

  it("(e) a member holding a permission other than close_round: not counted, but organisation access is true", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room F", adminActor());
    await openRoom(hh, room.id);
    const member = await claim(hh, "SomePermissions");
    // No public action grants a single permission to a plain member — this is the direct row
    // write the real thing would produce, same pattern as start-overview.test.ts's setCanVote.
    await withSessionContext(hh.context, (tx) =>
      tx.update(membership).set({ permissions: ["manage_settings"] }).where(eq(membership.accountId, member.accountId)),
    );

    const tasks = await listOrganisationTasks(member.context);
    expect(tasks.map((t) => t.roomId)).not.toContain(room.id);

    const access = await getNavigationAccess(member.context);
    expect(access.organisation).toBe(true);
  });

  it("(f) a moderator (default close_round) sees the task", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room G", adminActor());
    await openRoom(hh, room.id);
    const moderator = await claim(hh, "Moderator");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");

    const tasks = await listOrganisationTasks(moderator.context);
    expect(tasks.map((t) => t.roomId)).toContain(room.id);
  });
});
