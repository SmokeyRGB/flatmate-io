import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

type PgError = { code?: string; message?: string };

function pgErrorOf(caught: unknown): PgError {
  const err = caught as { code?: string; message?: string; cause?: PgError };
  // postgres.js (src/db/client.ts) throws its own error with `.code` set to the raw SQLSTATE
  // directly; drizzle's own wrapping sometimes nests the driver error under `.cause` instead —
  // checked both, same as membership-resident-pairing.test.ts's own pgErrorOf.
  return err.code ? err : (err.cause ?? err);
}

// Copilot review round 2 (PR #23; migration drizzle/0021): one membership per resident profile,
// and one membership per account, are database invariants now — the reset path picks
// `[membershipRow]` by resident_profile_id and signIn picks it by account_id, so a second row for
// either would make either pick ambiguous. Asserted here for a raw SQL INSERT under app_runtime,
// not only for the three writers (registerHousehold, claimResidentProfile, joinHousehold) that
// happen to write one row each today (CLAUDE.md "Every writer of the same state, pairwise").
describe("[G-C7 raw SQL] membership carries at most one row per resident_profile_id and per account_id (drizzle/0021)", () => {
  it("a second membership for the same resident_profile_id fails with SQLSTATE 23505", async () => {
    hh = await registerTestHousehold();
    const profile = await createResidentProfile(hh.context, "DupProfile", {
      accountId: hh.accountId,
      profileId: null,
    });
    const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
    accountIds.push(accountId);

    let caught: unknown;
    try {
      await withSessionContext(hh.context, (tx) =>
        tx.execute(
          sql`INSERT INTO membership (household_id, account_id, resident_profile_id, is_resident, role, permissions)
              VALUES (${hh!.householdId}::uuid, ${randomUUID()}::uuid, ${profile.id}::uuid, true, 'member', '{}')`,
        ),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(pgErrorOf(caught).code).toBe("23505");
  });

  it("a second membership for the same account_id fails with SQLSTATE 23505", async () => {
    hh = await registerTestHousehold();

    let caught: unknown;
    try {
      await withSessionContext(hh.context, (tx) =>
        tx.execute(
          sql`INSERT INTO membership (household_id, account_id, resident_profile_id, is_resident, role, permissions)
              VALUES (${hh!.householdId}::uuid, ${hh!.accountId}::uuid, NULL, false, 'member', '{}')`,
        ),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(pgErrorOf(caught).code).toBe("23505");
  });

  // Two NULL resident_profile_id rows for two DIFFERENT accounts must NOT collide — the partial
  // unique index only constrains non-null values (a household account's own row always has a
  // null one, ADR-013, and nothing limits how many such rows exist across different households).
  it("two different accounts each with a null resident_profile_id do not collide", async () => {
    hh = await registerTestHousehold();
    // A fresh, distinct account_id — hh.accountId already carries its OWN null-profile row from
    // registerTestHousehold, so reusing it here would trip the account_id unique index instead
    // and prove nothing about the profile_id partial index this test targets.
    await expect(
      withSessionContext(hh.context, (tx) =>
        tx.execute(
          sql`INSERT INTO membership (household_id, account_id, resident_profile_id, is_resident, role, permissions)
              VALUES (${hh!.householdId}::uuid, ${randomUUID()}::uuid, NULL, false, 'member', '{}')`,
        ),
      ),
    ).resolves.toBeTruthy();
  });

  // Deliberate break (argued, not executed — CLAUDE.md forbids dropping a live constraint to prove
  // a test): with drizzle/0021's unique indexes absent, both failing INSERTs above would succeed
  // instead (there is nothing else — no foreign key, no trigger, no RLS WITH CHECK clause
  // constrains cardinality on either column) and `pgErrorOf(caught).code` would read off
  // `undefined`, failing the `toBe("23505")` assertion because no error was thrown at all. That is
  // exactly the ambiguity the reset path's and signIn's own single-row `SELECT ... FOR UPDATE`
  // picks were silently trusting could never happen.
});
