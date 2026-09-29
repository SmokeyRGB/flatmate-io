import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  assertHasPermission,
  createResidentProfile,
  membershipHoldsPermission,
  PermissionDeniedError,
  reactivateMember,
  removeMember,
  setMemberRole,
  setMovedOut,
} from "@/modules/identity/repository";
import {
  HOUSEHOLD_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  membership,
} from "@/modules/identity/schema";
import {
  captureApplication,
  createAndOpenRound,
  createRoom,
  createRound,
  openRound,
  updateHouseholdSettingsWithProcedureLock,
} from "@/modules/casting/repository";
import {
  cleanupAll,
  createTestModerator,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";
import { uuid } from "../../helpers/uuid";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

interface Resident {
  accountId: string;
  profileId: string;
  displayName: string;
  context: SessionContext;
}

async function claim(household: TestHousehold, name: string): Promise<Resident> {
  const actor = { accountId: household.accountId, profileId: null };
  const profile = await createResidentProfile(household.context, name, actor);
  const { accountId } = await claimResidentProfile(household.context, profile.id, "test-password-not-real-1234");
  accountIds.push(accountId);
  return {
    accountId,
    profileId: profile.id,
    displayName: name,
    context: { accountId, householdId: household.householdId, profileId: profile.id },
  };
}

async function storedRow(household: TestHousehold, accountId: string) {
  const [row] = await withSessionContext(household.context, (tx) =>
    tx.select().from(membership).where(eq(membership.accountId, accountId)),
  );
  return row;
}

const actorOf = (r: { accountId: string; profileId: string }) => ({ accountId: r.accountId, profileId: r.profileId });
const sorted = (v: readonly string[]) => [...v].sort();

// design D3 (application-capture): roles are only NAMES for stored permission sets, and every
// permission check reads only the stored list, never a role. "The terms 'household' or 'moderator'
// should simply map to permissions; they shouldn't be a separate workaround for permissions /
// Backdoor for ignoring permissions."
describe("moderator and household permissions are stored, and only the stored list decides", () => {
  it("appointing a moderator stores all four permissions, and it may open a round, manage a room and capture", async () => {
    hh = await registerTestHousehold();
    const member = await claim(hh, "Appointee");
    expect((await storedRow(hh, member.accountId)).permissions).toEqual([]);

    await setMemberRole(hh.context, hh.accountId, member.accountId, "moderator");
    const stored = await storedRow(hh, member.accountId);
    expect(stored.role).toBe("moderator");
    expect(sorted(stored.permissions)).toEqual(sorted(MODERATOR_PERMISSIONS));

    const actor = actorOf(member);
    const room = await createRoom(member.context, "Room A", actor); // manage_rooms
    const round = await createAndOpenRound(member.context, "Round", [room.id], actor); // close_round
    const captured = await captureApplication(member.context, {
      roundId: round.id,
      applicantName: "Testbewerbung Moderator",
      collectedFrom: "data_subject",
    }); // create_application
    expect(captured.id).toBeTruthy();
  });

  it("demoting to member removes the four, refuses each action, and keeps the resident set", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    const actor = actorOf(moderator);
    const room = await createRoom(moderator.context, "Room A", actor);
    const openRoundRow = await createAndOpenRound(moderator.context, "Round", [room.id], actor);

    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "member");
    const stored = await storedRow(hh, moderator.accountId);
    expect(stored.role).toBe("member");
    for (const permission of MODERATOR_PERMISSIONS) expect(stored.permissions).not.toContain(permission);

    await expect(createRoom(moderator.context, "Room B", actor)).rejects.toThrow(PermissionDeniedError);
    await expect(createRound(moderator.context, "Round 2", [room.id], actor)).rejects.toThrow(PermissionDeniedError);
    await expect(openRound(moderator.context, uuid(), actor)).rejects.toThrow(PermissionDeniedError);
    await expect(
      captureApplication(moderator.context, {
        roundId: openRoundRow.id,
        applicantName: "Testbewerbung Demoted",
        collectedFrom: "data_subject",
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("a member holds nothing; a member granted create_application holds it with its role still member", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    const modActor = actorOf(moderator);
    const room = await createRoom(moderator.context, "Room A", modActor);
    const round = await createAndOpenRound(moderator.context, "Round", [room.id], modActor);
    const member = await claim(hh, "PlainMember");

    await expect(assertHasPermission(member.context, member.accountId, "create_application")).rejects.toThrow(
      PermissionDeniedError,
    );

    // The matrix's ⬜ column: an individual grant. No function writes one, so this is the row write
    // the real thing would produce (same pattern as organisation-tasks.test.ts).
    await withSessionContext(hh.context, (tx) =>
      tx.update(membership).set({ permissions: ["create_application"] }).where(eq(membership.accountId, member.accountId)),
    );
    await expect(assertHasPermission(member.context, member.accountId, "create_application")).resolves.toBeUndefined();
    expect((await storedRow(hh, member.accountId)).role).toBe("member");

    const captured = await captureApplication(member.context, {
      roundId: round.id,
      applicantName: "Testbewerbung Granted",
      collectedFrom: "data_subject",
    });
    expect(captured.id).toBeTruthy();
  });

  it("a moderator is not granted manage_settings: a settings change is refused (the matrix's ⬜ stays a grant)", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);
    await expect(
      updateHouseholdSettingsWithProcedureLock(moderator.context, { quorumShare: "0.6" }, actorOf(moderator)),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("the role alone grants nothing: membershipHoldsPermission reads only the stored list", () => {
    const moderatorWithNothing = { role: "moderator", permissions: [] as string[], revokedAt: null };
    const householdWithNothing = { role: "household_admin", permissions: [] as string[], revokedAt: null };
    expect(membershipHoldsPermission(moderatorWithNothing, "close_round")).toBe(false);
    expect(membershipHoldsPermission(householdWithNothing, "manage_settings")).toBe(false);
    // and a revoked row holds nothing whatever it stores
    expect(membershipHoldsPermission({ permissions: ["close_round"], revokedAt: new Date() }, "close_round")).toBe(false);
    expect(membershipHoldsPermission({ permissions: ["close_round"], revokedAt: null }, "close_round")).toBe(true);
  });

  it("moving a moderator out: revoked, role member, no permission; reactivating restores the resident set only", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh);

    await setMovedOut(hh.context, hh.accountId, moderator.accountId);
    const revoked = await storedRow(hh, moderator.accountId);
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.role).toBe("member");
    expect(revoked.permissions).toEqual([]);

    await reactivateMember(hh.context, hh.accountId, moderator.accountId);
    const back = await storedRow(hh, moderator.accountId);
    expect(back.revokedAt).toBeNull();
    expect(back.role).toBe("member");
    expect(back.permissions).toEqual([]); // the resident set (empty in this change), none of the moderator's
    await expect(assertHasPermission(moderator.context, moderator.accountId, "close_round")).rejects.toThrow(
      PermissionDeniedError,
    );

    // Appointed again, visibly, it holds the set again.
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");
    await expect(assertHasPermission(moderator.context, moderator.accountId, "close_round")).resolves.toBeUndefined();
  });

  it("the same after a hard removal (the removal tier)", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh, "RemovedModerator");

    await removeMember(hh.context, hh.accountId, moderator.accountId, "RemovedModerator");
    const removed = await storedRow(hh, moderator.accountId);
    expect(removed.revokedAt).not.toBeNull();
    expect(removed.role).toBe("member");
    expect(removed.permissions).toEqual([]);
  });

  it("a newly registered household stores exactly the household set, and the household account is refused create_application by the permission check itself", async () => {
    hh = await registerTestHousehold();
    const admin = await storedRow(hh, hh.accountId);
    expect(admin.role).toBe("household_admin");
    expect(sorted(admin.permissions)).toEqual(sorted(HOUSEHOLD_PERMISSIONS));

    // Not only the profile-first check in captureApplication: the check itself no longer lets the
    // administering account through (it used to pass every permission implicitly).
    await expect(assertHasPermission(hh.context, hh.accountId, "create_application")).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(assertHasPermission(hh.context, hh.accountId, "change_application_state")).rejects.toThrow(
      PermissionDeniedError,
    );
    // ... and it does not run rounds (03-PRD.md §4.0.1, S-50/U-20 — design D13).
    await expect(assertHasPermission(hh.context, hh.accountId, "close_round")).rejects.toThrow(PermissionDeniedError);
    // It does keep what the matrix gives it.
    await expect(assertHasPermission(hh.context, hh.accountId, "manage_rooms")).resolves.toBeUndefined();
    await expect(assertHasPermission(hh.context, hh.accountId, "manage_settings")).resolves.toBeUndefined();
  });

  // Deliberate breaks (tasks 2.6):
  //  - Put either role shortcut back into membershipHoldsPermission (`role === "household_admin"`
  //    or `role === "moderator"` returning true): the "role alone grants nothing" case fails on
  //    its first two expectations, and the household-account case fails on create_application.
  //  - Remove the union from setMemberRole's "moderator" branch: the first case fails, because
  //    drizzle/0024's CHECK (membership_moderator_holds_role_permissions) refuses the promotion
  //    write. Both are described here and reported as run or argued in the change's report.
});
