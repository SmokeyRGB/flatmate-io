import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { JoinError, claimResidentProfile, redeemPasswordReset } from "@/modules/identity/auth";
import { createResidentProfile, issuePasswordResetLink, listJoinCodeIssuances } from "@/modules/identity/repository";
import { session } from "@/modules/identity/schema";
import { adminClient, cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";
import { injectProviderFault, type FaultInjectorHandle } from "../../helpers/provider-fault";

// auth-provider-deadline design.md D8 / tasks.md 8.3. AUTH_PROVIDER_DEADLINE_MS=3000 (D12).
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

async function liveSessionCount(context: SessionContext, accountId: string): Promise<number> {
  const rows = await withSessionContext(context, (tx) =>
    tx.select().from(session).where(eq(session.accountId, accountId)),
  );
  return rows.filter((r) => r.revokedAt === null).length;
}

async function linkUses(household: TestHousehold, linkId: string): Promise<number | undefined> {
  const issuances = await listJoinCodeIssuances(household.context, household.accountId);
  return issuances.find((i) => i.id === linkId)?.uses;
}

describe("password reset: an unanswered write is resolved before the person is told anything (design.md D8)", () => {
  it("applied, answer lost: a session is returned, every earlier session revoked, new password signs in, link spent", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "ResetAppliedLost");
    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);

    injector = injectProviderFault([
      { method: "PUT", path: /\/auth\/v1\/admin\/users\//, occurrence: 1, mode: "forward-then-drop" },
    ]);

    const result = await redeemPasswordReset(link.code, { password: "reset-applied-lost-new-1" });
    injector.restore();
    injector = undefined;

    expect(result.session).toBeTruthy();
    expect(await liveSessionCount(result.context, resident.accountId)).toBe(1); // only the new one

    const { error } = await adminClient().auth.signInWithPassword({
      email: `resident-${resident.profileId}@accounts.flatmate.invalid`,
      password: "reset-applied-lost-new-1",
    });
    expect(error).toBeNull();

    expect(await linkUses(hh, link.id)).toBe(1);
  });

  it("not applied: reset_incomplete, old password signs in, link spent, every session revoked, 2 PUTs", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "ResetNotApplied");
    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);

    injector = injectProviderFault([
      { method: "PUT", path: /\/auth\/v1\/admin\/users\//, occurrence: "every", mode: "drop-before" },
    ]);

    const err: unknown = await redeemPasswordReset(link.code, { password: "reset-not-applied-new-1" }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(JoinError);
    expect((err as JoinError).code).toBe("reset_incomplete");
    injector.restore();

    const { error } = await adminClient().auth.signInWithPassword({
      email: `resident-${resident.profileId}@accounts.flatmate.invalid`,
      password: PASSWORD,
    });
    expect(error).toBeNull();

    expect(await linkUses(hh, link.id)).toBe(1);
    expect(await liveSessionCount(hh.context, resident.accountId)).toBe(0);

    const puts = injector!.seen.filter((s) => s.method === "PUT");
    expect(puts).toHaveLength(2);
  });

  it("cannot tell: reset_outcome_unknown, link spent, every session revoked", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "ResetCannotTell");
    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);

    injector = injectProviderFault([
      { method: "PUT", path: /\/auth\/v1\/admin\/users\//, occurrence: "every", mode: "drop-before" },
      { method: "GET", path: /\/auth\/v1\/admin\/users\//, occurrence: "every", mode: "drop-before" },
      { method: "POST", path: /\/auth\/v1\/token$/, occurrence: "every", mode: "drop-before" },
    ]);

    const err: unknown = await redeemPasswordReset(link.code, { password: "reset-cannot-tell-new-1" }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(JoinError);
    expect((err as JoinError).code).toBe("reset_outcome_unknown");
    injector.restore();

    expect(await linkUses(hh, link.id)).toBe(1);
    expect(await liveSessionCount(hh.context, resident.accountId)).toBe(0);
  });

  it("happy path is not burdened: exactly one PUT and no GET before it", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "ResetHappyPath");
    const link = await issuePasswordResetLink(hh.context, hh.accountId, resident.profileId);

    injector = injectProviderFault([
      { method: "PUT", path: /\/auth\/v1\/admin\/users\//, occurrence: "every", mode: "record" },
      { method: "GET", path: /\/auth\/v1\/admin\/users\//, occurrence: "every", mode: "record" },
    ]);

    await redeemPasswordReset(link.code, { password: "reset-happy-path-new-1" });

    const puts = injector.seen.filter((s) => s.method === "PUT");
    expect(puts).toHaveLength(1);
    const firstPutIndex = injector.seen.findIndex((s) => s.method === "PUT");
    const getsBeforePut = injector.seen.slice(0, firstPutIndex).filter((s) => s.method === "GET");
    expect(getsBeforePut).toHaveLength(0);
  });
});
