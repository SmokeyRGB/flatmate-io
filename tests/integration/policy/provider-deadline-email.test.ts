import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { AccountSettingsError, changeResidentEmail, claimResidentProfile, signIn } from "@/modules/identity/auth";
import { createResidentProfile, issuePasswordResetLink } from "@/modules/identity/repository";
import { account } from "@/modules/identity/schema";
import { activityEvent } from "@/modules/audit/schema";
import type { CurrentSession } from "@/modules/identity/session-cookie";
import {
  adminClient,
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  testEmail,
  type TestHousehold,
} from "../../helpers/identity";
import { injectProviderFault, type FaultInjectorHandle } from "../../helpers/provider-fault";

// auth-provider-deadline design.md D6 / tasks.md 6.3. AUTH_PROVIDER_DEADLINE_MS=3000 (D12).
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
  const { accountId } = await claimResidentProfile(household.context, profile.id, PASSWORD, "de");
  accountIds.push(accountId);
  return { profileId: profile.id, accountId, displayName: name };
}

async function residentSession(
  household: TestHousehold,
  resident: { profileId: string; accountId: string; displayName: string },
): Promise<CurrentSession> {
  const signedIn = await signIn({
    kind: "resident",
    householdId: household.householdId,
    displayName: resident.displayName,
    password: PASSWORD,
  });
  return { context: signedIn.context, sessionId: signedIn.session.id };
}

async function eventCount(subjectId: string): Promise<number> {
  const context: SessionContext = { accountId: subjectId, householdId: hh!.householdId, profileId: null };
  const rows = await withSessionContext(context, (tx) =>
    tx
      .select()
      .from(activityEvent)
      .where(and(eq(activityEvent.eventType, "account.email_changed"), eq(activityEvent.subjectId, subjectId))),
  );
  return rows.length;
}

async function readAccountEmail(accountId: string): Promise<string | null> {
  const context: SessionContext = { accountId, householdId: hh!.householdId, profileId: null };
  const [row] = await withSessionContext(context, (tx) => tx.select().from(account).where(eq(account.id, accountId)));
  return row?.email ?? null;
}

describe("a change whose provider answer is lost ends in the provider's state (design.md D6)", () => {
  it("applied, answer lost: account.email is the new address, verified_at null, exactly one event", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "EmailAppliedLost");
    const current = await residentSession(hh, resident);
    const newEmail = testEmail();

    injector = injectProviderFault([
      { method: "PUT", path: /\/auth\/v1\/admin\/users\//, occurrence: 1, mode: "forward-then-drop" },
    ]);

    await changeResidentEmail(current, newEmail);
    injector.restore();
    injector = undefined;

    expect(await readAccountEmail(resident.accountId)).toBe(newEmail);
    expect(await eventCount(resident.accountId)).toBe(1);

    const { data } = await adminClient().auth.admin.getUserById(resident.accountId);
    expect(data.user?.email).toBe(newEmail);
  });

  it("applied, resolved by the repair: same end state, including exactly one event", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "EmailRepairResolved");
    const current = await residentSession(hh, resident);
    const newEmail = testEmail();

    injector = injectProviderFault([
      { method: "PUT", path: /\/auth\/v1\/admin\/users\//, occurrence: 1, mode: "forward-then-drop" },
      { method: "GET", path: /\/auth\/v1\/admin\/users\//, occurrence: [1, 2], mode: "drop-before" },
    ]);

    await changeResidentEmail(current, newEmail);
    injector.restore();
    injector = undefined;

    expect(await readAccountEmail(resident.accountId)).toBe(newEmail);
    expect(await eventCount(resident.accountId)).toBe(1);

    const { data } = await adminClient().auth.admin.getUserById(resident.accountId);
    expect(data.user?.email).toBe(newEmail);
  });

  it("not applied: provider_unavailable, nothing changed on either side, no event, 2 PUTs in seen", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "EmailNotApplied");
    const current = await residentSession(hh, resident);
    const newEmail = testEmail();

    injector = injectProviderFault([
      { method: "PUT", path: /\/auth\/v1\/admin\/users\//, occurrence: "every", mode: "drop-before" },
    ]);

    const err: unknown = await changeResidentEmail(current, newEmail).catch((e) => e);
    expect(err).toBeInstanceOf(AccountSettingsError);
    expect((err as AccountSettingsError).code).toBe("provider_unavailable");

    expect(await readAccountEmail(resident.accountId)).toBeNull();
    expect(await eventCount(resident.accountId)).toBe(0);

    const { data } = await adminClient().auth.admin.getUserById(resident.accountId);
    expect(data.user?.email).toBe(`resident-${resident.profileId}@accounts.flatmate.invalid`);

    const puts = injector.seen.filter((s) => s.method === "PUT");
    expect(puts).toHaveLength(2);
  });

  it("not applied, resident without an email: account.email stays null, no event, a reset link can still be issued", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "EmailNotAppliedNoEmail");
    const current = await residentSession(hh, resident);
    const newEmail = testEmail();

    injector = injectProviderFault([
      { method: "PUT", path: /\/auth\/v1\/admin\/users\//, occurrence: "every", mode: "drop-before" },
      { method: "GET", path: /\/auth\/v1\/admin\/users\//, occurrence: [1, 2], mode: "drop-before" },
    ]);

    const err: unknown = await changeResidentEmail(current, newEmail).catch((e) => e);
    expect(err).toBeInstanceOf(AccountSettingsError);
    expect((err as AccountSettingsError).code).toBe("provider_unavailable");

    expect(await readAccountEmail(resident.accountId)).toBeNull();
    expect(await eventCount(resident.accountId)).toBe(0);

    injector.restore();
    injector = undefined;

    // issuePasswordResetLink's own eligibility check requires account.email === null — this must
    // still succeed, proving the repair never wrote the provider's derived `.invalid` address into
    // account.email on this branch (D6, pre-mortem finding 1).
    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);
    expect(link.code).toBeTruthy();
  });

  it("lost once, then fine: a normal return, 2 PUTs in seen", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "EmailLostOnceThenFine");
    const current = await residentSession(hh, resident);
    const newEmail = testEmail();

    injector = injectProviderFault([
      { method: "PUT", path: /\/auth\/v1\/admin\/users\//, occurrence: 1, mode: "drop-before" },
    ]);

    await changeResidentEmail(current, newEmail);

    expect(await readAccountEmail(resident.accountId)).toBe(newEmail);
    const puts = injector.seen.filter((s) => s.method === "PUT");
    expect(puts).toHaveLength(2);
  });
});
