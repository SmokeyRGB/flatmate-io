import { and, eq, isNull, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile, deriveResidentEmail, signIn, SignInError } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { account, membership, session } from "@/modules/identity/schema";
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

const PASSWORD = "reset-new-password-123";

async function unrevokedSessionCountFor(hh: TestHousehold, accountId: string): Promise<number> {
  const rows = await withSessionContext(hh.context, (tx) =>
    tx
      .select()
      .from(session)
      .where(and(eq(session.accountId, accountId), isNull(session.revokedAt))),
  );
  return rows.length;
}

async function createProfile(
  hh: TestHousehold,
  actor: { accountId: string; profileId: string | null },
  name: string,
): Promise<{ profileId: string; accountId: string }> {
  const profile = await createResidentProfile(hh.context, name, actor);
  const { accountId } = await claimResidentProfile(hh.context, profile.id, PASSWORD);
  return { profileId: profile.id, accountId };
}

// Copilot review round 5 (PR #23), FIX 1: signIn used to check the password with Supabase
// (signInWithPassword) BEFORE taking the membership lock, with no serialization at all against a
// concurrent password writer (changeResidentPassword/redeemPasswordReset) — so a sign-in that
// authenticated with the OLD password just before a reset/change committed could still insert its
// session AFTER that reset/change had already revoked every other session, and that stale
// authentication would outlive it. Fixed with a credentials generation (account.password_changed_at,
// stamped in the DATABASE clock) that signIn now compares a pre-signInWithPassword clock read
// against, AFTER taking its own membership -> account lock.
describe("signIn refuses a credentials generation that changed during the attempt (Copilot review round 5, PR #23, FIX 1)", () => {
  it("blocks behind an uncommitted concurrent password-generation bump and then refuses with invalid_credentials", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createProfile(hh, actor, "GenerationRace");
    accountIds.push(profile.accountId);

    let releaseRawTx: () => void = () => {};
    const rawTxGate = new Promise<void>((resolve) => {
      releaseRawTx = resolve;
    });
    let markLockAcquired: () => void = () => {};
    const lockAcquired = new Promise<void>((resolve) => {
      markLockAcquired = resolve;
    });

    // Stand-in for a concurrent changeResidentPassword/redeemPasswordReset: takes the SAME
    // membership row lock signIn itself takes first (`FOR UPDATE`), holds it open uncommitted
    // WHILE signIn authenticates and blocks behind it, and only bumps
    // account.password_changed_at AFTER signIn has already read ITS OWN clock and completed
    // signInWithPassword (see the timing below) — exactly the scenario CLAUDE.md/the review
    // finding describes: "a password change that committed after the authentication". Bumping the
    // stamp any earlier (before signIn's own clock read) would not reproduce the race at all.
    //
    // `clock_timestamp()`, deliberately NOT `now()`: plain `now()` is fixed at THIS transaction's
    // own START (well before the 1.5s wait below), not at the instant this UPDATE actually runs —
    // using it here reproduced exactly the bug auth.ts's own writers had to avoid (see
    // changeResidentPassword's comment in auth.ts): the stamp would read as OLDER than signIn's
    // clock read even though the real, visible write happens well after it, and the race this test
    // means to exercise would go uncaught. `clock_timestamp()` matches auth.ts's own writers.
    const rawTxPromise = withSessionContext(hh.context, async (tx) => {
      await tx.select().from(membership).where(eq(membership.accountId, profile.accountId)).for("update");
      markLockAcquired();
      await rawTxGate;
      // Still holding the membership lock, signIn (below) is now blocked behind it, well after its
      // own `readDatabaseClock()` read and its `signInWithPassword` call have both already run.
      await tx
        .update(account)
        .set({ passwordChangedAt: sql`clock_timestamp()` })
        .where(eq(account.id, profile.accountId));
    });

    // Wait for the raw transaction to actually acquire the membership row lock before starting
    // signIn — otherwise signIn could race ahead of it, not just its commit.
    await lockAcquired;

    // Start signIn concurrently; deliberately not awaited yet. signIn reads its own clock, then
    // authenticates against Supabase (the password is still the real, current one — nothing about
    // THAT is racing), then reaches its own membership `.for("update")` SELECT, which must block
    // behind the raw transaction's row lock.
    const signInPromise = signIn({
      kind: "household",
      email: deriveResidentEmail(profile.profileId),
      password: PASSWORD,
    }).then(
      (result) => ({ ok: true as const, result }),
      (err) => ({ ok: false as const, err }),
    );

    // A generous window for signIn's own `readDatabaseClock()` read and its `signInWithPassword`
    // round trip to both complete, and for its membership `SELECT ... FOR UPDATE` to reach the
    // database and start waiting on the raw transaction's lock — all of this must happen BEFORE
    // the raw transaction (still gated on `rawTxGate`) bumps the generation, or the bump would
    // predate signIn's own clock read instead of following it.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    releaseRawTx();
    await rawTxPromise;

    const outcome = await signInPromise;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.err).toBeInstanceOf(SignInError);
      expect((outcome.err as SignInError).code).toBe("invalid_credentials");
    }
    expect(await unrevokedSessionCountFor(hh, profile.accountId)).toBe(0);
  });

  // Control: an ordinary sign-in, well AFTER an earlier password-generation bump has already
  // committed (not concurrently with this attempt's own clock read), must still succeed — the
  // check only refuses a generation at or after the read THIS attempt took, never a stale one.
  it("still allows a normal sign-in after an earlier, already-committed password change", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createProfile(hh, actor, "GenerationControl");
    accountIds.push(profile.accountId);

    await withSessionContext(hh.context, async (tx) => {
      await tx
        .update(account)
        .set({ passwordChangedAt: new Date(Date.now() - 60_000) })
        .where(eq(account.id, profile.accountId));
    });

    const result = await signIn({
      kind: "household",
      email: deriveResidentEmail(profile.profileId),
      password: PASSWORD,
    });
    expect(result.session).toBeDefined();
    expect(result.context.accountId).toBe(profile.accountId);
  });
});
