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

// Households whose registration is still in flight, keyed by their own promise. A test that times
// out while awaiting registerTestHousehold() leaves no binding for its own afterEach to find —
// this set is how tests/setup.ts's sweep finds it anyway. Populated synchronously, before any
// await, so it holds the promise for the whole window a hook could observe it (design.md D1).
const inFlightHouseholds = new Set<Promise<TestHousehold>>();

async function registerTestHouseholdInner(deregister: () => void, name: string): Promise<TestHousehold> {
  const email = testEmail();
  const password = "test-password-not-real-1234";
  const { household: householdRow, context } = await registerHousehold(email, password, name);

  return {
    context,
    accountId: context.accountId,
    householdId: householdRow.id,
    email,
    cleanup: makeCleanup(context, deregister),
  };
}

// Registers a real household (real Supabase Auth user + real rows) so integration tests exercise
// the actual code path, then hands back a cleanup function that removes all of it — auth user
// included, so repeated test runs don't accumulate rows in Supabase Auth's own user table.
//
// "WG" is the default `name` — a synthetic test fixture value, not a production default. Several
// existing tests assert resolveJoinCode's returned householdName equals it (e.g.
// join-code-validation.test.ts, join-code-isolation.test.ts's raw-SQL test), so the default stays
// "WG" for callers that don't care what the name is; a test that DOES care (e.g. FR-2.9's own
// household-name-required test) passes its own.
export function registerTestHousehold(name = "WG"): Promise<TestHousehold> {
  const promise: Promise<TestHousehold> = registerTestHouseholdInner(
    () => inFlightHouseholds.delete(promise),
    name,
  );
  inFlightHouseholds.add(promise);
  // A rejected registration created no household, so there is nothing for the sweep to clean —
  // just stop it from surfacing as an unhandled rejection while it sits in the set. A rejected
  // entry is removed the next time sweepAbandonedHouseholds drains the set (it drains
  // unconditionally), so no explicit removal is needed here.
  promise.catch(() => {});
  return promise;
}

// The most recent sweep's count only — no history, no household ids. The sweep for test N runs
// after test N ends (tests/setup.ts's afterEach), so only test N+1 can observe it; this is how
// that observation crosses the gap (design.md D2).
let lastSweepCount = 0;

export function getLastSweepCount(): number {
  return lastSweepCount;
}

// Drains the in-flight set and cleans every household whose registration resolved after its own
// test had already ended (design.md D3/D4) — the net beneath each file's own afterEach. Returns
// the number of households actually cleaned (fulfilled registrations only — a rejected
// registration created nothing to clean).
export async function sweepAbandonedHouseholds(): Promise<number> {
  const pending = Array.from(inFlightHouseholds);
  inFlightHouseholds.clear();
  const results = await Promise.allSettled(pending);
  const cleanups = results
    .filter((r): r is PromiseFulfilledResult<TestHousehold> => r.status === "fulfilled")
    .map((r) => r.value.cleanup());
  // Recorded before cleanupAll can throw, so a failing cleanup does not leave a stale count.
  lastSweepCount = cleanups.length;
  try {
    await cleanupAll(...cleanups);
  } catch (error) {
    if (error instanceof AggregateError) {
      throw new AggregateError(error.errors, `sweepAbandonedHouseholds: ${error.message}`);
    }
    throw error;
  }
  return lastSweepCount;
}

function makeCleanup(context: SessionContext, deregister: () => void): () => Promise<void> {
  let cleaned = false;

  return async () => {
    // Deregistration and idempotence both matter here, for different reasons (design.md D2): once
    // a test's own afterEach has cleaned a household, the sweep must not find its (already
    // deregistered) promise; and if the sweep and a test's own teardown ever race for the same
    // household, a second call must be a harmless no-op rather than a failing
    // auth.admin.deleteUser call on an already-deleted user — which cleanupAll would report as an
    // AggregateError on an otherwise well-behaved test.
    if (cleaned) return;
    cleaned = true;
    deregister();

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
    //
    // join_attempt is ALSO deliberately absent, for the opposite reason: it carries no
    // household_id at all (design.md Decision 3, join-by-link), so it has nothing to key this
    // CTE's `where household_id = ${id}` on — and app_runtime (the role this whole transaction
    // runs as) has no DELETE access to it regardless, RLS-enabled with zero policies. A test that
    // calls recordJoinAttempt owns its own teardown via the Supabase service-role client; see
    // identity/schema.ts's joinAttempt table comment and
    // tests/integration/policy/join-rate-limit.test.ts.
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
          d_settings      as (delete from household_settings  where household_id = ${id}),
          -- join-code-protections (O-18): registerHousehold now mints a founding
          -- join_code_issuance row for every test household — without this, every call to
          -- registerTestHousehold() would leave one orphaned row per test run.
          d_join_code     as (delete from join_code_issuance  where household_id = ${id})
        delete from household where id = ${id}
      `);
    });
    await adminClient().auth.admin.deleteUser(context.accountId);
  };
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
