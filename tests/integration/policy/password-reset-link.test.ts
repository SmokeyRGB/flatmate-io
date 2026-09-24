import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import {
  JoinError,
  SignInError,
  changeResidentEmail,
  claimResidentProfile,
  joinHousehold,
  redeemPasswordReset,
  signIn,
} from "@/modules/identity/auth";
import {
  ResidentListActionDeniedError,
  ResidentProfileNotEligibleForResetError,
  createResidentProfile,
  issuePasswordResetLink,
  setMemberRole,
  setMovedOut,
} from "@/modules/identity/repository";
import { activityEvent } from "@/modules/audit/schema";
import { account, joinCodeIssuance, membership, residentProfile, session } from "@/modules/identity/schema";
import type { CurrentSession } from "@/modules/identity/session-cookie";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

const PASSWORD = "test-password-not-real-1234";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

async function claimResident(household: TestHousehold, name: string) {
  const profile = await createResidentProfile(household.context, name, {
    accountId: household.accountId,
    profileId: null,
  });
  const { accountId } = await claimResidentProfile(household.context, profile.id, PASSWORD);
  accountIds.push(accountId);
  return { profileId: profile.id, accountId };
}

function residentCurrentSession(
  household: TestHousehold,
  resident: { profileId: string; accountId: string },
): CurrentSession {
  const context: SessionContext = {
    accountId: resident.accountId,
    householdId: household.householdId,
    profileId: resident.profileId,
  };
  return { sessionId: "n/a", context }; // sessionId is unused by changeResidentEmail
}

async function sessionRowsFor(context: SessionContext, accountId: string) {
  return withSessionContext(context, (tx) => tx.select().from(session).where(eq(session.accountId, accountId)));
}

// resident-settings design.md Decision 6 (identity/password-reset, O-16): issuing a reset link.
describe("issuePasswordResetLink (design.md Decision 6)", () => {
  it("issuing as the household account succeeds", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "IssueSucceeds");

    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);
    expect(link.purpose).toBe("password_reset");
    expect(link.maxUses).toBe(1);
    expect(link.residentProfileId).toBe(resident.profileId);
  });

  it("issuing as a moderator is refused (assert ResidentListActionDeniedError)", async () => {
    hh = await registerTestHousehold();
    const moderator = await claimResident(hh, "ModeratorIssuer");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");
    const resident = await claimResident(hh, "IssueRefusedModerator");
    const moderatorCtx: SessionContext = {
      accountId: moderator.accountId,
      householdId: hh.householdId,
      profileId: moderator.profileId,
    };

    await expect(
      issuePasswordResetLink(moderatorCtx, moderator.accountId, resident.profileId),
    ).rejects.toThrow(ResidentListActionDeniedError);
  });

  it("issuing for a prepared, a moved-out, or an already-emailed profile is refused (assert the class)", async () => {
    hh = await registerTestHousehold();

    const prepared = await createResidentProfile(hh.context, "PreparedNotEligible", {
      accountId: hh.accountId,
      profileId: null,
    });
    await expect(issuePasswordResetLink(hh.context, hh.accountId, prepared.id)).rejects.toThrow(
      ResidentProfileNotEligibleForResetError,
    );

    const movedOut = await claimResident(hh, "MovedOutNotEligible");
    await setMovedOut(hh.context, hh.accountId, movedOut.accountId);
    await expect(
      issuePasswordResetLink(hh.context, hh.accountId, movedOut.profileId),
    ).rejects.toThrow(ResidentProfileNotEligibleForResetError);

    const hasEmail = await claimResident(hh, "HasEmailNotEligible");
    await changeResidentEmail(residentCurrentSession(hh, hasEmail), "has-email-already@example.test");
    await expect(
      issuePasswordResetLink(hh.context, hh.accountId, hasEmail.profileId),
    ).rejects.toThrow(ResidentProfileNotEligibleForResetError);
  });
});

