import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withSessionContext } from "@/db/session-context";
import { joinHousehold } from "@/modules/identity/auth";
import { createResidentProfile, issueJoinCode } from "@/modules/identity/repository";
import { account, joinCodeIssuance, membership, residentProfile } from "@/modules/identity/schema";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// join-by-link design.md Decision 13: `/claim` (and with it `claimResidentProfileAction`) is
// deleted. G-D1: this file is REWRITTEN, not deleted — the concern it protected ("a resident must
// never be left permanently stuck if session setup fails partway through") still exists, and the
// redesign actually STRENGTHENS the guarantee rather than merely relocating it: the old `/claim`
// route ran claimResidentProfile's own transaction FIRST, then a SEPARATE signIn call afterward,
// so a signIn failure needed a hand-written compensating undo (undoClaimResidentProfile, now
// deleted) to walk the claim back. joinHousehold's bound branch instead runs the claim, the
// profile activation, the account, the membership AND the session insert inside ONE transaction
// (design.md Decision 1) — so forcing the session-insert step to fail now rolls back the WHOLE
// transaction natively, with no hand-written undo required at all. This test asserts exactly
// that: the profile is never left "active" with nobody able to sign in as it.
describe("A bound join whose session setup fails leaves the profile prepared, not stuck", () => {
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

  it("rolls back the whole transaction and lets a retry succeed", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const prepared = await createResidentProfile(hh.context, "Stuck-Claimant", adminActor);
    const link = await issueJoinCode(hh.context, hh.accountId, {
      validDays: 7,
      maxUses: 1,
      residentProfileId: prepared.id,
    });

    // insertSessionTx (auth.ts) calls hashSessionToken, which throws when this is unset — and it
    // runs INSIDE joinHousehold's single transaction, AFTER claimJoinCodeTx has already
    // incremented the link's use count and AFTER the profile has already been marked active in
    // that same, still-open transaction.
    delete process.env.SESSION_TOKEN_HASH_SECRET;

    await expect(
      joinHousehold(link.code, { password: "test-password-not-real-1234" }),
    ).rejects.toThrow();

    // Rolled back in full: the profile is prepared again (never left stuck "active" with a
    // password nobody can use), no membership/account exist for it, and the link's use count is
    // back to what it was before the attempt — the whole point of running the claim INSIDE the
    // transaction (design.md Decision 2) rather than as a standalone statement beforehand.
    const [rolledBackProfile] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.id, prepared.id)),
    );
    expect(rolledBackProfile.status).toBe("prepared");
    expect(rolledBackProfile.movedInOn).toBeNull();

    const orphanedMembership = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.residentProfileId, prepared.id)),
    );
    expect(orphanedMembership).toHaveLength(0);

    const [rolledBackLink] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.id, link.id)),
    );
    expect(rolledBackLink.uses).toBe(0);

    // Retry, this time with a working secret — the SAME link (still unused) claims the SAME
    // profile.
    process.env.SESSION_TOKEN_HASH_SECRET = originalSecret ?? "test-secret-for-claim-retry";

    const result = await joinHousehold(link.code, { password: "test-password-not-real-1234" });
    accountIds.push(result.context.accountId);
    expect(result.context.profileId).toBe(prepared.id);

    const [finalProfile] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.id, prepared.id)),
    );
    expect(finalProfile.status).toBe("active");

    const [finalMembership] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.residentProfileId, prepared.id)),
    );
    expect(finalMembership.isResident).toBe(true);

    const [finalAccount] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(account).where(eq(account.id, finalMembership.accountId)),
    );
    expect(finalAccount).toBeTruthy();

    const [finalLink] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.id, link.id)),
    );
    expect(finalLink.uses).toBe(1);
  });
});
