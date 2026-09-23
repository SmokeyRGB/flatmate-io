import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile, deriveResidentEmail, signIn, SignInError } from "@/modules/identity/auth";
import {
  createResidentProfile,
  reactivateMember,
  removeMember,
  setMovedOut,
} from "@/modules/identity/repository";
import { session } from "@/modules/identity/schema";
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
