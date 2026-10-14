import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAndOpenRound,
  createRoom,
  inviteApplication,
  transitionRoomStatus,
} from "@/modules/casting/repository";
import { withSessionContext } from "@/db/session-context";
import { room as roomTable } from "@/modules/casting/schema";
import { castVote } from "@/modules/deliberation/repository";
import { loadOrganisationTasks } from "@/app/(org)/organisation-tasks";
import { cleanupAll, createTestModerator, registerTestHousehold, type TestHousehold } from "../../helpers/identity";
import { insertApplicationAt } from "../../helpers/pipeline";

// The spy wraps the real getRanking, so a reached call still reads the database.
const rankingSpy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/modules/deliberation/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/deliberation/repository")>();
  return {
    ...actual,
    getRanking: (...args: Parameters<typeof actual.getRanking>) => {
      rankingSpy.calls += 1;
      return actual.getRanking(...args);
    },
  };
});

// organisation-task-list D1 / tasks.md 4.1: the loader composes the casting, identity and ranking
// reads. G-D15: it asks for no ranking on behalf of a session without a resident profile.

let hh: TestHousehold | undefined;

afterEach(async () => {
  await cleanupAll(hh?.cleanup());
  hh = undefined;
  rankingSpy.calls = 0;
});

// A household with a moderator (a resident) and one open round over one open room, so a scored
// application can take the single highlight slot.
async function seed() {
  hh = await registerTestHousehold();
  const hhActor = { accountId: hh.accountId, profileId: null };
  const moderator = await createTestModerator(hh);
  const room = await createRoom(hh.context, "Room A", hhActor);
  await transitionRoomStatus(hh.context, room.id, "open", hhActor);
  const round = await createAndOpenRound(moderator.context, "Round", [room.id], {
    accountId: moderator.accountId,
    profileId: moderator.profileId,
  });
  return { hh, moderator, roundId: round.id };
}

const inviteTasks = (tasks: { kind: string }[]) => tasks.filter((t) => t.kind === "invite_candidates");

describe("loadOrganisationTasks", () => {
  it("offers invite_candidates only after the moderator has voted, and not once the highlighted row is invited", async () => {
    const s = await seed();
    const app = await insertApplicationAt(s, "new");

    // Not voted yet: the row is hidden from this moderator's ranking (V-4).
    expect(inviteTasks(await loadOrganisationTasks(s.moderator.context))).toEqual([]);

    await castVote(s.moderator.context, { roundId: s.roundId, applicationId: app.id, value: "definitely" });
    expect(inviteTasks(await loadOrganisationTasks(s.moderator.context))).toEqual([
      { kind: "invite_candidates", roundId: s.roundId, roundTitle: "Round" },
    ]);

    await inviteApplication(s.moderator.context, { roundId: s.roundId, applicationId: app.id });
    expect(inviteTasks(await loadOrganisationTasks(s.moderator.context))).toEqual([]);
  });

  it("review fix R-3: a vote still awaiting gives no invite_candidates and no ranking read; voting brings it", async () => {
    const s = await seed();
    const app = await insertApplicationAt(s, "new");
    rankingSpy.calls = 0;

    expect(inviteTasks(await loadOrganisationTasks(s.moderator.context))).toEqual([]);
    expect(rankingSpy.calls).toBe(0);

    await castVote(s.moderator.context, { roundId: s.roundId, applicationId: app.id, value: "definitely" });
    expect(inviteTasks(await loadOrganisationTasks(s.moderator.context))).toEqual([
      { kind: "invite_candidates", roundId: s.roundId, roundTitle: "Round" },
    ]);
    expect(rankingSpy.calls).toBe(1);
  });

  it("offers nothing while scored rows exist but no room is free to highlight one", async () => {
    const s = await seed();
    const app = await insertApplicationAt(s, "new");
    await castVote(s.moderator.context, { roundId: s.roundId, applicationId: app.id, value: "definitely" });
    const [room] = await withSessionContext(s.hh.context, (tx) => tx.select().from(roomTable));
    await transitionRoomStatus(s.hh.context, room.id, "on_hold", { accountId: s.hh.accountId, profileId: null });
    expect(inviteTasks(await loadOrganisationTasks(s.moderator.context))).toEqual([]);
  });

  it("G-D15: the household account gets no invite_candidates and the loader reads no ranking for it", async () => {
    const s = await seed();
    const app = await insertApplicationAt(s, "new");
    await castVote(s.moderator.context, { roundId: s.roundId, applicationId: app.id, value: "definitely" });
    rankingSpy.calls = 0;

    const tasks = await loadOrganisationTasks(s.hh.context);
    expect(inviteTasks(tasks)).toEqual([]);
    expect(rankingSpy.calls).toBe(0);
    // The moderator's own read does reach it, so the spy is live.
    await loadOrganisationTasks(s.moderator.context);
    expect(rankingSpy.calls).toBe(1);
  });

  it("orders the setup tasks before round tasks for the household account", async () => {
    hh = await registerTestHousehold();
    const kinds = (await loadOrganisationTasks(hh.context)).map((t) => t.kind);
    expect(kinds).toEqual(["add_room", "invite_flatmates", "appoint_search_lead"]);
  });
});
