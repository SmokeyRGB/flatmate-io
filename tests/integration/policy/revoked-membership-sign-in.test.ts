import { and, eq, isNull } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile, deriveResidentEmail, signIn, SignInError } from "@/modules/identity/auth";
import {
  createResidentProfile,
  reactivateMember,
  removeMember,
  setMovedOut,
} from "@/modules/identity/repository";
import { membership, session } from "@/modules/identity/schema";
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

async function sessionCountFor(hh: TestHousehold, accountId: string): Promise<number> {
  const rows = await withSessionContext(hh.context, (tx) =>
    tx.select().from(session).where(eq(session.accountId, accountId)),
  );
  return rows.length;
}

async function unrevokedSessionCountFor(hh: TestHousehold, accountId: string): Promise<number> {
  const rows = await withSessionContext(hh.context, (tx) =>
    tx
      .select()
      .from(session)
      .where(and(eq(session.accountId, accountId), isNull(session.revokedAt))),
  );
  return rows.length;
}

const PASSWORD = "test-password-not-real-1234";

// design.md Decision 6 (V-3 "sofortiger Zugriffsentzug"): a revoked membership must refuse a NEW
// session too, not just leave a pre-existing one revoked. Two entry paths to the same account are
// tested — the "email branch" (kind: "household" with the resident's own DERIVED address, the
// loophole the proposal names: "anyone holding the derived address ... and the password gets a
// fresh session") and the ordinary "display name" branch (kind: "resident").
describe("A revoked membership cannot open a new session (V-3, design.md Decision 6)", () => {
  it("refuses a moved-out member via the email branch, with invalid_credentials and no new session", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createProfile(hh, actor, "MovedOutEmailBranch");
    accountIds.push(profile.accountId);
    await setMovedOut(hh.context, hh.accountId, profile.accountId);

    const before = await sessionCountFor(hh, profile.accountId);
    let caught: unknown;
    try {
      await signIn({ kind: "household", email: deriveResidentEmail(profile.profileId), password: PASSWORD });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SignInError);
    expect((caught as SignInError).code).toBe("invalid_credentials");
    expect(await sessionCountFor(hh, profile.accountId)).toBe(before);
  });

  it("refuses a removed member via the email branch, with invalid_credentials and no new session", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createProfile(hh, actor, "RemovedEmailBranch");
    accountIds.push(profile.accountId);
    await removeMember(hh.context, hh.accountId, profile.accountId, "RemovedEmailBranch");

    const before = await sessionCountFor(hh, profile.accountId);
    let caught: unknown;
    try {
      await signIn({ kind: "household", email: deriveResidentEmail(profile.profileId), password: PASSWORD });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SignInError);
    expect((caught as SignInError).code).toBe("invalid_credentials");
    expect(await sessionCountFor(hh, profile.accountId)).toBe(before);
  });

  it("refuses a moved-out member via the display-name branch too", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createProfile(hh, actor, "MovedOutNameBranch");
    accountIds.push(profile.accountId);
    await setMovedOut(hh.context, hh.accountId, profile.accountId);

    const before = await sessionCountFor(hh, profile.accountId);
    let caught: unknown;
    try {
      await signIn({
        kind: "resident",
        householdId: hh.householdId,
        displayName: "MovedOutNameBranch",
        password: PASSWORD,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SignInError);
    expect((caught as SignInError).code).toBe("invalid_credentials");
    expect(await sessionCountFor(hh, profile.accountId)).toBe(before);
  });

  it("refuses a removed member via the display-name branch too", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createProfile(hh, actor, "RemovedNameBranch");
    accountIds.push(profile.accountId);
    await removeMember(hh.context, hh.accountId, profile.accountId, "RemovedNameBranch");

    const before = await sessionCountFor(hh, profile.accountId);
    let caught: unknown;
    try {
      await signIn({
        kind: "resident",
        householdId: hh.householdId,
        displayName: "RemovedNameBranch",
        password: PASSWORD,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SignInError);
    expect((caught as SignInError).code).toBe("invalid_credentials");
    expect(await sessionCountFor(hh, profile.accountId)).toBe(before);
  });

  it("a reactivated member signs in normally again", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createProfile(hh, actor, "BackAgain");
    accountIds.push(profile.accountId);
    await setMovedOut(hh.context, hh.accountId, profile.accountId);
    await reactivateMember(hh.context, hh.accountId, profile.accountId);

    const result = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "BackAgain",
      password: PASSWORD,
    });
    expect(result.session).toBeDefined();
    expect(result.context.accountId).toBe(profile.accountId);
  });
});

async function createProfile(
  hh: TestHousehold,
  actor: { accountId: string; profileId: string | null },
  name: string,
): Promise<{ profileId: string; accountId: string }> {
  const profile = await createResidentProfile(hh.context, name, actor);
  const { accountId } = await claimResidentProfile(hh.context, profile.id, PASSWORD);
  return { profileId: profile.id, accountId };
}

// Copilot review fix (PR #18): signIn used to SELECT the membership row, check revokedAt, THEN
// insert a session — with no lock in between. A removal (revokeMembershipForProfileTx,
// repository.ts) committing in that gap revokes the membership and scans sessions for ones to
// revoke BEFORE the new session this signIn is about to insert exists, so the new session survives
// a removal that raced it. auth.ts's signIn now takes `.for("update")` on that same SELECT, so it
// either observes the already-committed revocation or blocks until the concurrent removal commits
// and then re-reads it.
//
// This test builds the race directly: a raw transaction (this test's own stand-in for
// revokeMembershipForProfileTx's UPDATE) is opened and left UNCOMMITTED while a concurrent signIn
// is started — signIn must not be able to complete with a stale, pre-revocation view of the row.
describe("signIn's membership check does not race a concurrent revocation (Copilot review fix)", () => {
  it("blocks behind an uncommitted concurrent revocation and then refuses with invalid_credentials", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createProfile(hh, actor, "RaceRevocation");
    accountIds.push(profile.accountId);

    let releaseRawTx: () => void = () => {};
    const rawTxGate = new Promise<void>((resolve) => {
      releaseRawTx = resolve;
    });
    let markUpdateApplied: () => void = () => {};
    const updateApplied = new Promise<void>((resolve) => {
      markUpdateApplied = resolve;
    });

    // Stand-in for a concurrent removal's revokeMembershipForProfileTx: takes the row lock via a
    // plain UPDATE and holds the transaction open (uncommitted) until this test releases it.
    const rawTxPromise = withSessionContext(hh.context, async (tx) => {
      await tx
        .update(membership)
        .set({ revokedAt: new Date() })
        .where(eq(membership.accountId, profile.accountId));
      markUpdateApplied();
      await rawTxGate;
    });

    // Wait for the raw UPDATE to actually execute (and hold its row lock) before starting signIn —
    // otherwise signIn could race ahead of the UPDATE itself, not just its commit.
    await updateApplied;

    // Start signIn concurrently; deliberately not awaited yet. With the `.for("update")` fix, its
    // membership SELECT must block behind the raw transaction's row lock.
    const signInPromise = signIn({
      kind: "household",
      email: deriveResidentEmail(profile.profileId),
      password: PASSWORD,
    }).then(
      (result) => ({ ok: true as const, result }),
      (err) => ({ ok: false as const, err }),
    );

    // A generous window for Supabase Auth's own signInWithPassword round trip (which runs before
    // signIn ever reaches the membership SELECT) to complete and for the SELECT ... FOR UPDATE to
    // reach the database and start waiting on the lock, before this test commits the raw
    // transaction out from under it.
    await new Promise((resolve) => setTimeout(resolve, 1000));

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
});
