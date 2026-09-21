import { afterEach, describe, expect, it } from "vitest";
import { SignInError, claimResidentProfile, signIn } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

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
});
