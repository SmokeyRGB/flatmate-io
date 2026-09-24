import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import {
  AccountSettingsError,
  SignInError,
  changeResidentPassword,
  claimResidentProfile,
  signIn,
} from "@/modules/identity/auth";
import { createResidentProfile, setMovedOut } from "@/modules/identity/repository";
import { account, session } from "@/modules/identity/schema";
import { activityEvent } from "@/modules/audit/schema";
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

async function residentSignIn(household: TestHousehold, name: string, password = PASSWORD) {
  return signIn({ kind: "resident", householdId: household.householdId, displayName: name, password });
}

// resident-settings design.md Decision 7 (identity/account-settings): changing a resident's own
// password. Plan's Risk note (D7/Working tips): each case here signs in at least once, sometimes
// several times — kept to one small file, run serially, per the /token pacing tip.
describe("changeResidentPassword (identity/account-settings, design.md Decision 7)", () => {
  it("a wrong current password gives wrong_current_password and no session is revoked", async () => {
    hh = await registerTestHousehold();
    await claimResident(hh, "WrongCurrent");
    const signedIn = await residentSignIn(hh, "WrongCurrent");
    const current: CurrentSession = { sessionId: signedIn.session.id, context: signedIn.context };

    await expect(
      changeResidentPassword(current, "not-the-real-password", "new-password-123"),
    ).rejects.toMatchObject({ code: "wrong_current_password" });

    const [row] = await withSessionContext(current.context, (tx) =>
      tx.select().from(session).where(eq(session.id, signedIn.session.id)),
    );
    expect(row.revokedAt).toBeNull();
  });

  it("success means the new password signs in and the old one doesn't", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "SuccessChange");
    const signedIn = await residentSignIn(hh, "SuccessChange");
    const current: CurrentSession = { sessionId: signedIn.session.id, context: signedIn.context };

    await changeResidentPassword(current, PASSWORD, "new-password-456");

    let caught: unknown;
    try {
      await residentSignIn(hh, "SuccessChange", PASSWORD);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SignInError);
    expect((caught as SignInError).code).toBe("invalid_credentials");

    const result = await residentSignIn(hh, "SuccessChange", "new-password-456");
    expect(result.context.accountId).toBe(resident.accountId);
  });

  it("of three sessions, the current one is untouched and the other two have revoked_at set", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "ThreeSessions");
    const signIn1 = await residentSignIn(hh, "ThreeSessions");
    const signIn2 = await residentSignIn(hh, "ThreeSessions");
    const signIn3 = await residentSignIn(hh, "ThreeSessions");

    const current: CurrentSession = { sessionId: signIn2.session.id, context: signIn2.context };
    await changeResidentPassword(current, PASSWORD, "three-sessions-new-pw");

    const rows = await withSessionContext(current.context, (tx) =>
      tx.select().from(session).where(eq(session.accountId, resident.accountId)),
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(signIn1.session.id)?.revokedAt).not.toBeNull();
    expect(byId.get(signIn2.session.id)?.revokedAt).toBeNull(); // the current session, kept
    expect(byId.get(signIn3.session.id)?.revokedAt).not.toBeNull();
  });

  it("one account.password_changed event with payload {}", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "AuditedPwChange");
    const signedIn = await residentSignIn(hh, "AuditedPwChange");
    const current: CurrentSession = { sessionId: signedIn.session.id, context: signedIn.context };
    await changeResidentPassword(current, PASSWORD, "audited-new-pw-123");

    const events = await withSessionContext(current.context, (tx) =>
      tx
        .select()
        .from(activityEvent)
        .where(
          and(eq(activityEvent.eventType, "account.password_changed"), eq(activityEvent.subjectId, resident.accountId)),
        ),
    );
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({});
    expect(events[0].actorAccountId).toBe(resident.accountId);
  });

  // Copilot review round 2 (PR #23), CLAUDE.md "A concurrent request": mirrors
  // account-settings-email.test.ts's own "stale CurrentSession after revocation" case — a
  // move-out/removal that commits AFTER this action read CurrentSession must still be caught, not
  // only context.profileId's (possibly stale) claim.
  it("using a stale CurrentSession after the membership is revoked gives not_a_resident, with nothing changed", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "RevokedThenPassword");
    const signedIn = await residentSignIn(hh, "RevokedThenPassword");
    const current: CurrentSession = { sessionId: signedIn.session.id, context: signedIn.context };

    await setMovedOut(hh.context, hh.accountId, resident.accountId);

    await expect(
      changeResidentPassword(current, PASSWORD, "should-not-apply-123"),
    ).rejects.toMatchObject({ code: "not_a_resident" });

    // Nothing changed: the provider password is still the original one.
    const { error: signInError } = await adminClient().auth.signInWithPassword({
      email: `resident-${resident.profileId}@accounts.flatmate.invalid`,
      password: PASSWORD,
    });
    expect(signInError).toBeNull();

    const events = await withSessionContext(hh.context, (tx) =>
      tx
        .select()
        .from(activityEvent)
        .where(
          and(
            eq(activityEvent.eventType, "account.password_changed"),
            eq(activityEvent.subjectId, resident.accountId),
          ),
        ),
    );
    expect(events).toHaveLength(0);
  });

  it("a too-short new password gives password_too_short", async () => {
    hh = await registerTestHousehold();
    await claimResident(hh, "TooShort");
    const signedIn = await residentSignIn(hh, "TooShort");
    const current: CurrentSession = { sessionId: signedIn.session.id, context: signedIn.context };

    await expect(changeResidentPassword(current, PASSWORD, "abc")).rejects.toMatchObject({
      code: "password_too_short",
    });
  });
});

