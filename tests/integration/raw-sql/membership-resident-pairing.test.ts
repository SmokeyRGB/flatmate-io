import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;

afterEach(async () => {
  await cleanupAll(hh?.cleanup());
  hh = undefined;
});

type PgError = { code?: string; message?: string };

function pgErrorOf(caught: unknown): PgError {
  const err = caught as { code?: string; message?: string; cause?: PgError };
  // postgres.js (src/db/client.ts) throws its own error with `.code` set to the raw SQLSTATE
  // directly; drizzle's own wrapping (seen elsewhere in this suite, e.g.
  // resident-profile-removal-final.test.ts) sometimes nests the driver error under `.cause`
  // instead — checked both, so this test is not coupled to which layer happens to surface it.
  return err.code ? err : (err.cause ?? err);
}

// review fix (Copilot findings, PR #23; migration drizzle/0020): there are no foreign keys in this
// schema, so nothing but this CHECK stops a membership row from decoupling `is_resident` from
// `resident_profile_id` — the pairing drizzle/0019's resolve_join_code/claim_join_code (SECURITY
// DEFINER) and issuePasswordResetLink's own eligibility query both trust without re-checking. This
// asserts the constraint holds even for a raw SQL INSERT under app_runtime, not only for the three
// writers (registerHousehold, claimResidentProfile, joinHousehold) that happen to write it
// consistently today (CLAUDE.md "An invariant holds only where it is enforced").
describe("[G-C7 raw SQL] membership.is_resident and resident_profile_id stay paired (drizzle/0020)", () => {
  it("rejects is_resident = false with a set resident_profile_id (SQLSTATE 23514)", async () => {
    hh = await registerTestHousehold();

    let caught: unknown;
    try {
      await withSessionContext(hh.context, (tx) =>
        tx.execute(
          sql`INSERT INTO membership (household_id, account_id, resident_profile_id, is_resident, role)
              VALUES (${hh!.householdId}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, false, 'member')`,
        ),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(pgErrorOf(caught).code).toBe("23514");
  });

  it("rejects is_resident = true with a null resident_profile_id (SQLSTATE 23514)", async () => {
    hh = await registerTestHousehold();

    let caught: unknown;
    try {
      await withSessionContext(hh.context, (tx) =>
        tx.execute(
          sql`INSERT INTO membership (household_id, account_id, resident_profile_id, is_resident, role)
              VALUES (${hh!.householdId}::uuid, ${randomUUID()}::uuid, NULL, true, 'member')`,
        ),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(pgErrorOf(caught).code).toBe("23514");
  });

  // Deliberate break (argued, not executed — CLAUDE.md forbids dropping a live constraint to prove
  // a test): with drizzle/0020's CHECK absent, both INSERTs above succeed (there is no other
  // guard — no foreign key, no trigger, no RLS WITH CHECK clause references resident_profile_id or
  // is_resident, only household_id) and `pgErrorOf(caught).code` is read off `undefined`, failing
  // the `toBe("23514")` assertion because no error was thrown at all. That is exactly what a
  // hand-written or corrupted row looked like before this migration, and exactly what
  // resolve_join_code/claim_join_code's resident-only joins and issuePasswordResetLink's
  // eligibility query were silently trusting not to occur.
});
