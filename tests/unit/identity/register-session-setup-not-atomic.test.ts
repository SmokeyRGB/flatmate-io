import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withSessionContext } from "@/db/session-context";
import {
  account,
  household,
  householdSettings,
  joinCodeIssuance,
  membership,
} from "@/modules/identity/schema";
import { registerHousehold, signIn, undoRegisterHousehold } from "@/modules/identity/auth";
import { cleanupAll, cleanupHousehold, deleteTestAccount, testEmail } from "../../helpers/identity";

// speckit-bug-fix register-action-not-atomic-with-signin: registerHousehold commits the Auth
// user/Household/HouseholdSettings/Account/Membership before signIn ever runs. If signIn fails
// (here: hashSessionToken throws because SESSION_TOKEN_HASH_SECRET is unset), the household must
// be rolled back so a retry with the same email doesn't fail as a duplicate registration.
describe("register: compensating cleanup when session setup fails", () => {
  const originalSecret = process.env.SESSION_TOKEN_HASH_SECRET;
  const accountIds: string[] = [];

  afterEach(async () => {
    if (originalSecret === undefined) {
      delete process.env.SESSION_TOKEN_HASH_SECRET;
    } else {
      process.env.SESSION_TOKEN_HASH_SECRET = originalSecret;
    }
    await cleanupAll(...accountIds.map(deleteTestAccount));
    accountIds.length = 0;
  });

  it("reverts the registration and lets a retry with the same email succeed", async () => {
    const email = testEmail();
    const password = "test-password-not-real-1234";

    const registered = await registerHousehold(email, password, "Test-WG");
    const { context } = registered;

    delete process.env.SESSION_TOKEN_HASH_SECRET;
    await expect(signIn({ kind: "household", email, password })).rejects.toThrow();

    await undoRegisterHousehold(context, context.householdId, context.accountId);

    // Rolled back: no Household/HouseholdSettings/Account/Membership left for this id — and, since
    // join-code-protections (O-18), no founding join_code_issuance row either. That last one is not
    // hypothetical: the change shipped without it and left one orphan per failed registration,
    // found as two stray rows on flatmate-io-dev after a green suite. The schema has **no foreign
    // keys**, so deleting the household cascades to nothing.
    const [householdRows, settingsRows, accountRows, membershipRows, issuanceRows] = await withSessionContext(
      context,
      async (tx) => [
        await tx.select().from(household).where(eq(household.id, context.householdId)),
        await tx.select().from(householdSettings).where(eq(householdSettings.householdId, context.householdId)),
        await tx.select().from(account).where(eq(account.id, context.accountId)),
        await tx.select().from(membership).where(eq(membership.householdId, context.householdId)),
        await tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.householdId, context.householdId)),
      ],
    );
    expect(householdRows).toHaveLength(0);
    expect(settingsRows).toHaveLength(0);
    expect(accountRows).toHaveLength(0);
    expect(membershipRows).toHaveLength(0);
    expect(issuanceRows).toHaveLength(0);

    // Retry with the same email, this time with signIn able to succeed.
    process.env.SESSION_TOKEN_HASH_SECRET = originalSecret ?? "test-secret-for-register-retry";

    const retried = await registerHousehold(email, password, "Test-WG");
    accountIds.push(retried.context.accountId);
    expect(retried.household.contactEmail).toBe(email);

    const signInResult = await signIn({ kind: "household", email, password });
    expect(signInResult.context.householdId).toBe(retried.context.householdId);

    // Cleanup the successful retry's rows. Used to be an inline hand-copy of cleanup()'s delete
    // set — it drifted from the original twice (missed Session until 2026-09-18, missed
    // join_code_issuance again on 2026-09-22, despite a comment warning about the first drift).
    // M2 (P6) closes that: cleanupHousehold() shares HOUSEHOLD_SCOPED_TABLES with makeCleanup()
    // itself, so there is nothing left here to hand-copy or drift.
    await cleanupHousehold(retried.context, retried.context.householdId);
  });
});
