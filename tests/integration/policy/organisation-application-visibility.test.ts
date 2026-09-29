import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, PermissionDeniedError } from "@/modules/identity/repository";
import { membership } from "@/modules/identity/schema";
import {
  captureApplication,
  createAndOpenRound,
  createRoom,
  createRound,
  getOrganisationApplication,
} from "@/modules/casting/repository";
import {
  cleanupAll,
  createTestModerator,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";
import { uuid } from "../../helpers/uuid";

// Task 6.11 / D5: the ORGANISATION's read of one application. Visible only to a resident profile
// whose live membership holds create_application or change_application_state, and only for an
// application of its own household and named round. (The household-account case, with a spy proving
// no query runs, is in application-household-account-no-query.test.ts.)
const households: TestHousehold[] = [];
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  accountIds.length = 0;
  households.length = 0;
});

interface Setup {
  hh: TestHousehold;
  moderator: { context: SessionContext; accountId: string; profileId: string };
  roundId: string;
  applicationId: string;
}

async function setup(): Promise<Setup> {
  const hh = await registerTestHousehold();
  households.push(hh);
  const moderator = await createTestModerator(hh);
  const actor = { accountId: moderator.accountId, profileId: moderator.profileId };
  const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
  const round = await createAndOpenRound(moderator.context, "Round", [room.id], actor);
  const created = await captureApplication(moderator.context, {
    roundId: round.id,
    applicantName: "Testbewerbung Sichtbar",
    collectedFrom: "data_subject",
  });
  return { hh, moderator, roundId: round.id, applicationId: created.id };
}

async function claimMember(hh: TestHousehold, name: string) {
  const actor = { accountId: hh.accountId, profileId: null };
  const profile = await createResidentProfile(hh.context, name, actor);
  const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
  accountIds.push(accountId);
  return {
    accountId,
    context: { accountId, householdId: hh.householdId, profileId: profile.id } as SessionContext,
  };
}

describe("getOrganisationApplication (design D5)", () => {
  it("a moderator gets the row", async () => {
    const s = await setup();
    const row = await getOrganisationApplication(s.moderator.context, s.roundId, s.applicationId);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(s.applicationId);
    expect(row!.applicantName).toBe("Testbewerbung Sichtbar");
  });

  it("a member holding neither permission is refused with PermissionDeniedError", async () => {
    const s = await setup();
    const member = await claimMember(s.hh, "PlainMember");
    await expect(getOrganisationApplication(member.context, s.roundId, s.applicationId)).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it("a member granted only change_application_state gets the row", async () => {
    const s = await setup();
    const member = await claimMember(s.hh, "StateChanger");
    await withSessionContext(s.hh.context, (tx) =>
      tx
        .update(membership)
        .set({ permissions: ["change_application_state"] })
        .where(eq(membership.accountId, member.accountId)),
    );
    const row = await getOrganisationApplication(member.context, s.roundId, s.applicationId);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(s.applicationId);
  });

  it("another household's application id gives null", async () => {
    const s = await setup();
    const other = await setup();
    expect(await getOrganisationApplication(s.moderator.context, s.roundId, other.applicationId)).toBeNull();
    // ... and not even by naming the other household's round.
    expect(await getOrganisationApplication(s.moderator.context, other.roundId, other.applicationId)).toBeNull();
  });

  it("a mismatched round id gives null", async () => {
    const s = await setup();
    const modActor = { accountId: s.moderator.accountId, profileId: s.moderator.profileId };
    const room = await createRoom(s.hh.context, "Room B", { accountId: s.hh.accountId, profileId: null });
    const otherRound = await createRound(s.moderator.context, "Other round", [room.id], modActor);
    expect(await getOrganisationApplication(s.moderator.context, otherRound.id, s.applicationId)).toBeNull();
    expect(await getOrganisationApplication(s.moderator.context, uuid(), s.applicationId)).toBeNull();
  });

  it("a malformed id gives null, never a database error", async () => {
    const s = await setup();
    expect(await getOrganisationApplication(s.moderator.context, s.roundId, "not-a-uuid")).toBeNull();
    expect(await getOrganisationApplication(s.moderator.context, "not-a-uuid", s.applicationId)).toBeNull();
    expect(await getOrganisationApplication(s.moderator.context, s.roundId, "")).toBeNull();
  });

  // Deliberate break: remove the permission check (assertHoldsAnyPermissionTx) from
  // getOrganisationApplication, and the plain-member case returns the row instead of throwing.
  // Argued, not run: it needs an edit to the repository and the migrations on dev.
});
