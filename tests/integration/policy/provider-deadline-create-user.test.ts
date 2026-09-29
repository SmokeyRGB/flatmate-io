import { afterEach, describe, expect, it } from "vitest";
import { JoinError, RegistrationError, joinHousehold, registerHousehold } from "@/modules/identity/auth";
import { createResidentProfile, issueJoinCode, listJoinCodeIssuances } from "@/modules/identity/repository";
import {
  adminClient,
  cleanupAll,
  cleanupHousehold,
  deleteTestAccount,
  registerTestHousehold,
  testEmail,
  type TestHousehold,
} from "../../helpers/identity";
import { injectProviderFault, type FaultInjectorHandle } from "../../helpers/provider-fault";

// auth-provider-deadline design.md D5 / tasks.md 4.2: a lost `createUser` answer must leave no
// account behind and must not block the address for a retry. AUTH_PROVIDER_DEADLINE_MS=3000 (D12)
// — above dev's observed 1.3s, well inside the 60s test timeout.
process.env.AUTH_PROVIDER_DEADLINE_MS = "3000";

const PASSWORD = "test-password-not-real-1234";

let hh: TestHousehold | undefined;
let injector: FaultInjectorHandle | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  // Teardown deletes by seen[].body.id (tasks.md 4.2) — captured BEFORE restore()/undef, and
  // tolerant of a 404 (deleteTestAccount), so an id already cleaned up by the code under test is a
  // harmless no-op here.
  const seenIds = injector?.seen
    .map((s) => (s.body as { id?: string } | null)?.id)
    .filter((id): id is string => Boolean(id));
  injector?.restore();
  injector = undefined;
  await cleanupAll(...accountIds.map(deleteTestAccount), ...(seenIds ?? []).map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

describe("a lost createUser answer leaves no account behind (design.md D5)", () => {
  it("joinHousehold, neutral link: signup_failed, no orphan, link unspent, retry succeeds", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    const email = testEmail();

    injector = injectProviderFault([
      { method: "POST", path: /\/auth\/v1\/admin\/users$/, occurrence: 1, mode: "forward-then-drop" },
    ]);

    let caught: unknown;
    try {
      await joinHousehold(link.code, { displayName: "LostJoiner", password: PASSWORD, email });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(JoinError);
    expect((caught as JoinError).code).toBe("signup_failed");

    const createRequests = injector.seen.filter(
      (s) => s.method === "POST" && /\/auth\/v1\/admin\/users$/.test(new URL(s.url).pathname),
    );
    expect(createRequests).toHaveLength(1);
    const createdId = (createRequests[0].body as { id: string }).id;
    expect(createdId).toBeTruthy();

    // Give the forward its own time to actually land at GoTrue and the compensating delete time to
    // run — both already awaited inside joinHousehold's own createUser handling, but the fault
    // injector's forward is a separate, un-awaited-by-the-caller promise (D12) that this test
    // should not race.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const { data, error } = await adminClient().auth.admin.getUserById(createdId);
    expect(data.user).toBeNull();
    expect(error).toBeTruthy();

    const issuances = await listJoinCodeIssuances(hh.context, hh.accountId);
    const row = issuances.find((i) => i.id === link.id);
    expect(row?.uses).toBe(0);

    injector.restore();
    injector = undefined;

    const retry = await joinHousehold(link.code, { displayName: "LostJoiner", password: PASSWORD, email });
    accountIds.push(retry.context.accountId);
  });

  it("joinHousehold, bound link: retry is not email_taken", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const prepared = await createResidentProfile(hh.context, "BoundLostJoiner", adminActor);
    const link = await issueJoinCode(hh.context, hh.accountId, {
      validDays: 7,
      maxUses: 1,
      residentProfileId: prepared.id,
    });

    injector = injectProviderFault([
      { method: "POST", path: /\/auth\/v1\/admin\/users$/, occurrence: 1, mode: "forward-then-drop" },
    ]);

    let caught: unknown;
    try {
      await joinHousehold(link.code, { password: PASSWORD });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(JoinError);
    expect((caught as JoinError).code).toBe("signup_failed");

    await new Promise((resolve) => setTimeout(resolve, 500));
    injector.restore();
    injector = undefined;

    // The bound link is single-use and was never claimed (the transaction never ran) — so it
    // still works, and the retry must not fail as email_taken (the derived address must be free).
    const retry = await joinHousehold(link.code, { password: PASSWORD });
    accountIds.push(retry.context.accountId);
    expect(retry.context.profileId).toBe(prepared.id);
  });

  it("registerHousehold: signup_failed, no orphan, retry with the same address succeeds", async () => {
    const email = testEmail();

    injector = injectProviderFault([
      { method: "POST", path: /\/auth\/v1\/admin\/users$/, occurrence: 1, mode: "forward-then-drop" },
    ]);

    let caught: unknown;
    try {
      await registerHousehold(email, PASSWORD, "Lost Household");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RegistrationError);
    expect((caught as RegistrationError).code).toBe("signup_failed");

    const createRequests = injector.seen.filter(
      (s) => s.method === "POST" && /\/auth\/v1\/admin\/users$/.test(new URL(s.url).pathname),
    );
    expect(createRequests).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 500));
    injector.restore();
    injector = undefined;

    const retry = await registerHousehold(email, PASSWORD, "Retried Household");
    hh = {
      context: retry.context,
      accountId: retry.context.accountId,
      householdId: retry.household.id,
      email,
      cleanup: async () => {
        await cleanupHousehold(retry.context, retry.household.id);
        await deleteTestAccount(retry.context.accountId);
      },
    };
  });
});
