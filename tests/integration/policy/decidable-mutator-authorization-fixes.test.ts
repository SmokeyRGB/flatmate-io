import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile, signIn } from "@/modules/identity/auth";
import {
  createResidentProfile,
  PermissionDeniedError,
  ResidentListActionDeniedError,
  transitionResidentProfileStatus,
  revokeSession,
} from "@/modules/identity/repository";
import { session as sessionTable } from "@/modules/identity/schema";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

// Human decision (user, 2026-09-23), fixing the three decidable G-C gaps found while classifying
// casting/identity repository.ts exports for M6's authorization matrix:
//   1. revokeSession accepted ANY sessionId under RLS's household-only scoping — no check that it
//      belonged to the caller's own account.
//   2. createResidentProfile's `if (actor.accountId)` skipped assertIsAdministration entirely for
//      a null accountId, instead of refusing.
//   3. transitionResidentProfileStatus had no authorization check anywhere in its call chain.
// transitionApplication (casting/repository.ts) is the one gap NOT fixed here — no authorization
// rule exists yet for it (F3's decision) — recorded as M6's KNOWN_OPEN entry instead.

const PASSWORD = "test-password-not-real-1234";

async function claimResident(hh: TestHousehold, name: string) {
  const profile = await createResidentProfile(hh.context, name, {
    accountId: hh.accountId,
    profileId: null,
  });
  const { accountId } = await claimResidentProfile(hh.context, profile.id, PASSWORD);
  return { profileId: profile.id, accountId, displayName: name };
}

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

describe("revokeSession refuses to revoke another account's session (G-C fix 1)", () => {
  it("a plain resident cannot revoke the household admin's session, and it stays unrevoked", async () => {
    hh = await registerTestHousehold();
    const adminSignIn = await signIn({ kind: "household", email: hh.email, password: PASSWORD });

    const resident = await claimResident(hh, "Resident1");
    accountIds.push(resident.accountId);
    const residentSignIn = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: resident.displayName,
      password: PASSWORD,
    });

    await expect(
      revokeSession({ accountId: resident.accountId, householdId: hh.householdId, profileId: resident.profileId }, adminSignIn.session.id),
    ).rejects.toThrow(PermissionDeniedError);

    const [adminSessionRow] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(sessionTable).where(eq(sessionTable.id, adminSignIn.session.id)),
    );
    expect(adminSessionRow.revokedAt).toBeNull();

    // Own session (self-service sign-out) still works, and revoking it twice stays harmless —
    // and the ORIGINAL revocation timestamp is never overwritten by the second call (the repo's
    // convention, see revokeMembershipForProfileTx's comment ~line 526).
    await revokeSession(residentSignIn.context, residentSignIn.session.id);

    const [firstRevocation] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(sessionTable).where(eq(sessionTable.id, residentSignIn.session.id)),
    );
    expect(firstRevocation.revokedAt).not.toBeNull();

    await expect(revokeSession(residentSignIn.context, residentSignIn.session.id)).resolves.toBeUndefined();

    const [residentSessionRow] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(sessionTable).where(eq(sessionTable.id, residentSignIn.session.id)),
    );
    expect(residentSessionRow.revokedAt).not.toBeNull();
    expect(residentSessionRow.revokedAt).toEqual(firstRevocation.revokedAt);
  });

  it("revoking another member's already-revoked session is still refused", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "Resident2");
    accountIds.push(resident.accountId);
    const adminSignIn = await signIn({ kind: "household", email: hh.email, password: PASSWORD });

    // The admin revokes their own session first, so it exists but is already revoked...
    await revokeSession(adminSignIn.context, adminSignIn.session.id);

    // ...and the resident still cannot revoke it, even though it's already revoked.
    await expect(
      revokeSession(
        { accountId: resident.accountId, householdId: hh.householdId, profileId: resident.profileId },
        adminSignIn.session.id,
      ),
    ).rejects.toThrow(PermissionDeniedError);
  });
});

describe("createResidentProfile refuses a null-accountId actor (G-C fix 2)", () => {
  it("refuses with ResidentListActionDeniedError and creates nothing", async () => {
    hh = await registerTestHousehold();

    await expect(
      createResidentProfile(hh.context, "Nobody", { accountId: null, profileId: null }),
    ).rejects.toThrow(ResidentListActionDeniedError);
  });

  it("the legitimate path (administration, a real accountId) still works", async () => {
    hh = await registerTestHousehold();
    const profile = await createResidentProfile(hh.context, "Legit", {
      accountId: hh.accountId,
      profileId: null,
    });
    expect(profile.displayName).toBe("Legit");
    expect(profile.status).toBe("prepared");
  });
});

describe("transitionResidentProfileStatus requires administration or moderator (G-C fix 3)", () => {
  it("refuses a plain resident", async () => {
    hh = await registerTestHousehold();
    const target = await createResidentProfile(hh.context, "Target", {
      accountId: hh.accountId,
      profileId: null,
    });
    const resident = await claimResident(hh, "Resident1");
    accountIds.push(resident.accountId);

    // PR #19 review: authorization derives from the authenticated session, so this refusal must
    // use the resident's OWN SessionContext, not the admin's hh.context paired with the
    // resident's accountId — that combination is refused as a session/actor mismatch, not for
    // lacking the administration-or-moderator role this test means to exercise.
    await expect(
      transitionResidentProfileStatus(
        { accountId: resident.accountId, householdId: hh.householdId, profileId: resident.profileId },
        target.id,
        "moved_out",
        { accountId: resident.accountId, profileId: resident.profileId },
      ),
    ).rejects.toThrow(ResidentListActionDeniedError);
  });

  it("refuses a resident's own session spoofed with the admin's accountId (PR #19 review)", async () => {
    hh = await registerTestHousehold();
    const target = await createResidentProfile(hh.context, "Target3", {
      accountId: hh.accountId,
      profileId: null,
    });
    const resident = await claimResident(hh, "Resident3");
    accountIds.push(resident.accountId);

    await expect(
      transitionResidentProfileStatus(
        { accountId: resident.accountId, householdId: hh.householdId, profileId: resident.profileId },
        target.id,
        "moved_out",
        { accountId: hh.accountId, profileId: null },
      ),
    ).rejects.toThrow(ResidentListActionDeniedError);
  });

  it("refuses a null-accountId actor", async () => {
    hh = await registerTestHousehold();
    const target = await createResidentProfile(hh.context, "Target2", {
      accountId: hh.accountId,
      profileId: null,
    });

    await expect(
      transitionResidentProfileStatus(hh.context, target.id, "moved_out", {
        accountId: null,
        profileId: null,
      }),
    ).rejects.toThrow(ResidentListActionDeniedError);
  });

  it("the legitimate path (administration) still works — display-name-uniqueness.test.ts's own shape", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const first = await createResidentProfile(hh.context, "Jonas", adminActor);

    const updated = await transitionResidentProfileStatus(hh.context, first.id, "moved_out", adminActor);
    expect(updated.status).toBe("moved_out");
  });
});
