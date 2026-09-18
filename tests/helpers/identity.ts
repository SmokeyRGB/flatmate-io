import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { registerHousehold } from "@/modules/identity/auth";
import { uuid } from "./uuid";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// G-B1: synthetic-only test data — @example.test is this project's fixed test-email convention.
export function testEmail(): string {
  return `f1-test-${uuid()}@example.test`;
}

export interface TestHousehold {
  context: SessionContext;
  accountId: string;
  householdId: string;
  email: string;
  cleanup: () => Promise<void>;
}

// Registers a real household (real Supabase Auth user + real rows) so integration tests exercise
// the actual code path, then hands back a cleanup function that removes all of it — auth user
// included, so repeated test runs don't accumulate rows in Supabase Auth's own user table.
export async function registerTestHousehold(): Promise<TestHousehold> {
  const email = testEmail();
  const password = "test-password-not-real-1234";
  const { household: householdRow, context } = await registerHousehold(email, password);

  const cleanup = async () => {
    const id = context.householdId;

    // One statement, one round trip. Every table here carries household_id as a bare uuid with
    // **no foreign key** to household (verified: the schema has zero FK constraints), so deleting
    // the household alone orphaned the casting rows silently — which is how the production project
    // accumulated 1.9k rooms and 1.5k rounds before anyone noticed.
    //
    // Data-modifying CTEs rather than ten sequential deletes: on a GitHub runner each round trip
    // to eu-west-1 is expensive enough that ten of them, times the ~35 tests that register a
    // household, added ~90s to the suite even from afterEach. Postgres runs every data-modifying
    // CTE exactly once and to completion whether or not the primary query reads it, and with no
    // FKs between these tables their order does not matter.
    //
    // activity_event is deliberately absent: FR-0.13 makes it append-only, enforced by RESTRICTIVE
    // policies plus FORCE ROW LEVEL SECURITY, so this transaction could not delete it anyway.
    await withSessionContext(context, async (tx) => {
      await tx.execute(sql`
        with
          d_participation as (delete from round_participation where household_id = ${id}),
          d_round         as (delete from casting_round       where household_id = ${id}),
          d_room          as (delete from room                where household_id = ${id}),
          d_application   as (delete from application         where household_id = ${id}),
          d_profile       as (delete from resident_profile    where household_id = ${id}),
          d_membership    as (delete from membership          where household_id = ${id}),
          d_session       as (delete from session             where household_id = ${id}),
          d_account       as (delete from account             where household_id = ${id}),
          d_settings      as (delete from household_settings  where household_id = ${id})
        delete from household where id = ${id}
      `);
    });
    await adminClient().auth.admin.deleteUser(context.accountId);
  };

  return { context, accountId: context.accountId, householdId: householdRow.id, email, cleanup };
}

// Cleans up a resident account created via claimResidentProfile (a separate Auth user from the
// household's own).
export async function deleteTestAccount(accountId: string): Promise<void> {
  await adminClient().auth.admin.deleteUser(accountId);
}

// Runs every afterEach cleanup task to completion, even if one rejects, so a failure in one
// household's teardown can never suppress another's (see proposal.md — sequential cleanup was
// exactly how orphaned rows went unnoticed). Takes already-started promises rather than thunks:
// call sites read as `cleanupAll(...accountIds.map(deleteTestAccount), hhA?.cleanup())`, and
// Promise.allSettled attaches a handler to each in the same synchronous turn as this call, so
// there is no window for an unhandled rejection. Concurrency is safe here — the tables have no
// foreign keys between them, each cleanup is scoped to its own household_id, and the Supabase
// Auth users involved are always distinct.
export async function cleanupAll(...tasks: Array<Promise<unknown> | undefined>): Promise<void> {
  const results = await Promise.allSettled(tasks.filter((task) => task !== undefined));
  const reasons = results.filter((r) => r.status === "rejected").map((r) => r.reason);
  if (reasons.length > 0) {
    throw new AggregateError(reasons, "test cleanup failed");
  }
}
