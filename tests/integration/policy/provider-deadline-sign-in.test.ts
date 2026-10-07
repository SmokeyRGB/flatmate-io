import { and, eq, isNull } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { SignInError, claimResidentProfile, signIn } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { session } from "@/modules/identity/schema";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";
import { injectProviderFault, type FaultInjectorHandle } from "../../helpers/provider-fault";

// auth-provider-deadline design.md D3/D9/D11 / tasks.md 5.3. AUTH_PROVIDER_DEADLINE_MS=3000 (D12).
process.env.AUTH_PROVIDER_DEADLINE_MS = "3000";

const PASSWORD = "test-password-not-real-1234";

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

async function countSessionsFor(accountId: string): Promise<number> {
  const context = { accountId, householdId: hh!.householdId, profileId: null };
  const rows = await withSessionContext(context, (tx) =>
    tx.select().from(session).where(and(eq(session.accountId, accountId), isNull(session.revokedAt))),
  );
  return rows.length;
}

describe("a sign-in that cannot reach the provider says so (design.md D3/D9/D11)", () => {
  it("drop-before every /token: provider_unavailable for email and name sign-in, no session inserted", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "TokenLost", actor);
    const claimed = await claimResidentProfile(hh.context, profile.id, PASSWORD, "de");
    residentAccountId = claimed.accountId;
    accountIds.push(residentAccountId);

    injector = injectProviderFault([
      { method: "POST", path: /\/auth\/v1\/token$/, occurrence: "every", mode: "drop-before" },
    ]);

    const emailErr: unknown = await signIn({ kind: "household", email: hh.email, password: PASSWORD }).catch(
      (e) => e,
    );
    expect(emailErr).toBeInstanceOf(SignInError);
    expect((emailErr as SignInError).code).toBe("provider_unavailable");

    const nameErr: unknown = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "TokenLost",
      password: PASSWORD,
    }).catch((e) => e);
    expect(nameErr).toBeInstanceOf(SignInError);
    expect((nameErr as SignInError).code).toBe("provider_unavailable");

    injector.restore();
    injector = undefined;
    expect(await countSessionsFor(residentAccountId)).toBe(0);
  });

  it("name path, known name: drop-before every GET /admin/users/ gives provider_unavailable", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "LookupLost", actor);
    const claimed = await claimResidentProfile(hh.context, profile.id, PASSWORD, "de");
    residentAccountId = claimed.accountId;
    accountIds.push(residentAccountId);

    injector = injectProviderFault([
      { method: "GET", path: /\/auth\/v1\/admin\/users\//, occurrence: "every", mode: "drop-before" },
    ]);

    const err: unknown = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "LookupLost",
      password: PASSWORD,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SignInError);
    expect((err as SignInError).code).toBe("provider_unavailable");
  });

  it("name path, unknown name: the same fault gives the same provider_unavailable", async () => {
    hh = await registerTestHousehold();

    injector = injectProviderFault([
      { method: "GET", path: /\/auth\/v1\/admin\/users\//, occurrence: "every", mode: "drop-before" },
    ]);

    const err: unknown = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "Nobody-Here",
      password: PASSWORD,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SignInError);
    expect((err as SignInError).code).toBe("provider_unavailable");
  });

  it("drop-before occurrence 1 of /token only: a normal sign-in, 2 token requests in seen", async () => {
    hh = await registerTestHousehold();

    injector = injectProviderFault([
      { method: "POST", path: /\/auth\/v1\/token$/, occurrence: 1, mode: "drop-before" },
    ]);

    const result = await signIn({ kind: "household", email: hh.email, password: PASSWORD });
    expect(result.context.accountId).toBe(hh.accountId);

    const tokenRequests = injector.seen.filter((s) => s.method === "POST" && /\/token$/.test(new URL(s.url).pathname));
    expect(tokenRequests).toHaveLength(2);
  });

  it("wrong password, no fault: invalid_credentials", async () => {
    hh = await registerTestHousehold();

    const err: unknown = await signIn({
      kind: "household",
      email: hh.email,
      password: "definitely-the-wrong-password",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SignInError);
    expect((err as SignInError).code).toBe("invalid_credentials");
  });

  it("call parity: unknown name, known name + wrong password, known name + deleted Auth user all give invalid_credentials with identical seen requests", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "ParityKnown", actor);
    const claimed = await claimResidentProfile(hh.context, profile.id, PASSWORD, "de");
    residentAccountId = claimed.accountId;
    // Deliberately deleted below for case (c) — not pushed to accountIds (nothing to clean up
    // afterwards; the delete IS the test's own setup for that case).

    function pathTemplate(url: string): string {
      return new URL(url).pathname.replace(/\/admin\/users\/[0-9a-f-]{36}/, "/admin/users/:id");
    }

    async function seenFor(run: () => Promise<unknown>): Promise<string[]> {
      const inj = injectProviderFault([
        { method: "GET", path: /.*/, mode: "record" },
        { method: "POST", path: /.*/, mode: "record" },
      ]);
      const err = await run().catch((e) => e);
      expect(err).toBeInstanceOf(SignInError);
      expect((err as SignInError).code).toBe("invalid_credentials");
      const seen = inj.seen.map((s) => `${s.method} ${pathTemplate(s.url)}`);
      inj.restore();
      return seen;
    }

    const seenA = await seenFor(() =>
      signIn({
        kind: "resident",
        householdId: hh!.householdId,
        displayName: "Nobody-For-Parity",
        password: "irrelevant",
      }),
    );

    const seenB = await seenFor(() =>
      signIn({
        kind: "resident",
        householdId: hh!.householdId,
        displayName: "ParityKnown",
        password: "definitely-the-wrong-password",
      }),
    );

    // (c): the known profile's Auth user is deleted, so its lookup is refused (404) exactly like an
    // unresolved name's throwaway lookup.
    const { adminClient } = await import("../../helpers/identity");
    await adminClient().auth.admin.deleteUser(residentAccountId!);
    const seenC = await seenFor(() =>
      signIn({
        kind: "resident",
        householdId: hh!.householdId,
        displayName: "ParityKnown",
        password: PASSWORD,
      }),
    );

    const expected = ["GET /auth/v1/admin/users/:id", "POST /auth/v1/token"];
    expect(seenA).toEqual(expected);
    expect(seenB).toEqual(expected);
    expect(seenC).toEqual(expected);
  });
});
