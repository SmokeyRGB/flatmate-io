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
  getApplication,
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

// Copilot, PR #39: the permission check and the read share one transaction, and the membership row
// stays share-locked through the read. A revocation that is still in flight therefore makes the
// read WAIT, and once it commits the read is refused. Without the lock the read returns the row
// immediately: a page view then returns personal data at no authorized instant.
describe("getOrganisationApplication holds the membership lock through the read (Copilot, PR #39)", () => {
  it("waits behind an uncommitted revocation and then refuses with PermissionDeniedError", async () => {
    const s = await setup();

    let releaseRevocation: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseRevocation = resolve;
    });
    let markRevoked: () => void = () => {};
    const revoked = new Promise<void>((resolve) => {
      markRevoked = resolve;
    });

    // Stand-in for a concurrent removal: revokes the reader's membership (a revoked row keeps no
    // permission and is never a moderator, membership_revoked_holds_nothing) and holds the
    // transaction open until this test releases it.
    const revocation = withSessionContext(s.hh.context, async (tx) => {
      await tx
        .update(membership)
        .set({ revokedAt: new Date(), role: "member", permissions: [] })
        .where(eq(membership.accountId, s.moderator.accountId));
      markRevoked();
      await gate;
    });
    await revoked;

    const outcome = getOrganisationApplication(s.moderator.context, s.roundId, s.applicationId).then(
      (row) => ({ ok: true as const, row }),
      (err) => ({ ok: false as const, err }),
    );
    const early = await Promise.race([
      outcome,
      new Promise<"waiting">((resolve) => setTimeout(() => resolve("waiting"), 1500)),
    ]);
    // With lock: false the read returns the still-committed row at once, and this fails.
    expect(early, "the read should still be waiting on the revocation's row lock").toBe("waiting");

    releaseRevocation();
    await revocation;

    const settled = await outcome;
    expect(settled.ok).toBe(false);
    if (!settled.ok) expect(settled.err).toBeInstanceOf(PermissionDeniedError);
  });

  // Deliberate break: pass { lock: false } to assertHoldsAnyPermissionTx in
  // getOrganisationApplication. The read then returns the row while the revocation is still
  // uncommitted, so `early` is the result object, not "waiting", and the first expect fails.
});

// Copilot, PR #39: getApplication is the profile-only read, so it returns lifecycle columns and
// never a personal one. Personal data leaves the module only through getOrganisationApplication.
describe("getApplication returns no personal column (Copilot, PR #39)", () => {
  it("has none of the applicant keys", async () => {
    const s = await setup();
    const row = await getApplication(s.moderator.context, s.applicationId);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(s.applicationId);
    const keys = Object.keys(row!);
    for (const personal of [
      "applicantName",
      "contactEmail",
      "contactPhone",
      "contactOther",
      "messageRaw",
      "attributes",
      "age",
      "collectedFrom",
      "source",
    ]) {
      expect(keys, personal).not.toContain(personal);
    }
  });

  // Deliberate break: revert getApplication to select() with no column list. The row then carries
  // applicantName and the other personal keys, and the loop fails on the first one.
});
