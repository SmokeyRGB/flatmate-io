import { afterEach, describe, expect, it } from "vitest";
import { SignInError, changeResidentEmail, claimResidentProfile, signIn } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

// registerTestHousehold's own password, and the one claimResidentProfile is given below.
const PASSWORD = "test-password-not-real-1234";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

// resident-settings (human decision 2026-09-24, walkthrough): the resident tab of sign-in accepts
// an email address as well as household + name. Choosing the tab is choosing the identity
// (ADR-013), so the resident-tab email path must land on a resident profile or refuse.
// Deliberate break: remove the `resident_email && !membershipRow.isResident` check in auth.ts's
// signIn, and the second test fails (the household address then opens a household session).
describe("signIn resident_email (identity/sign-in)", () => {
  it("a resident's own address on the resident tab signs in as that profile", async () => {
    hh = await registerTestHousehold();
    const profile = await createResidentProfile(hh.context, "TabEmail", {
      accountId: hh.accountId,
      profileId: null,
    });
    const { accountId } = await claimResidentProfile(hh.context, profile.id, PASSWORD);
    accountIds.push(accountId);
    await changeResidentEmail(
      {
        sessionId: "n/a", // unused by changeResidentEmail
        context: { accountId, householdId: hh.householdId, profileId: profile.id },
      },
      "tab-email@example.test",
    );

    const result = await signIn({ kind: "resident_email", email: "tab-email@example.test", password: PASSWORD });
    expect(result.context.profileId).toBe(profile.id);
    expect(result.context.accountId).toBe(accountId);
    expect(result.session.actingProfileId).toBe(profile.id);
  });

  it("the household account's address on the resident tab is refused like a wrong password", async () => {
    hh = await registerTestHousehold();

    const attempt = signIn({ kind: "resident_email", email: hh.email, password: PASSWORD });
    await expect(attempt).rejects.toBeInstanceOf(SignInError);
    await expect(attempt).rejects.toMatchObject({ code: "invalid_credentials" });

    // The same address and password still open the household session on the household tab.
    const household = await signIn({ kind: "household", email: hh.email, password: PASSWORD });
    expect(household.context.profileId).toBeNull();
  });
});
