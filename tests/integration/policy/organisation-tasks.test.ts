import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
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
  createNonResidentModerator,
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
  const { accountId } = await claimResidentProfile(household.context, profile.id, "test-password-not-real-1234", "de");
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

// A household with at least one round, so listOrganisationTasks reports room tasks instead of
// `open_first_round`. The round covers an extra open room of its own (a draft round keeps that room
// from being a task), and leaves every other room uncovered.
async function seedRoundElsewhere(
  household: TestHousehold,
  founder: { accountId: string; profileId: string; context: SessionContext },
  status: "draft" | "closed" = "draft",
) {
  const extra = await createRoom(household.context, "Room covered elsewhere", adminActor());
  await openRoom(household, extra.id);
  const round = await createRound(founder.context, "Elsewhere", [extra.id], {
    accountId: founder.accountId,
    profileId: founder.profileId,
  });
  if (status === "closed") {
    // No close function exists yet, so raw SQL like application-capture.test.ts.
    await withSessionContext(household.context, (tx) =>
      tx.execute(sql`UPDATE casting_round SET status = 'closed' WHERE id = ${round.id}::uuid`),
    );
  }
  return extra;
}

describe("listOrganisationTasks (start-screen design.md Decision 4)", () => {
  it("(a) an open room covered by no round appears once, with its label", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room A", adminActor());
    await openRoom(hh, room.id);
    // Design D13: the household account holds no manage_rounds, so it gets no tasks. The
    // read moves to a moderator's context; the household's own [] is asserted in its own case (g).
    const moderator = await createTestModerator(hh);
    await seedRoundElsewhere(hh, moderator);

    const tasks = (await listOrganisationTasks(moderator.context)).tasks;
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

    const tasks = (await listOrganisationTasks(founder.context)).tasks;
    expect(tasks).toEqual([]);
  });

  it("(c) a planned room never appears", async () => {
    hh = await registerTestHousehold();
    await createRoom(hh.context, "Room D", adminActor()); // stays 'planned'
    const moderator = await createTestModerator(hh);

    // Read as a moderator (design D13): the household account's [] would make this vacuous.
    // With no round at all the one task is the first round, whatever the rooms are.
    expect((await listOrganisationTasks(moderator.context)).tasks).toEqual([{ kind: "open_first_round" }]);

    // Once a round exists the planned room still yields nothing.
    await seedRoundElsewhere(hh, moderator);
    expect((await listOrganisationTasks(moderator.context)).tasks).toEqual([]);
  });

  it("(d) a plain member resident gets []", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room E", adminActor());
    await openRoom(hh, room.id);
    const member = await claim(hh, "PlainMember");

    const tasks = (await listOrganisationTasks(member.context)).tasks;
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

    const tasks = (await listOrganisationTasks(member.context)).tasks;
    expect(tasks).toEqual([]);

    const access = await getNavigationAccess(member.context);
    expect(access.organisation).toBe(false);
  });

  it("(f) a moderator (default manage_rounds) sees the task", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room G", adminActor());
    await openRoom(hh, room.id);
    const moderator = await claim(hh, "Moderator");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");

    const tasks = (await listOrganisationTasks(moderator.context)).tasks;
    // No round yet: the first round is the one task, and it replaces the room task.
    expect(tasks).toEqual([{ kind: "open_first_round" }]);
  });

  // organisation/task-list delta: with no undeleted room the first-round task is dead (the new-round
  // form refuses with no_rooms_selected), so "add a room" replaces it. Was: open_first_round.
  it("(f2) a fresh household: a moderator gets add_room, and no first-round task", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);

    expect((await listOrganisationTasks(moderator.context)).tasks).toEqual([{ kind: "add_room" }]);
  });

  it("(f3) no round and an open uncovered room: only the first-round task, no room task", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room I", adminActor());
    await openRoom(hh, room.id);
    const moderator = await createTestModerator(hh);

    const tasks = (await listOrganisationTasks(moderator.context)).tasks;
    expect(tasks).toEqual([{ kind: "open_first_round" }]);
  });

  it("(f5) no round and every room occupied or not_available: no first-round task", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    const occupied = await createRoom(hh.context, "Room occupied", adminActor());
    await openRoom(hh, occupied.id);
    const unavailable = await createRoom(hh.context, "Room unavailable", adminActor());
    await openRoom(hh, unavailable.id);
    await transitionRoomStatus(hh.context, unavailable.id, "not_available", adminActor());
    // No F1 transition reaches `occupied`, so raw SQL like seedRoundElsewhere's closed round.
    await withSessionContext(hh.context, (tx) =>
      tx.execute(sql`UPDATE room SET status = 'occupied' WHERE id = ${occupied.id}::uuid`),
    );

    expect((await listOrganisationTasks(moderator.context)).tasks).toEqual([]);
  });

  it("(f6) no round, one occupied room and one planned room: the first-round task", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    const occupied = await createRoom(hh.context, "Room occupied", adminActor());
    await openRoom(hh, occupied.id);
    await withSessionContext(hh.context, (tx) =>
      tx.execute(sql`UPDATE room SET status = 'occupied' WHERE id = ${occupied.id}::uuid`),
    );
    await createRoom(hh.context, "Room planned", adminActor()); // stays 'planned'

    expect((await listOrganisationTasks(moderator.context)).tasks).toEqual([{ kind: "open_first_round" }]);
  });

  it("(f4) a household whose only round is closed: no first-round task, room tasks as before", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    // A closed round covers nothing, so the room it names is a task again.
    const room = await seedRoundElsewhere(hh, moderator, "closed");

    const tasks = (await listOrganisationTasks(moderator.context)).tasks;
    expect(tasks).toEqual([{ kind: "open_round_for_room", roomId: room.id, label: "Room covered elsewhere" }]);
  });
});

