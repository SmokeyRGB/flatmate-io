import { afterEach, describe, expect, it } from "vitest";
import { SignInError, claimResidentProfile, signIn } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";
import { injectProviderFault } from "../../helpers/provider-fault";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

// german-ui-vocabulary (design.md Decision 5 / proposal.md Assumption 6, tasks.md 2.2/5.3): a
// resident sign-in that fails because no such display name exists in the household must be
// indistinguishable, to the caller, from one that fails because the password is wrong — otherwise
// an unauthenticated visitor can enumerate display names by watching which SignInError comes
// back. Both must resolve to the same code, since the action displays text keyed on `code`, not
// `message` — without this test the enumeration regresses the first time someone "improves" one
// of the two messages back apart.
describe("signIn resident-mode: no-such-resident vs wrong-password enumeration", () => {
  it("returns the same SignInError code for an unknown display name and for a wrong password", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const profile = await createResidentProfile(hh.context, "Enumeration-Target", actor);
    const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
    accountIds.push(accountId);

    const unknownNameError: SignInError = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "Nobody-With-This-Name",
      password: "irrelevant-password",
    }).catch((err) => err);

    const wrongPasswordError: SignInError = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "Enumeration-Target",
      password: "definitely-the-wrong-password",
    }).catch((err) => err);

    expect(unknownNameError).toBeInstanceOf(SignInError);
    expect(wrongPasswordError).toBeInstanceOf(SignInError);
    expect(unknownNameError.code).toBe("invalid_credentials");
    expect(wrongPasswordError.code).toBe("invalid_credentials");
  });

  // auth-provider-deadline design.md D11 (tasks.md 5.3's call-parity assertion, extended into this
  // file per that task): not just the SAME code, but the SAME NUMBER AND KIND of provider requests
  // — otherwise the provider's own traffic (visible to anyone who can watch it, or its timing)
  // would still leak whether the name exists, message notwithstanding.
  it("sends the identity provider the same requests for an unknown name and a known name with a wrong password", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "Parity-Target", actor);
    const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
    accountIds.push(accountId);

    function pathTemplate(url: string): string {
      return new URL(url).pathname.replace(
        /\/admin\/users\/[0-9a-f-]{36}/,
        "/admin/users/:id",
      );
    }

    const injectorA = injectProviderFault([{ method: "GET", path: /.*/, mode: "record" }, { method: "POST", path: /.*/, mode: "record" }]);
    await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "Nobody-With-This-Name-Either",
      password: "irrelevant-password",
    }).catch(() => {});
    const requestsA = injectorA.seen.map((s) => `${s.method} ${pathTemplate(s.url)}`);
    injectorA.restore();

    const injectorB = injectProviderFault([{ method: "GET", path: /.*/, mode: "record" }, { method: "POST", path: /.*/, mode: "record" }]);
    await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "Parity-Target",
      password: "definitely-the-wrong-password",
    }).catch(() => {});
    const requestsB = injectorB.seen.map((s) => `${s.method} ${pathTemplate(s.url)}`);
    injectorB.restore();

    expect(requestsA).toEqual(["GET /auth/v1/admin/users/:id", "POST /auth/v1/token"]);
    expect(requestsB).toEqual(requestsA);
  });
});
