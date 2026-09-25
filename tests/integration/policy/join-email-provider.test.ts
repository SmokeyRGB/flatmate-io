import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { JoinError, joinHousehold, signIn } from "@/modules/identity/auth";
import { issueJoinCode, listJoinCodeIssuances } from "@/modules/identity/repository";
import { account, membership, residentProfile } from "@/modules/identity/schema";
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

// resident-settings design.md Decision 3: the join path puts a supplied email into Auth too, so
// "has an email" means the same thing whether it was given at join or added later (identity/join).
describe("joinHousehold puts a supplied email at the provider (design.md Decision 3)", () => {
  it("a join with an email puts it at the provider, and email sign-in works", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    const result = await joinHousehold(link.code, {
      displayName: "EmailJoiner",
      password: PASSWORD,
      email: "email-joiner@example.test",
    });
    accountIds.push(result.context.accountId);

    const { data } = await adminClient().auth.admin.getUserById(result.context.accountId);
    expect(data.user?.email).toBe("email-joiner@example.test");

    const signInResult = await signIn({
      kind: "household",
      email: "email-joiner@example.test",
      password: PASSWORD,
    });
    expect(signInResult.context.accountId).toBe(result.context.accountId);
    expect(signInResult.context.profileId).toBe(result.context.profileId);
  });

  it("a join with an address already in use gives email_taken, with no rows created, no Auth user left behind, and uses unchanged", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    let caught: unknown;
    try {
      await joinHousehold(link.code, {
        displayName: "TakenEmailJoiner",
        password: PASSWORD,
        email: hh.email, // the household account's own address — already in use at the provider
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(JoinError);
    expect((caught as JoinError).code).toBe("email_taken");

    const profiles = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.householdId, hh!.householdId)),
    );
    expect(profiles.some((p) => p.displayName === "TakenEmailJoiner")).toBe(false);

    // Only the household_admin's own membership exists — no second row was created.
    const memberships = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.householdId, hh!.householdId)),
    );
    expect(memberships).toHaveLength(1);

    const issuances = await listJoinCodeIssuances(hh.context, hh.accountId);
    const row = issuances.find((i) => i.id === link.id);
    expect(row?.uses).toBe(0); // the link's use rolled back with the rest
  });

  // review fix (finding 2): joinHousehold used to send the optional email to Supabase createUser
  // unvalidated and un-normalised — a malformed address failed the WHOLE join as an opaque
  // signup_failed, before this test existed to catch it.
  it("a malformed email gives invalid_email, with no rows created, uses unchanged, and no Auth user left behind", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    let caught: unknown;
    try {
      await joinHousehold(link.code, {
        displayName: "MalformedEmailJoiner",
        password: PASSWORD,
        email: "not-an-email",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(JoinError);
    expect((caught as JoinError).code).toBe("invalid_email");

    const profiles = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.householdId, hh!.householdId)),
    );
    expect(profiles.some((p) => p.displayName === "MalformedEmailJoiner")).toBe(false);

    const memberships = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.householdId, hh!.householdId)),
    );
    expect(memberships).toHaveLength(1); // only the household_admin's own membership

    const issuances = await listJoinCodeIssuances(hh.context, hh.accountId);
    const row = issuances.find((i) => i.id === link.id);
    expect(row?.uses).toBe(0); // refused before the link was ever claimed

    // No Auth user was created at all for this attempt — search would otherwise need a specific
    // id, which this test never obtains (createUser is never reached), so there is nothing to
    // clean up via accountIds either.
  });

  // review fix (finding 2): mixed case must be lower-cased both at the provider and in
  // account.email, matching E1's changeResidentEmail (normalizeEmail) exactly.
  it("a mixed-case email is stored lower-cased in both account.email and the provider", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    const result = await joinHousehold(link.code, {
      displayName: "MixedCaseJoiner",
      password: PASSWORD,
      email: "Mixed@Example.test",
    });
    accountIds.push(result.context.accountId);

    const { data } = await adminClient().auth.admin.getUserById(result.context.accountId);
    expect(data.user?.email).toBe("mixed@example.test");

    const [accountRow] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(account).where(eq(account.id, result.context.accountId)),
    );
    expect(accountRow.email).toBe("mixed@example.test");
  });
});
