import { and, eq, isNull } from "drizzle-orm";
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
  type JoinHouseholdResult,
} from "@/modules/identity/auth";
import {
  ResidentListActionDeniedError,
  ResidentProfileNotEligibleForResetError,
  createResidentProfile,
  issuePasswordResetLink,
  listJoinCodeIssuances,
  setMemberRole,
  setMovedOut,
} from "@/modules/identity/repository";
import { activityEvent } from "@/modules/audit/schema";
import { account, joinCodeIssuance, membership, residentProfile, session } from "@/modules/identity/schema";
import type { CurrentSession } from "@/modules/identity/session-cookie";
import {
  adminClient,
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

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

// review fix (finding 1): a password_reset row's code/url lets whoever reads it take over the
// named resident's profile — only the household account may issue one (O-16), and for the exact
// same reason only the household account may READ one back through listJoinCodeIssuances. Before
// this fix a moderator's list included the row in full (code, url, copy buttons via
// renderJoinCodeCard on O16) despite never being able to issue one themselves.
describe("listJoinCodeIssuances filters password_reset rows for a moderator (O-16)", () => {
  it("a moderator's list has no password_reset row; the household account's list does", async () => {
    hh = await registerTestHousehold();
    const moderator = await claimResident(hh, "ModeratorReader");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");
    const resident = await claimResident(hh, "ResetReaderTarget");
    const moderatorCtx: SessionContext = {
      accountId: moderator.accountId,
      householdId: hh.householdId,
      profileId: moderator.profileId,
    };

    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);

    const moderatorList = await listJoinCodeIssuances(moderatorCtx, moderator.accountId);
    expect(moderatorList.some((row) => row.id === link.id)).toBe(false);
    expect(moderatorList.some((row) => row.purpose === "password_reset")).toBe(false);

    const householdList = await listJoinCodeIssuances(hh.context, hh.accountId);
    const row = householdList.find((r) => r.id === link.id);
    expect(row).toBeDefined();
    expect(row?.purpose).toBe("password_reset");
    expect(row?.code).toBe(link.code);
  });

  // Deliberate break (reported, then reverted): removing the
  // `callerIsHouseholdAdmin || issuance.purpose !== "password_reset"` filter in
  // listJoinCodeIssuances made this test fail as expected — the moderator's list then contained
  // the reset row (`moderatorList.some(...) === true`), confirming the filter is what this test
  // exercises rather than an unrelated invariant.
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

  // Copilot review round 2 (PR #23): redeemPasswordReset is now three SEPARATE transactions
  // (phase 1 claim+revoke, phase 2 the provider write, phase 3 sign-in+session) with no
  // transaction spanning Postgres and Supabase — this asserts directly against the PROVIDER
  // (adminClient, not the app-level signIn) that phase 2's password write really lands, and that
  // phase 1's revoke-all really reaches every session that existed before redemption, independent
  // of the "sets the password..." test above (which only ever exercises this through signIn).
  it("after a successful redemption, the provider password is the new one and every pre-existing session is revoked", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "ProviderPasswordCheck");
    const priorSignIn1 = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "ProviderPasswordCheck",
      password: PASSWORD,
    });
    const priorSignIn2 = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "ProviderPasswordCheck",
      password: PASSWORD,
    });

    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);
    await redeemPasswordReset(link.code, { password: "provider-check-new-pw-123" });

    // The provider's OWN sign-in, not the app's — directly against Supabase Auth.
    const { error: newPasswordError } = await adminClient().auth.signInWithPassword({
      email: `resident-${resident.profileId}@accounts.flatmate.invalid`,
      password: "provider-check-new-pw-123",
    });
    expect(newPasswordError).toBeNull();
    const { error: oldPasswordError } = await adminClient().auth.signInWithPassword({
      email: `resident-${resident.profileId}@accounts.flatmate.invalid`,
      password: PASSWORD,
    });
    expect(oldPasswordError).not.toBeNull();

    const rows = await sessionRowsFor(hh.context, resident.accountId);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(priorSignIn1.session.id)?.revokedAt).not.toBeNull();
    expect(byId.get(priorSignIn2.session.id)?.revokedAt).not.toBeNull();
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

  // review fix (Copilot finding, PR #23): redeemPasswordReset used to insert the new session in a
  // SEPARATE transaction AFTER the reset itself had committed. A concurrent setMovedOut/
  // removeMember committing in that gap could leave the moved-out resident with a live session
  // anyway — the reset's own transaction had already revoked every PRIOR session, but the new one
  // was inserted afterwards, outside that revoke's view entirely. Fixed by moving the sign-in and
  // session insert INSIDE the same transaction, still holding the membership row lock. This builds
  // the race directly, same technique as the "account FOR UPDATE re-check" guard above: a raw
  // transaction stands in for a concurrent removal, locking the membership row first and holding it
  // open while the redemption is started, then — still holding the lock — revoking the membership
  // and the resident's session (removeMember's own effect) before committing.
  it("a removal winning the membership lock makes the redemption fail, with no live session left behind (invariant guard)", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "RemovalWinsLock");
    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);

    // A pre-existing session, so "no live session afterwards" is a real assertion, not a vacuous
    // one — claimResidentProfile alone never signs in.
    const priorSignIn = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "RemovalWinsLock",
      password: PASSWORD,
    });

    let releaseRawTx: () => void = () => {};
    const rawTxGate = new Promise<void>((resolve) => {
      releaseRawTx = resolve;
    });
    let markLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });

    // Stand-in for a concurrent removal (removeMember/setMovedOut): locks the membership row
    // FIRST — the same row redeemPasswordReset's own `SELECT membership ... FOR UPDATE` locks —
    // holds the transaction open (uncommitted), then, still holding the lock, revokes the
    // membership and the resident's existing session (removeMember's own order,
    // resident_profile -> membership -> session, collapsed here to membership -> session since no
    // resident_profile status change is needed to make the point), and only then commits.
    const rawTxPromise = withSessionContext(hh!.context, async (tx) => {
      await tx.select().from(membership).where(eq(membership.residentProfileId, resident.profileId)).for("update");
      markLocked();
      await rawTxGate;
      await tx
        .update(membership)
        .set({ revokedAt: new Date() })
        .where(eq(membership.residentProfileId, resident.profileId));
      await tx
        .update(session)
        .set({ revokedAt: new Date() })
        .where(and(eq(session.accountId, resident.accountId), isNull(session.revokedAt)));
    });

    // Wait for the raw transaction to actually hold the lock before starting the redemption —
    // otherwise redeemPasswordReset could race ahead of it, not just its commit.
    await locked;

    const redeemPromise = redeemPasswordReset(link.code, { password: "reset-new-password-123" }).then(
      (result) => ({ ok: true as const, result }),
      (err) => ({ ok: false as const, err }),
    );

    // A generous window for redeemPasswordReset's own claim and membership `FOR UPDATE` to reach
    // the database and start waiting on the lock, before this test commits the raw transaction out
    // from under it.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    releaseRawTx();
    await rawTxPromise;

    const outcome = await redeemPromise;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.err).toBeInstanceOf(JoinError);
      expect((outcome.err as JoinError).code).toBe("invalid_link");
    }

    const liveSessions = await withSessionContext(hh!.context, (tx) =>
      tx.select().from(session).where(and(eq(session.accountId, resident.accountId), isNull(session.revokedAt))),
    );
    expect(liveSessions).toHaveLength(0);
    // Sanity: the prior session really did exist and really was the one revoked by the removal
    // above, not merely absent because none was ever created.
    const [priorRow] = await withSessionContext(hh!.context, (tx) =>
      tx.select().from(session).where(eq(session.id, priorSignIn.session.id)),
    );
    expect(priorRow.revokedAt).not.toBeNull();
  });

  // review fix (Copilot finding, PR #23), second half, REDESIGNED for the three-phase split
  // (Copilot review round 2): two concurrent resets for the SAME profile (two different
  // single-use links, each independently valid) used to both reach the old post-commit session
  // insert and both leave a session alive. Now each redemption is three SEPARATE transactions
  // (phase 1 claim+revoke, phase 2 the one provider write, phase 3 a FRESH membership lock +
  // sign-in + session insert) — phase 3's sign-in runs against whatever password is CURRENT at
  // that moment, so a redemption whose own phase 2 committed FIRST can find, once it reaches its
  // OWN phase 3, that the OTHER redemption's phase 2 has since overwritten the password: its
  // sign-in fails and the WHOLE redemption call rejects with `reset_done_sign_in_failed` (the
  // password IS set — just not to what this call thinks it is). Whichever redemption's phase 2
  // commits LAST never sees the password change again, so its own later phase 3 always signs in
  // successfully and revokes every OTHER live session (design.md's "revoke every OTHER live
  // session of the account") before inserting its own — so exactly one live session survives,
  // belonging to whichever password was written last, never both and never neither.
  it("two concurrent redemptions of two links for the same profile leave exactly one live session, with the provider's current password", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "ConcurrentTwoLinks");

    const link1 = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);
    const link2 = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);
    const attempts = [
      { code: link1.code, password: "concurrent-pw-one-123" },
      { code: link2.code, password: "concurrent-pw-two-123" },
    ];

    const results = await Promise.allSettled(
      attempts.map((a) => redeemPasswordReset(a.code, { password: a.password })),
    );

    // Nothing about redemption itself refuses a SECOND reset link for a profile whose account
    // still has no email after the first reset — only changeResidentEmail ever sets one
    // (design.md D6: issuing is deliberately unserialized against a concurrent change). At least
    // one of the two always succeeds (the last password writer's own phase 3, argued above); a
    // rejected one must reject with exactly `reset_done_sign_in_failed`, never anything else.
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(JoinError);
      expect((r.reason as JoinError).code).toBe("reset_done_sign_in_failed");
    }
    const fulfilled = results
      .map((r, i) => (r.status === "fulfilled" ? { result: r.value, password: attempts[i].password } : null))
      .filter((x): x is { result: JoinHouseholdResult; password: string } => x !== null);
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const liveSessions = await withSessionContext(hh.context, (tx) =>
      tx.select().from(session).where(and(eq(session.accountId, resident.accountId), isNull(session.revokedAt))),
    );
    expect(liveSessions).toHaveLength(1);

    // The result tells which one got the live session — sign in with THAT redemption's own
    // password, directly against the provider (adminClient, not the app), confirming the live
    // session's owner is exactly the one whose password the provider currently accepts.
    const winner = fulfilled.find((f) => f.result.session.id === liveSessions[0].id);
    expect(winner).toBeDefined();
    const { error: winnerSignInError } = await adminClient().auth.signInWithPassword({
      email: `resident-${resident.profileId}@accounts.flatmate.invalid`,
      password: winner!.password,
    });
    expect(winnerSignInError).toBeNull();
  });

  // Deliberate break, RUN (Copilot review round 2, CLAUDE.md's own instruction for this fix):
  // phase 3's sign-in was moved OUTSIDE the re-acquired membership lock (signInWithPassword called
  // BEFORE the `SELECT membership ... FOR UPDATE` re-check, instead of after it, in a scratch copy
  // of redeemPasswordReset) and this test was run against it — see the PR/commit description for
  // the observed result. There is no deterministic way to force the provider to answer a
  // concurrent signInWithPassword out of order without mocking (forbidden by CLAUDE.md/the task) —
  // two real Supabase Auth round trips racing each other are exactly as fast or slow as the network
  // is on any given run, so this test is best read as an INVARIANT GUARD (same status as the two
  // raw-transaction race tests above, which use an explicit gate instead of real timing) rather
  // than a regression test with a guaranteed reproduction. Argued directly: without the membership
  // lock around it, phase 3's sign-in reads whatever password happens to be current at the moment
  // it runs, with NOTHING serializing that read against the other redemption's own phase 3
  // revoke-then-insert step — both redemptions can reach their own "revoke every other live
  // session, then insert" sequence interleaved rather than strictly ordered by a shared lock, so
  // BOTH inserts can survive whatever the other's revoke saw at ITS OWN read time, leaving TWO live
  // sessions and failing this test's own `expect(liveSessions).toHaveLength(1)`.
});
