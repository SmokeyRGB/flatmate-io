import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile, signIn } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { account } from "@/modules/identity/schema";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

const PASSWORD = "test-password-not-real-1234";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

// resident-settings design.md Decision 1: "the provider is the authority for its own sign-in
// identifier". A resident who joined with an email BEFORE this change has `account.email` set but
// their Supabase Auth user still on its DERIVED address (proposal Assumption 6: existing accounts
// are not migrated) — signIn's name path must ask the PROVIDER for the account's current address
// (auth.admin.getUserById), never rebuild it as `account.email ?? deriveResidentEmail(profileId)`.
// That fallback would look correct for a BRAND NEW resident (both sides agree), but fails exactly
// this legacy case: it would try to sign in against `account.email`, an address Supabase Auth has
// never heard of, while the real Auth address is still the derived one.
describe("signIn's name path asks the provider for its current address (D1)", () => {
  it("a resident who joined with an email before this change still signs in by name", async () => {
    hh = await registerTestHousehold();
    const profile = await createResidentProfile(hh.context, "LegacyEmailResident", {
      accountId: hh.accountId,
      profileId: null,
    });
    const { accountId } = await claimResidentProfile(hh.context, profile.id, PASSWORD);
    accountIds.push(accountId);

    // Simulate the pre-change state directly (never through changeResidentEmail, so the Auth user
    // is left untouched, still on its derived address) — the exact divergence D1's own comment
    // names as the reason `account.email ?? derived` is unsafe.
    await withSessionContext(hh.context, (tx) =>
      tx.update(account).set({ email: "legacy@example.test" }).where(eq(account.id, accountId)),
    );

    const result = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "LegacyEmailResident",
      password: PASSWORD,
    });
    expect(result.context.accountId).toBe(accountId);
    expect(result.context.profileId).toBe(profile.id);
  });
});