// review fix (Copilot finding, PR #23): changeResidentPassword used to verify the current password
// with signInWithPassword, THEN call updateUserById — with no lock held in between. A concurrent
// redeemPasswordReset (or a second changeResidentPassword) could commit its own password change in
// that gap, and the original change's updateUserById would then silently overwrite it. The fix
// (design.md D7, extended) takes `SELECT account ... FOR UPDATE` FIRST, before any provider call,
// so a concurrent writer either finishes first (and this function's later signInWithPassword then
// fails against the password IT wrote, refusing as wrong_current_password) or waits behind this
// function's own lock.
//
// This builds the race directly, the same technique password-reset-link.test.ts's own "does not
// race a concurrent email add" guard uses: a raw transaction stands in for a concurrent write that
// takes the account row lock and holds it, uncommitted, while changeResidentPassword is started
// concurrently.
describe("changeResidentPassword's account lock does not race a concurrent password write (invariant guard)", () => {
  it("blocks behind an uncommitted concurrent write, then refuses instead of overwriting it", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "PasswordLockRace");
    const current = { sessionId: "n/a", context: { accountId: resident.accountId, householdId: hh.householdId, profileId: resident.profileId } } as CurrentSession;

    let releaseRawTx: () => void = () => {};
    const rawTxGate = new Promise<void>((resolve) => {
      releaseRawTx = resolve;
    });
    let markLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });

    const RACED_IN_PASSWORD = "raced-in-password-999";

    // Stand-in for a concurrent redeemPasswordReset: takes the account row lock, holds the
    // transaction open (uncommitted) while changeResidentPassword starts and blocks behind it,
    // then — still "inside" the lock's window from the caller's point of view — changes the
    // provider password directly (the same effect redeemPasswordReset's own updateUserById inside
    // its transaction has), and only then releases (commits) the lock.
    const rawTxPromise = withSessionContext(hh!.context, async (tx) => {
      await tx.select().from(account).where(eq(account.id, resident.accountId)).for("update");
      markLocked();
      await rawTxGate;
      const { error } = await adminClient().auth.admin.updateUserById(resident.accountId, {
        password: RACED_IN_PASSWORD,
      });
      if (error) throw error;
    });

    // Wait for the raw transaction to actually hold the lock before starting the change — otherwise
    // changeResidentPassword could race ahead of it, not just its commit.
    await locked;

    const changePromise = changeResidentPassword(current, PASSWORD, "attempted-overwrite-123").then(
      () => ({ ok: true as const }),
      (err) => ({ ok: false as const, err }),
    );

    // A generous window for changeResidentPassword's own account SELECT ... FOR UPDATE to reach the
    // database and start waiting on the lock, before this test releases the raw transaction. If the
    // fix regressed (the account lock removed, or taken after the provider calls instead of before
    // them), changeResidentPassword would race ahead here instead of blocking, and would already
    // have committed its own password by the time this window elapses.
    let changeSettled = false;
    changePromise.then(() => {
      changeSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(changeSettled).toBe(false);

    releaseRawTx();
    await rawTxPromise;

    const outcome = await changePromise;

    // changeResidentPassword's own signInWithPassword now runs against the ALREADY-CHANGED
    // password (the raw transaction's), so its "current password" check fails — it refuses rather
    // than overwriting what the concurrent writer committed under the same lock.
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.err).toBeInstanceOf(AccountSettingsError);
      expect((outcome.err as AccountSettingsError).code).toBe("wrong_current_password");
    }

    // The final password is the one written LAST while holding the lock (the raced-in one) — never
    // the value changeResidentPassword tried to set after losing the race.
    const { error: signInError } = await adminClient().auth.signInWithPassword({
      email: `resident-${resident.profileId}@accounts.flatmate.invalid`,
      password: RACED_IN_PASSWORD,
    });
    expect(signInError).toBeNull();

    const { error: oldPasswordSignInError } = await adminClient().auth.signInWithPassword({
      email: `resident-${resident.profileId}@accounts.flatmate.invalid`,
      password: "attempted-overwrite-123",
    });
    expect(oldPasswordSignInError).not.toBeNull();
  });

  // Deliberate break (argued, not executed — CLAUDE.md forbids weakening a test to prove a
  // regression): moving the provider updateUserById call back OUTSIDE the account lock (i.e.
  // verifying the current password and writing the new one BEFORE `SELECT account ... FOR UPDATE`,
  // the pre-fix shape) removes the serialization this test exercises. changeResidentPassword would
  // then reach its own signInWithPassword BEFORE the raw transaction in this test writes
  // RACED_IN_PASSWORD (there is no lock forcing it to wait), so `changeSettled` would already be
  // `true` well before the 1-second window elapses — failing this test's own
  // `expect(changeSettled).toBe(false)` assertion — and the final password would be
  // "attempted-overwrite-123" (changeResidentPassword's own write, committed first) rather than
  // RACED_IN_PASSWORD, failing the sign-in assertions afterwards too.
});
