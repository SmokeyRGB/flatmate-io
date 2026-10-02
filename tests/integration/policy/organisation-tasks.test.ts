import { afterEach, describe, expect, it } from "vitest";
import { createResidentProfile, getNavigationAccess, setMemberRole } from "@/modules/identity/repository";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  createRoom,
  createRound,
  listOrganisationTasks,
  openRound,
  transitionRoomStatus,
} from "@/modules/casting/repository";
import {
  cleanupAll,
  createTestModerator,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";
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
    // Design D13: the household account holds no manage_rounds, so it gets no tasks. The
    // read moves to a moderator's context; the household's own [] is asserted in its own case (g).
    const moderator = await createTestModerator(hh);

    const tasks = await listOrganisationTasks(moderator.context);
    expect(tasks).toEqual([{ kind: "open_round_for_room", roomId: room.id, label: "Room A" }]);
  });

  it("(b) covered by an open OR a draft round: not counted", async () => {
    hh = await registerTestHousehold();
    // Design D13: the moderator is the eligible resident and creates and opens the rounds; the
    // tasks are read in its context (the household account gets none, case (g)).
    const founder = await createTestModerator(hh, "Founder");
    const founderActor = { accountId: founder.accountId, profileId: founder.profileId };
    const roomOpenCovered = await createRoom(hh.context, "Room B", adminActor());
    await openRoom(hh, roomOpenCovered.id);
    const roomDraftCovered = await createRoom(hh.context, "Room C", adminActor());
    await openRoom(hh, roomDraftCovered.id);

    const round = await createRound(founder.context, "Round", [roomOpenCovered.id], founderActor);
    await openRound(founder.context, round.id, founderActor);
    await createRound(founder.context, "Draft round", [roomDraftCovered.id], founderActor);

    const tasks = await listOrganisationTasks(founder.context);
    expect(tasks.map((t) => t.roomId)).not.toContain(roomOpenCovered.id);
    expect(tasks.map((t) => t.roomId)).not.toContain(roomDraftCovered.id);
  });

  it("(c) a planned room never appears", async () => {
    hh = await registerTestHousehold();
    await createRoom(hh.context, "Room D", adminActor()); // stays 'planned'
    const moderator = await createTestModerator(hh);

    // Read as a moderator (design D13): the household account's [] would make this vacuous.
    const tasks = await listOrganisationTasks(moderator.context);
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

  // F3 change 2b (human decision, 2026-10-01): a plain member holds the resident set (`vote`) and
  // nothing else, so the old case "a member individually granted manage_settings" is gone: it
  // gets no task and no organisation access.
  it("(e) a plain member (the resident set only): no task, and organisation access is false", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room F", adminActor());
    await openRoom(hh, room.id);
    const member = await claim(hh, "SomePermissions");

    const tasks = await listOrganisationTasks(member.context);
    expect(tasks.map((t) => t.roomId)).not.toContain(room.id);

    const access = await getNavigationAccess(member.context);
    expect(access.organisation).toBe(false);
  });

  it("(f) a moderator (default manage_rounds) sees the task", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room G", adminActor());
    await openRoom(hh, room.id);
    const moderator = await claim(hh, "Moderator");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");

    const tasks = await listOrganisationTasks(moderator.context);
    expect(tasks.map((t) => t.roomId)).toContain(room.id);
  });
});

// Design D13 (application-capture): 03-PRD.md §4.0.1 gives the household account no rounds
// (S-50/U-20), and manage_rounds is not in HOUSEHOLD_PERMISSIONS, so it gets no tasks.
describe("listOrganisationTasks for the household account (design D13)", () => {
  it("(g) the household account gets [] even with an open room covered by no round", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room H", adminActor());
    await openRoom(hh, room.id);

    expect(await listOrganisationTasks(hh.context)).toEqual([]);
  });
});