// Design D13 (application-capture): 03-PRD.md §4.0.1 gives the household account no rounds
// (S-50/U-20), and manage_rounds is not in HOUSEHOLD_PERMISSIONS, so it gets no tasks.
describe("listOrganisationTasks for the household account (design D13)", () => {
  it("(g) the household account gets [] even with an open room covered by no round", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room H", adminActor());
    await openRoom(hh, room.id);

    expect((await listOrganisationTasks(hh.context)).tasks).toEqual([]);
  });
});

// organisation-task-list tasks.md 2.1: per-kind gates from one membership read.
describe("listOrganisationTasks: per-kind gates (organisation-task-list D1)", () => {
  it("zero rooms gives add_room and no open_first_round", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    const list = await listOrganisationTasks(moderator.context);
    expect(list.tasks).toEqual([{ kind: "add_room" }]);
  });

  it("a room that can be cast for gives open_first_round and no add_room", async () => {
    hh = await registerTestHousehold();
    await createRoom(hh.context, "Room K", adminActor());
    const moderator = await createTestModerator(hh);
    expect((await listOrganisationTasks(moderator.context)).tasks).toEqual([{ kind: "open_first_round" }]);
  });

  it("a deleted room does not count as a room", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room gone", adminActor());
    await withSessionContext(hh.context, (tx) =>
      tx.execute(sql`UPDATE room SET deleted_at = now() WHERE id = ${room.id}::uuid`),
    );
    const moderator = await createTestModerator(hh);
    expect((await listOrganisationTasks(moderator.context)).tasks).toEqual([{ kind: "add_room" }]);
  });

  it("the household account gets add_room, no round kind and no ranking ids", async () => {
    hh = await registerTestHousehold();
    const list = await listOrganisationTasks(hh.context);
    expect(list).toEqual({ tasks: [{ kind: "add_room" }], rankingRoundIds: [] });
  });

  it("a household account in a household with an open room and a round gets no round kind", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room L", adminActor());
    await openRoom(hh, room.id);
    const moderator = await createTestModerator(hh);
    await seedRoundElsewhere(hh, moderator);
    expect(await listOrganisationTasks(hh.context)).toEqual({ tasks: [], rankingRoundIds: [] });
  });

  it("a plain resident gets nothing, even in a household with no room", async () => {
    hh = await registerTestHousehold();
    const member = await claim(hh, "PlainMember2");
    expect(await listOrganisationTasks(member.context)).toEqual({ tasks: [], rankingRoundIds: [] });
  });

  it("a non-resident moderator gets round tasks but no ranking ids", async () => {
    hh = await registerTestHousehold();
    await createRoom(hh.context, "Room M", adminActor());
    const nonResident = await createNonResidentModerator(hh);
    const list = await listOrganisationTasks(nonResident.context);
    expect(list.tasks).toEqual([{ kind: "open_first_round" }]);
    expect(list.rankingRoundIds).toEqual([]);
  });

  it("an open round the moderator votes in is a ranking id; a draft round is not", async () => {
    hh = await registerTestHousehold();
    const founder = await createTestModerator(hh, "Founder2");
    const actor = { accountId: founder.accountId, profileId: founder.profileId };
    const r1 = await createRoom(hh.context, "Room N", adminActor());
    await openRoom(hh, r1.id);
    const r2 = await createRoom(hh.context, "Room O", adminActor());
    await openRoom(hh, r2.id);
    const open = await createRound(founder.context, "Open", [r1.id], actor);
    await openRound(founder.context, open.id, actor);
    await createRound(founder.context, "Draft", [r2.id], actor);
    expect((await listOrganisationTasks(founder.context)).rankingRoundIds).toEqual([open.id]);
  });
});
