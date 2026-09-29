import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { AccountSettingsError, changeResidentPassword, claimResidentProfile, signIn } from "@/modules/identity/auth";
import { createResidentProfile, readDatabaseClock } from "@/modules/identity/repository";
import { account, session } from "@/modules/identity/schema";
import { activityEvent } from "@/modules/audit/schema";
import type { CurrentSession } from "@/modules/identity/session-cookie";
import { adminClient, cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";
import { injectProviderFault, type FaultInjectorHandle } from "../../helpers/provider-fault";

// auth-provider-deadline design.md D7 / tasks.md 7.2. AUTH_PROVIDER_DEADLINE_MS=3000 (D12).
process.env.AUTH_PROVIDER_DEADLINE_MS = "3000";

const PASSWORD = "test-password-not-real-1234";

let hh: TestHousehold | undefined;
let injector: FaultInjectorHandle | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  injector?.restore();
  injector = undefined;
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

async function sessionRevoked(context: SessionContext, sessionId: string): Promise<boolean> {
  const [row] = await withSessionContext(context, (tx) => tx.select().from(session).where(eq(session.id, sessionId)));
  return row.revokedAt !== null;
}

async function passwordChangedAt(context: SessionContext, accountId: string): Promise<Date | null> {
  const [row] = await withSessionContext(context, (tx) => tx.select().from(account).where(eq(account.id, accountId)));
  return row?.passwordChangedAt ?? null;
}

async function eventCount(context: SessionContext, accountId: string): Promise<number> {
  const rows = await withSessionContext(context, (tx) =>
    tx
      .select()
      .from(activityEvent)
      .where(and(eq(activityEvent.eventType, "account.password_changed"), eq(activityEvent.subjectId, accountId))),
  );
  return rows.length;
}

// tasks.md 7.2, "Plain refusal" case: probed against flatmate-io-dev (see the applier's report) —
// updateUserById's only reachable refusal is a `weak_password` (422, GoTrue's own configured
// minimum, 6 characters), and changeResidentPassword's own checkPasswordRule already refuses
// anything shorter than that BEFORE the provider is ever called (JOIN_PASSWORD_MIN_LENGTH). There
// is no provider-level refusal reachable through this function's real code path with the app's own
// validation gate in place, so this case is dropped, per the task's own instruction.

describe("password change: an unanswered write is never a wrong password (design.md D7)", () => {
  it("applied, answer lost: a normal return, other session revoked, caller's live, stamp set, one event, new password signs in", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "PwAppliedLost");
    const other = await residentSignIn(hh, "PwAppliedLost");
    const caller = await residentSignIn(hh, "PwAppliedLost");
    const current: CurrentSession = { sessionId: caller.session.id, context: caller.context };
    const startedAt = await readDatabaseClock();

    injector = injectProviderFault([
      { method: "PUT", path: /\/auth\/v1\/admin\/users\//, occurrence: 1, mode: "forward-then-drop" },
    ]);

    await changeResidentPassword(current, PASSWORD, "pw-applied-lost-new-1");
    injector.restore();
    injector = undefined;

    expect(await sessionRevoked(current.context, other.session.id)).toBe(true);
    expect(await sessionRevoked(current.context, caller.session.id)).toBe(false);
    const stamp = await passwordChangedAt(current.context, resident.accountId);
    expect(stamp).not.toBeNull();
    expect(stamp!.getTime()).toBeGreaterThanOrEqual(startedAt.getTime());
    expect(await eventCount(current.context, resident.accountId)).toBe(1);

    const { error } = await adminClient().auth.signInWithPassword({
      email: `resident-${resident.profileId}@accounts.flatmate.invalid`,
      password: "pw-applied-lost-new-1",
    });
    expect(error).toBeNull();
  });

  it("not applied: password_unchanged_sessions_ended, other session revoked, stamp set, no event, old password signs in, 2 PUTs", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "PwNotApplied");
    const other = await residentSignIn(hh, "PwNotApplied");
    const caller = await residentSignIn(hh, "PwNotApplied");
    const current: CurrentSession = { sessionId: caller.session.id, context: caller.context };
    const startedAt = await readDatabaseClock();

    injector = injectProviderFault([
      { method: "PUT", path: /\/auth\/v1\/admin\/users\//, occurrence: "every", mode: "drop-before" },
    ]);

    const err: unknown = await changeResidentPassword(current, PASSWORD, "pw-not-applied-new-1").catch((e) => e);
    expect(err).toBeInstanceOf(AccountSettingsError);
    expect((err as AccountSettingsError).code).toBe("password_unchanged_sessions_ended");

    expect(await sessionRevoked(current.context, other.session.id)).toBe(true);
    const stamp = await passwordChangedAt(current.context, resident.accountId);
    expect(stamp).not.toBeNull();
    expect(stamp!.getTime()).toBeGreaterThanOrEqual(startedAt.getTime());
    expect(await eventCount(current.context, resident.accountId)).toBe(0);

    const { error } = await adminClient().auth.signInWithPassword({
      email: `resident-${resident.profileId}@accounts.flatmate.invalid`,
      password: PASSWORD,
    });
    expect(error).toBeNull();

    const puts = injector.seen.filter((s) => s.method === "PUT");
    expect(puts).toHaveLength(2);
  });

  it("cannot tell: password_uncertain_sessions_ended, other session revoked, stamp set, no event", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "PwCannotTell");
    const other = await residentSignIn(hh, "PwCannotTell");
    const caller = await residentSignIn(hh, "PwCannotTell");
    const current: CurrentSession = { sessionId: caller.session.id, context: caller.context };
    const startedAt = await readDatabaseClock();

    injector = injectProviderFault([
      { method: "PUT", path: /\/auth\/v1\/admin\/users\//, occurrence: "every", mode: "drop-before" },
      { method: "POST", path: /\/auth\/v1\/token$/, occurrence: { from: 2 }, mode: "drop-before" },
    ]);

    const err: unknown = await changeResidentPassword(current, PASSWORD, "pw-cannot-tell-new-1").catch((e) => e);
    expect(err).toBeInstanceOf(AccountSettingsError);
    expect((err as AccountSettingsError).code).toBe("password_uncertain_sessions_ended");

    expect(await sessionRevoked(current.context, other.session.id)).toBe(true);
    const stamp = await passwordChangedAt(current.context, resident.accountId);
    expect(stamp).not.toBeNull();
    expect(stamp!.getTime()).toBeGreaterThanOrEqual(startedAt.getTime());
    expect(await eventCount(current.context, resident.accountId)).toBe(0);
  });

  it("current check lost: provider_unavailable, nothing written", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "PwCurrentCheckLost");
    const other = await residentSignIn(hh, "PwCurrentCheckLost");
    const caller = await residentSignIn(hh, "PwCurrentCheckLost");
    const current: CurrentSession = { sessionId: caller.session.id, context: caller.context };

    injector = injectProviderFault([
      { method: "POST", path: /\/auth\/v1\/token$/, occurrence: [1, 2], mode: "drop-before" },
    ]);

    const err: unknown = await changeResidentPassword(current, PASSWORD, "pw-current-check-lost-new-1").catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(AccountSettingsError);
    expect((err as AccountSettingsError).code).toBe("provider_unavailable");

    expect(await sessionRevoked(current.context, other.session.id)).toBe(false);
    expect(await sessionRevoked(current.context, caller.session.id)).toBe(false);
    expect(await eventCount(current.context, resident.accountId)).toBe(0);

    const { error } = await adminClient().auth.signInWithPassword({
      email: `resident-${resident.profileId}@accounts.flatmate.invalid`,
      password: PASSWORD,
    });
    expect(error).toBeNull();
  });
});
