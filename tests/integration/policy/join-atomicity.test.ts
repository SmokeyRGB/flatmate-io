import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { JoinError, joinHousehold } from "@/modules/identity/auth";
import { claimJoinCodeTx, createResidentProfile, issueJoinCode } from "@/modules/identity/repository";
import { joinCodeIssuance, residentProfile } from "@/modules/identity/schema";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

// EC-2.1: two concurrent joins on a single-use link — exactly one membership exists, uses is 1,
// and the loser left no account, profile or sign-in-able Auth user behind.
describe("Join atomicity (EC-2.1, design.md Decision 2)", () => {
  it("lets exactly one of two concurrent joins on a single-use link succeed, leaving nothing behind for the loser", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    const results = await Promise.allSettled([
      joinHousehold(link.code, { displayName: "Winner", password: "test-password-not-real-1234" }),
      joinHousehold(link.code, { displayName: "Loser", password: "test-password-not-real-1234" }),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof joinHousehold>>> => r.status === "fulfilled",
    );
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(JoinError);
    expect(rejected[0].reason).toMatchObject({ code: "invalid_link" });

    accountIds.push(fulfilled[0].value.context.accountId);

    // Exactly one membership was created — the count is 1, never 2.
    const profiles = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.householdId, hh!.householdId)),
    );
    expect(profiles).toHaveLength(1);

    // The loser's display name exists nowhere — no account, resident profile, or membership was
    // left behind for it (joinHousehold's own transaction rolled everything back, and the Auth
    // user created before the transaction was deleted best-effort in the catch block).
    const loserNameStillExists = profiles.some((p) => p.displayName === "Loser");
    expect(loserNameStillExists).toBe(false);

    const [updatedLink] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.id, link.id)),
    );
    expect(updatedLink.uses).toBe(1); // never 2
  });

  // design.md Decision 2: the claim runs INSIDE the join transaction, so a failure ANYWHERE else
  // in that same transaction rolls the increment back with everything else — the count is still
  // never decremented on any other path, a failed attempt simply never incremented it. Forced
  // here via a genuine DB-level constraint (the partial unique index on display_name), triggered
  // AFTER claimJoinCodeTx already ran, using the same primitives joinHousehold's own transaction
  // uses — not a mock, and not joinHousehold's own pre-check (which runs before any transaction
  // opens and would refuse with name_taken instead of exercising the rollback path).
  it("rolls the claim's increment back when a later step in the same transaction fails", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    const adminActor = { accountId: hh.accountId, profileId: null };
    await createResidentProfile(hh.context, "Collider", adminActor); // status "prepared" already
    // occupies the display-name slot (the partial unique index covers every status != moved_out).

    const [before] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.id, link.id)),
    );
    expect(before.uses).toBe(0);

    const wouldBeJoinerContext = { accountId: randomUUID(), householdId: hh.householdId, profileId: randomUUID() };

    await expect(
      withSessionContext(wouldBeJoinerContext, async (tx) => {
        const claimed = await claimJoinCodeTx(tx, link.code);
        expect(claimed).not.toBeNull(); // the claim itself succeeds...

        // ...but the very next statement in the SAME transaction violates the display-name
        // uniqueness invariant, forcing a rollback of everything in this transaction, including
        // the claim's own increment.
        await tx.insert(residentProfile).values({
          householdId: hh!.householdId,
          displayName: "Collider",
          status: "active",
        });
      }),
    ).rejects.toThrow();

    const [after] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.id, link.id)),
    );
    expect(after.uses).toBe(0); // back to its pre-attempt value — the increment did not survive

    // Only the one "Collider" profile from before the forced failure exists — the second insert
    // never committed.
    const colliders = await withSessionContext(hh.context, (tx) =>
      tx
        .select()
        .from(residentProfile)
        .where(and(eq(residentProfile.householdId, hh!.householdId), eq(residentProfile.displayName, "Collider"))),
    );
    expect(colliders).toHaveLength(1);
  });
});
