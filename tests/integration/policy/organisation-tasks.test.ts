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
    expect(tasks).toEqual([]);
  });

  it("(c) a planned room never appears", async () => {
    hh = await registerTestHousehold();
    await createRoom(hh.context, "Room D", adminActor()); // stays 'planned'
    const moderator = await createTestModerator(hh);

    // Read as a moderator (design D13): the household account's [] would make this vacuous.
    // With no round at all the one task is the first round, whatever the rooms are.
    expect(await listOrganisationTasks(moderator.context)).toEqual([{ kind: "open_first_round" }]);

    // Once a round exists the planned room still yields nothing.
    await seedRoundElsewhere(hh, moderator);
    expect(await listOrganisationTasks(moderator.context)).toEqual([]);
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

    const tasks = await listOrganisationTasks(moderator.context);
    // No round yet: the first round is the one task, and it replaces the room task.
    expect(tasks).toEqual([{ kind: "open_first_round" }]);
  });

  it("(f2) a fresh household: a moderator gets exactly the first-round task", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);

    expect(await listOrganisationTasks(moderator.context)).toEqual([{ kind: "open_first_round" }]);
  });

  it("(f3) no round and an open uncovered room: only the first-round task, no room task", async () => {
    hh = await registerTestHousehold();
    const room = await createRoom(hh.context, "Room I", adminActor());
    await openRoom(hh, room.id);
    const moderator = await createTestModerator(hh);

    const tasks = await listOrganisationTasks(moderator.context);
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

    expect(await listOrganisationTasks(moderator.context)).toEqual([]);
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

    expect(await listOrganisationTasks(moderator.context)).toEqual([{ kind: "open_first_round" }]);
  });

  it("(f4) a household whose only round is closed: no first-round task, room tasks as before", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    // A closed round covers nothing, so the room it names is a task again.
    const room = await seedRoundElsewhere(hh, moderator, "closed");

    const tasks = await listOrganisationTasks(moderator.context);
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

    expect(await listOrganisationTasks(hh.context)).toEqual([]);
  });
});
