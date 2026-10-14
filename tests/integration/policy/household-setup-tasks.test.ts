import { afterEach, describe, expect, it } from "vitest";
import { joinHousehold } from "@/modules/identity/auth";
import {
  deleteJoinCode,
  issueJoinCode,
  listHouseholdSetupTasks,
  listJoinCodeIssuances,
  setMemberRole,
} from "@/modules/identity/repository";
import {
  cleanupAll,
  createNonResidentModerator,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";
import { uuid } from "../../helpers/uuid";

// organisation-task-list D1 / tasks.md 3.1: the identity half of the organisation task list. Each
// task is decided by a stored permission on the caller's live membership, never by a role (R5).

const PASSWORD = "test-password-not-real-1234";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

async function joinAsResident(household: TestHousehold) {
  const link = await issueJoinCode(household.context, household.accountId, { validDays: 7, maxUses: 1 });
  const result = await joinHousehold(link.code, { displayName: `Max ${uuid().slice(0, 8)}`, password: PASSWORD }, "de");
  accountIds.push(result.context.accountId);
  return result;
}

async function foundingLinkOf(household: TestHousehold) {
  const issuances = await listJoinCodeIssuances(household.context, household.accountId);
  return issuances.filter((i) => i.isFoundingLink)[0];
}

describe("listHouseholdSetupTasks", () => {
  it("a fresh household account gets both tasks, with the founding path", async () => {
    hh = await registerTestHousehold();
    const founding = await foundingLinkOf(hh);
    expect(await listHouseholdSetupTasks(hh.context)).toEqual([
      { kind: "invite_flatmates", invitationsOutstanding: false },
      { kind: "appoint_search_lead", foundingJoinPath: `/join/${founding.code}`, canAppointMember: false },
    ]);
  });

  // fix round F3: an issued flatmate invitation turns "invite" into "share the links".
  it("an issued invitation with nobody joined gives invitationsOutstanding: true", async () => {
    hh = await registerTestHousehold();
    await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    const tasks = await listHouseholdSetupTasks(hh.context);
    expect(tasks.find((t) => t.kind === "invite_flatmates")).toEqual({
      kind: "invite_flatmates",
      invitationsOutstanding: true,
    });
  });

  it("the founding link alone is not a flatmate invitation", async () => {
    hh = await registerTestHousehold();
    const tasks = await listHouseholdSetupTasks(hh.context);
    expect(tasks[0]).toEqual({ kind: "invite_flatmates", invitationsOutstanding: false });
  });

  // fix round F4: no way to fill the role means no task.
  it("a deleted founding link with nobody joined gives no appoint_search_lead", async () => {
    hh = await registerTestHousehold();
    const founding = await foundingLinkOf(hh);
    await deleteJoinCode(hh.context, hh.accountId, founding.id);
    expect(await listHouseholdSetupTasks(hh.context)).toEqual([
      { kind: "invite_flatmates", invitationsOutstanding: false },
    ]);
  });

  it("one joined plain member gives canAppointMember: true", async () => {
    hh = await registerTestHousehold();
    await joinAsResident(hh);
    const tasks = await listHouseholdSetupTasks(hh.context);
    expect(tasks).toEqual([
      expect.objectContaining({ kind: "appoint_search_lead", canAppointMember: true }),
    ]);
  });

  it("after one resident claims, invite_flatmates is gone and appoint_search_lead stays", async () => {
    hh = await registerTestHousehold();
    await joinAsResident(hh);
    const kinds = (await listHouseholdSetupTasks(hh.context)).map((t) => t.kind);
    expect(kinds).toEqual(["appoint_search_lead"]);
  });

  it("after appointing a moderator, appoint_search_lead is gone for everyone", async () => {
    hh = await registerTestHousehold();
    const resident = await joinAsResident(hh);
    await setMemberRole(hh.context, hh.accountId, resident.context.accountId, "moderator");
    expect(await listHouseholdSetupTasks(hh.context)).toEqual([]);
    // The appointed moderator holds appoint_moderator too and sees nothing either.
    expect(await listHouseholdSetupTasks(resident.context)).toEqual([]);
  });

  it("a non-resident moderator counts as a search lead (decided by permission, not role)", async () => {
    hh = await registerTestHousehold();
    await createNonResidentModerator(hh);
    const kinds = (await listHouseholdSetupTasks(hh.context)).map((t) => t.kind);
    // No live RESIDENT membership yet, so invite_flatmates stays; the search lead exists.
    expect(kinds).toEqual(["invite_flatmates"]);
  });

  it("a plain resident gets nothing", async () => {
    hh = await registerTestHousehold();
    const resident = await joinAsResident(hh);
    expect(await listHouseholdSetupTasks(resident.context)).toEqual([]);
  });

  it("a spent founding link gives no path", async () => {
    hh = await registerTestHousehold();
    const founding = await foundingLinkOf(hh);
    const founder = await joinHousehold(founding.code, { displayName: `Frieda ${uuid().slice(0, 8)}`, password: PASSWORD }, "de");
    accountIds.push(founder.context.accountId);
    // Redeeming made a moderator. Demote it so the task is open again, with the link spent.
    await setMemberRole(hh.context, hh.accountId, founder.context.accountId, "member");
    expect(await listHouseholdSetupTasks(hh.context)).toEqual([
      { kind: "appoint_search_lead", foundingJoinPath: null, canAppointMember: true },
    ]);
  });
});