// resident-settings design.md Decision 5 (identity/password-reset): redeeming a reset link.
describe("redeemPasswordReset (design.md Decision 5)", () => {
  it("sets the password, revokes every pre-existing session, spends the link once, and records the event", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "FullRedeem");
    const signIn1 = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "FullRedeem",
      password: PASSWORD,
    });
    const signIn2 = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "FullRedeem",
      password: PASSWORD,
    });

    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);
    const result = await redeemPasswordReset(link.code, { password: "reset-new-password-123" });

    let caught: unknown;
    try {
      await signIn({
        kind: "resident",
        householdId: hh.householdId,
        displayName: "FullRedeem",
        password: PASSWORD,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SignInError);
    expect((caught as SignInError).code).toBe("invalid_credentials");

    const afterReset = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "FullRedeem",
      password: "reset-new-password-123",
    });
    expect(afterReset.context.accountId).toBe(resident.accountId);
    expect(afterReset.context.profileId).toBe(resident.profileId);

    const rows = await sessionRowsFor(hh.context, resident.accountId);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(signIn1.session.id)?.revokedAt).not.toBeNull();
    expect(byId.get(signIn2.session.id)?.revokedAt).not.toBeNull();
    expect(byId.get(result.session.id)?.revokedAt).toBeNull(); // the session redemption itself created

    const [linkRow] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.id, link.id)),
    );
    expect(linkRow.uses).toBe(1);

    const events = await withSessionContext(hh.context, (tx) =>
      tx
        .select()
        .from(activityEvent)
        .where(
          and(
            eq(activityEvent.eventType, "account.password_reset_by_admin"),
            eq(activityEvent.subjectId, resident.profileId),
          ),
        ),
    );
    expect(events).toHaveLength(1);
    expect(events[0].actorAccountId).toBe(hh.accountId); // the issuer, not the redeemer
    expect(events[0].actorProfileId).toBeNull();
    expect(events[0].payload).toEqual({});

    // No new profile, account, or membership row: exactly the household admin plus this resident.
    const profiles = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.householdId, hh!.householdId)),
    );
    expect(profiles).toHaveLength(1);
    const memberships = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.householdId, hh!.householdId)),
    );
    expect(memberships).toHaveLength(2);
  });

  it("a second redemption gives invalid_link (assert the code)", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "SecondRedeem");
    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);
    await redeemPasswordReset(link.code, { password: "first-reset-pw-123" });

    let caught: unknown;
    try {
      await redeemPasswordReset(link.code, { password: "second-reset-pw-123" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(JoinError);
    expect((caught as JoinError).code).toBe("invalid_link");
  });

  it("redeeming after the resident adds an email gives invalid_link", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "EmailClosesGap");
    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);

    await changeResidentEmail(residentCurrentSession(hh, resident), "closes-the-gap@example.test");

    let caught: unknown;
    try {
      await redeemPasswordReset(link.code, { password: "should-not-apply-123" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(JoinError);
    expect((caught as JoinError).code).toBe("invalid_link");
  });

  it("joinHousehold with a reset code gives invalid_link, and uses is unchanged", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "JoinWithResetCode");
    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);

    let caught: unknown;
    try {
      await joinHousehold(link.code, { displayName: "Intruder", password: "whatever-not-real-1234" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(JoinError);
    expect((caught as JoinError).code).toBe("invalid_link");

    const [linkRow] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.id, link.id)),
    );
    expect(linkRow.uses).toBe(0);
  });

  // resident-settings design.md Decision 8 (pre-mortem fix, 2026-09-24; tasks.md 3.7): a visitor
  // ALREADY SIGNED IN (the household account opening the link to check it, say — a different
  // account than the one being reset) has their own previous session revoked by the redemption.
  it("a signed-in visitor redeeming a reset link has their previous session revoked", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "VisitorAlreadySignedIn");
    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);

    const visitorSignIn = await signIn({
      kind: "household",
      email: hh.email,
      password: "test-password-not-real-1234",
    });
    const currentSession: CurrentSession = {
      sessionId: visitorSignIn.session.id,
      context: visitorSignIn.context,
    };

    await redeemPasswordReset(link.code, { password: "reset-new-password-123" }, { currentSession });

    const [visitorSessionRow] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(session).where(eq(session.id, visitorSignIn.session.id)),
    );
    expect(visitorSessionRow.revokedAt).not.toBeNull();
  });

  // CLAUDE.md "A concurrent request" / design.md's re-check: the SQL claim's own predicate
  // (a.email IS NULL) is evaluated in its own statement's snapshot. The account `FOR UPDATE`
  // re-check afterwards is what makes that snapshot irrelevant — this builds the race directly,
  // the same technique as revoked-membership-sign-in.test.ts's "does not race a concurrent
  // revocation": a raw transaction (standing in for a concurrent changeResidentEmail) takes the
  // account row lock and holds it, uncommitted, while redeemPasswordReset is started concurrently.
  it("the account FOR UPDATE re-check does not race a concurrent email add (invariant guard)", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "RaceEmailAdd");
    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);

    let releaseRawTx: () => void = () => {};
    const rawTxGate = new Promise<void>((resolve) => {
      releaseRawTx = resolve;
    });
    let markLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });

    // Stand-in for a concurrent changeResidentEmail: takes the account row lock, then holds the
    // transaction open (uncommitted) until this test releases it, then sets the email and commits.
    const rawTxPromise = withSessionContext(hh!.context, async (tx) => {
      await tx.select().from(account).where(eq(account.id, resident.accountId)).for("update");
      markLocked();
      await rawTxGate;
      await tx.update(account).set({ email: "raced-in@example.test" }).where(eq(account.id, resident.accountId));
    });

    // Wait for the raw transaction to actually hold the lock before starting the redemption —
    // otherwise redeemPasswordReset could race ahead of it, not just its commit.
    await locked;

    const redeemPromise = redeemPasswordReset(link.code, { password: "reset-new-password-123" }).then(
      (result) => ({ ok: true as const, result }),
      (err) => ({ ok: false as const, err }),
    );

    // A generous window for redeemPasswordReset's own claim/membership steps (and its `FOR UPDATE`
    // on account) to reach the database and start waiting on the lock, before this test commits
    // the raw transaction out from under it.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    releaseRawTx();
    await rawTxPromise;

    const outcome = await redeemPromise;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.err).toBeInstanceOf(JoinError);
      expect((outcome.err as JoinError).code).toBe("invalid_link");
    }

    // The whole transaction rolled back, including the claim — the link is not spent.
    const [linkRow] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.id, link.id)),
    );
    expect(linkRow.uses).toBe(0);
  });
});
