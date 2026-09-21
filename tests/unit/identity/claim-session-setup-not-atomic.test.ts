import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { withSessionContext } from "@/db/session-context";
import { account, membership, residentProfile } from "@/modules/identity/schema";
import { createResidentProfile } from "@/modules/identity/repository";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

// claimResidentProfileAction pulls in session-cookie.ts (server-only + next/headers) and
// next/navigation via its import chain, mirroring claim-resident-profile-validation.test.ts.
vi.mock("server-only", () => ({}));
const cookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
// The real redirect() interrupts execution by throwing (Next's own render-interrupt mechanism);
// a no-op mock would let the action fall through past it and return `undefined` instead of the
// declared ClaimFormState, so the success path below must expect this throw too.
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

const { claimResidentProfileAction } = await import("@/app/(auth)/claim/actions");

// speckit-bug-fix claim-action-not-atomic-with-session-setup: claimResidentProfile commits the
// Auth user/Account/Membership/status:"active" before signIn ever runs. If signIn fails (here:
// hashSessionToken throws because SESSION_TOKEN_HASH_SECRET is unset — a plain Error, not a
// SignInError, previously uncaught by the action), the profile must be rolled back to `prepared`
// so the resident isn't left permanently stuck, and a retry must succeed.
describe("claim action: compensating cleanup when session setup fails", () => {
  const originalSecret = process.env.SESSION_TOKEN_HASH_SECRET;
  let hh: TestHousehold | undefined;
  const accountIds: string[] = [];

  afterEach(async () => {
    if (originalSecret === undefined) {
      delete process.env.SESSION_TOKEN_HASH_SECRET;
    } else {
      process.env.SESSION_TOKEN_HASH_SECRET = originalSecret;
    }
    await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
    accountIds.length = 0;
    hh = undefined;
  });

  it("reverts the claim and lets a retry succeed", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "Stuck-Claimant", actor);

    delete process.env.SESSION_TOKEN_HASH_SECRET;

    const formData = new FormData();
    formData.set("householdId", hh.householdId);
    formData.set("displayName", "Stuck-Claimant");
    formData.set("password", "test-password-not-real-1234");

    const result = await claimResidentProfileAction({ error: null }, formData);
    expect(result.error).toBeTruthy();

    // Rolled back: the profile is claimable again, and no orphaned Membership/Account remain.
    const rolledBack = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.id, profile.id)),
    );
    expect(rolledBack[0]?.status).toBe("prepared");

    const orphanedMembership = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.residentProfileId, profile.id)),
    );
    expect(orphanedMembership).toHaveLength(0);

    // Retry, this time with signIn able to succeed.
    process.env.SESSION_TOKEN_HASH_SECRET = originalSecret ?? "test-secret-for-claim-retry";

    const retryFormData = new FormData();
    retryFormData.set("householdId", hh.householdId);
    retryFormData.set("displayName", "Stuck-Claimant");
    retryFormData.set("password", "test-password-not-real-1234");

    await expect(claimResidentProfileAction({ error: null }, retryFormData)).rejects.toThrow("REDIRECT");
    expect(cookieStore.set).toHaveBeenCalled();

    const finalProfile = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.id, profile.id)),
    );
    expect(finalProfile[0]?.status).toBe("active");

    const finalMembership = await withSessionContext(hh.context, (tx) =>
      tx
        .select()
        .from(membership)
        .where(and(eq(membership.residentProfileId, profile.id), eq(membership.isResident, true))),
    );
    expect(finalMembership).toHaveLength(1);
    accountIds.push(finalMembership[0]!.accountId);

    const accountRows = await withSessionContext(hh.context, (tx) =>
      tx.select().from(account).where(eq(account.id, finalMembership[0]!.accountId)),
    );
    expect(accountRows).toHaveLength(1);
  });
});
