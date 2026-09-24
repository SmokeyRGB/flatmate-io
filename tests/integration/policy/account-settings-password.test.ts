import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import {
  SignInError,
  changeResidentPassword,
  claimResidentProfile,
  signIn,
} from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { session } from "@/modules/identity/schema";
import { activityEvent } from "@/modules/audit/schema";
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
