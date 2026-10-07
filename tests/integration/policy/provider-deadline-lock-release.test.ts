import { afterEach, describe, expect, it } from "vitest";
import { AccountSettingsError, changeResidentEmail, claimResidentProfile, signIn } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import type { CurrentSession } from "@/modules/identity/session-cookie";
import { cleanupAll, deleteTestAccount, registerTestHousehold, testEmail, type TestHousehold } from "../../helpers/identity";
import { injectProviderFault, type FaultInjectorHandle } from "../../helpers/provider-fault";

// auth-provider-deadline design.md D12 / tasks.md 6.4: without the deadline, a changeResidentEmail
// whose write is lost holds membership/account/session for up to 300s, and a concurrent signIn for
// the same account (which needs the same membership row FOR SHARE) waits that whole time. With the
// deadline, the lock is held only for as long as the (bounded) resolution sequence takes.
process.env.AUTH_PROVIDER_DEADLINE_MS = "3000";
const DEADLINE_MS = 3000;

let hh: TestHousehold | undefined;
let residentAccountId: string | undefined;
let injector: FaultInjectorHandle | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  injector?.restore();
  injector = undefined;
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
  residentAccountId = undefined;
});

describe("a lost provider request releases its locks within the deadline, not 300s (design.md D12)", () => {
  it("a concurrent signIn resolves within 6D + 10s while changeResidentEmail is holding the locks", async () => {
    hh = await registerTestHousehold();
    const PASSWORD = "test-password-not-real-1234";
    const profile = await createResidentProfile(hh.context, "LockRelease", {
      accountId: hh.accountId,
      profileId: null,
    });
    const claimed = await claimResidentProfile(hh.context, profile.id, PASSWORD, "de");
    residentAccountId = claimed.accountId;
    accountIds.push(residentAccountId);

    const signedIn = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "LockRelease",
      password: PASSWORD,
    });
    const current: CurrentSession = { context: signedIn.context, sessionId: signedIn.session.id };

    injector = injectProviderFault([
      { method: "PUT", path: /\/auth\/v1\/admin\/users\//, occurrence: "every", mode: "drop-before" },
    ]);

    const emailChangePromise = changeResidentEmail(current, testEmail()).catch((err) => err);

    // Wait until the PUT is actually in flight (seen) before starting the concurrent sign-in, so
    // this is a deterministic lock race, not a scheduling coincidence.
    const deadlineForSeen = Date.now() + 5000;
    while (injector.seen.filter((s) => s.method === "PUT").length === 0 && Date.now() < deadlineForSeen) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(injector.seen.filter((s) => s.method === "PUT").length).toBeGreaterThan(0);

    // The SAME account changeResidentEmail is holding the locks for — signIn's own
    // `membership FOR UPDATE` (then `account FOR SHARE`, before its session INSERT) waits on
    // changeResidentEmail's `membership FOR UPDATE`.
    const signInStartedAt = Date.now();
    const signInResult = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "LockRelease",
      password: PASSWORD,
    });
    const signInElapsedMs = Date.now() - signInStartedAt;

    expect(signInResult.context.accountId).toBe(residentAccountId);
    expect(signInElapsedMs).toBeLessThan(6 * DEADLINE_MS + 10000);
    // And it really waited on the held lock: changeResidentEmail cannot let go before its first,
    // dropped PUT has hit the deadline, so a signIn that returns sooner than that was never
    // blocked, and this test would no longer be testing lock release at all.
    expect(signInElapsedMs).toBeGreaterThanOrEqual(DEADLINE_MS - 1000);

    const emailChangeErr = await emailChangePromise;
    expect(emailChangeErr).toBeInstanceOf(AccountSettingsError);
    expect((emailChangeErr as AccountSettingsError).code).toBe("provider_unavailable");
  }, 60000);
});
