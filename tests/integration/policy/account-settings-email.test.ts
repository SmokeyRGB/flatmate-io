import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import {
  SignInError,
  changeResidentEmail,
  claimResidentProfile,
  signIn,
} from "@/modules/identity/auth";
import { createResidentProfile, setMovedOut } from "@/modules/identity/repository";
import { account } from "@/modules/identity/schema";
import { activityEvent } from "@/modules/audit/schema";
import type { CurrentSession } from "@/modules/identity/session-cookie";
import {
  adminClient,
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

const PASSWORD = "test-password-not-real-1234";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

async function claimResident(household: TestHousehold, name: string) {
  const profile = await createResidentProfile(household.context, name, {
    accountId: household.accountId,
    profileId: null,
  });
  const { accountId } = await claimResidentProfile(household.context, profile.id, PASSWORD);
  accountIds.push(accountId);
  return { profileId: profile.id, accountId };
}

function residentSession(
  household: TestHousehold,
  resident: { profileId: string; accountId: string },
): CurrentSession {
  const context: SessionContext = {
    accountId: resident.accountId,
    householdId: household.householdId,
    profileId: resident.profileId,
  };
  return { sessionId: "n/a", context }; // sessionId is unused by changeResidentEmail
}

async function emailChangedEvents(context: SessionContext, subjectId: string) {
  return withSessionContext(context, (tx) =>
    tx
      .select()
      .from(activityEvent)
      .where(and(eq(activityEvent.eventType, "account.email_changed"), eq(activityEvent.subjectId, subjectId))),
  );
}

// resident-settings design.md Decision 2 (identity/account-settings): adding or changing a
// resident's own email address.
describe("changeResidentEmail (identity/account-settings, design.md Decision 2)", () => {
  it("adding an address updates account.email, keeps email_verified_at null, and matches the provider (getUserById)", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "EmailAdder");
    const current = residentSession(hh, resident);

    await changeResidentEmail(current, "Lea@Example.Test");

    const [row] = await withSessionContext(current.context, (tx) =>
      tx.select().from(account).where(eq(account.id, resident.accountId)),
    );
    expect(row.email).toBe("lea@example.test");
    expect(row.emailVerifiedAt).toBeNull();

    const { data } = await adminClient().auth.admin.getUserById(resident.accountId);
    expect(data.user?.email).toBe("lea@example.test");
  });

  it("email sign-in then acts as the profile (acting_profile_id = profile, not null; G-D14 style)", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "EmailSignIn");
    const current = residentSession(hh, resident);
    await changeResidentEmail(current, "signin-check@example.test");

    const result = await signIn({
      kind: "household",
      email: "signin-check@example.test",
      password: PASSWORD,
    });
    expect(result.context.profileId).toBe(resident.profileId);
    expect(result.context.accountId).toBe(resident.accountId);
  });

  it("name sign-in still works after adding an address", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "NameStillWorks");
    const current = residentSession(hh, resident);
    await changeResidentEmail(current, "namestillworks@example.test");

    const result = await signIn({
      kind: "resident",
      householdId: hh.householdId,
      displayName: "NameStillWorks",
      password: PASSWORD,
    });
    expect(result.context.accountId).toBe(resident.accountId);
  });

  it("changing to a new address means the old address gets invalid_credentials and the new one works", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "ChangeAddress");
    const current = residentSession(hh, resident);
    await changeResidentEmail(current, "old-address@example.test");
    await changeResidentEmail(current, "new-address@example.test");

    let caught: unknown;
    try {
      await signIn({ kind: "household", email: "old-address@example.test", password: PASSWORD });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SignInError);
    expect((caught as SignInError).code).toBe("invalid_credentials");

    const result = await signIn({ kind: "household", email: "new-address@example.test", password: PASSWORD });
    expect(result.context.accountId).toBe(resident.accountId);
  });

  it("empty gives missing_email and malformed gives invalid_email, both with account.email unchanged", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "BadInput");
    const current = residentSession(hh, resident);

    await expect(changeResidentEmail(current, "")).rejects.toMatchObject({ code: "missing_email" });
    await expect(changeResidentEmail(current, "not-an-email")).rejects.toMatchObject({ code: "invalid_email" });

    const [row] = await withSessionContext(current.context, (tx) =>
      tx.select().from(account).where(eq(account.id, resident.accountId)),
    );
    expect(row.email).toBeNull();
  });

  // Copilot review round 3 (PR #23): changeResidentEmail now writes account.email and the
  // account.email_changed event BEFORE calling the provider (the provider call is the LAST
  // statement of the transaction, so a refusal rolls both back with it) — the previous shape
  // called the provider FIRST and never reached either write on a refusal. Both orders leave the
  // same observable state here (nothing persists either way, since a thrown error inside
  // withSessionContext rolls the whole transaction back regardless of which statement came first),
  // so this test cannot by itself distinguish the two orders — see the deliberate-break note below
  // for what CAN and cannot be observed from outside the transaction.
  it("the household account's own address gives email_taken, with nothing changed on either side, and no email_changed event", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "TakenAddress");
    const current = residentSession(hh, resident);

    await expect(changeResidentEmail(current, hh.email)).rejects.toMatchObject({ code: "email_taken" });

    const [row] = await withSessionContext(current.context, (tx) =>
      tx.select().from(account).where(eq(account.id, resident.accountId)),
    );
    expect(row.email).toBeNull();

    const { data } = await adminClient().auth.admin.getUserById(hh.accountId);
    expect(data.user?.email).toBe(hh.email);

    // Proves the DB side really did roll back with the provider refusal — not merely that it was
    // never reached (see the reorder in auth.ts: the DB write and the event now happen BEFORE the
    // provider call, so this is the assertion that actually exercises the rollback rather than a
    // path that was simply never taken).
    const events = await emailChangedEvents(current.context, resident.accountId);
    expect(events).toHaveLength(0);
  });

  // Copilot review round 3 (PR #23), deliberate break (argued, not executed — CLAUDE.md forbids
  // weakening a test to prove a regression, and "you cannot make Supabase or the commit fail
  // without mocking" (CLAUDE.md) means the ONE case a broken order would show up in — a failed
  // COMMIT after a successful provider call — cannot be forced here regardless): moving the
  // provider call back to BEFORE the account UPDATE and the recordActivityEvent call (auth.ts's
  // pre-round-3 shape) would NOT make the test above fail. Both orders throw before ever reaching
  // a commit, and Postgres rolls back a transaction that never committed regardless of which
  // statement inside it threw — so "account.email unchanged, no email_changed event" holds either
  // way, and this test's real job is proving that invariant, not discriminating the order. The
  // order only matters for the window neither order can avoid without a cross-system transaction:
  // a commit failing AFTER the provider call already succeeded. That window needs Supabase or
  // Postgres to fail on command, which would require mocking — forbidden by CLAUDE.md — so it is
  // not exercised by an automated test here; changeResidentEmail's own comment states the
  // compensating transaction and the `change_incomplete` code that covers it instead.

  it("a household session gives not_a_resident, and changes nothing", async () => {
    hh = await registerTestHousehold();
    const current: CurrentSession = { sessionId: "n/a", context: hh.context };

    await expect(changeResidentEmail(current, "whatever@example.test")).rejects.toMatchObject({
      code: "not_a_resident",
    });

    const { data } = await adminClient().auth.admin.getUserById(hh.accountId);
    expect(data.user?.email).toBe(hh.email);
  });

  it("one account.email_changed event per change, with payload {}", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "AuditedChange");
    const current = residentSession(hh, resident);
    await changeResidentEmail(current, "audited@example.test");

    const events = await emailChangedEvents(current.context, resident.accountId);
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({});
    expect(events[0].actorAccountId).toBe(resident.accountId);
  });

  it("an unchanged address writes no event", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "Unchanged");
    const current = residentSession(hh, resident);
    await changeResidentEmail(current, "unchanged@example.test");
    await changeResidentEmail(current, "unchanged@example.test");

    const events = await emailChangedEvents(current.context, resident.accountId);
    expect(events).toHaveLength(1); // still just the one from the first, actual change
  });

  // resident-settings design.md Decision 2 step 2: "The account is always
  // current.context.accountId. No id is taken from the form" — unlike createResidentProfile or
  // setMemberRole, this function has no separate actor/target-account parameter at all for a
  // caller to spoof; the only identity it ever reads is the session's own context. This proves the
  // isolation that guarantee is meant to buy: two residents' sessions never cross-contaminate.
  // Copilot review round 2 (PR #23), CLAUDE.md "A concurrent request": a move-out or removal that
  // commits AFTER this action read CurrentSession must still be caught — context.profileId alone
  // is a claim the session made at sign-in (ADR-013) and can go stale. This uses the STALE
  // CurrentSession captured before the revocation, exactly the race the fix closes.
  it("using a stale CurrentSession after the membership is revoked gives not_a_resident, with nothing changed", async () => {
    hh = await registerTestHousehold();
    const resident = await claimResident(hh, "RevokedThenEmail");
    const current = residentSession(hh, resident); // captured BEFORE the revocation below

    await setMovedOut(hh.context, hh.accountId, resident.accountId);

    await expect(changeResidentEmail(current, "should-not-apply@example.test")).rejects.toMatchObject({
      code: "not_a_resident",
    });

    const [row] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(account).where(eq(account.id, resident.accountId)),
    );
    expect(row.email).toBeNull();

    const { data } = await adminClient().auth.admin.getUserById(resident.accountId);
    expect(data.user?.email).toMatch(/^resident-.*@accounts\.flatmate\.invalid$/);

    const events = await emailChangedEvents(current.context, resident.accountId);
    expect(events).toHaveLength(0);
  });

  it("acts only on the session's own account — two residents' changes never cross-contaminate", async () => {
    hh = await registerTestHousehold();
    const residentA = await claimResident(hh, "IsolationA");
    const residentB = await claimResident(hh, "IsolationB");

    await changeResidentEmail(residentSession(hh, residentA), "isolation-a@example.test");
    await changeResidentEmail(residentSession(hh, residentB), "isolation-b@example.test");

    const [rowA] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(account).where(eq(account.id, residentA.accountId)),
    );
    const [rowB] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(account).where(eq(account.id, residentB.accountId)),
    );
    expect(rowA.email).toBe("isolation-a@example.test");
    expect(rowB.email).toBe("isolation-b@example.test");
  });
});
