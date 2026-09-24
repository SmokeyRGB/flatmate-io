import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { registerHousehold } from "@/modules/identity/auth";
import { uuid } from "./uuid";

// The household-scoped delete set (M2, P6: "no foreign keys means a hand-kept deletion
// inventory"). Exported so this is the ONE hand-kept list — the cleanup-inventory lint
// (tests/unit/lint/cleanup-inventory.test.ts) statically parses src/modules/*/schema.ts for every
// pgTable carrying a household_id column (or keyed on household's own id/household_id) and
// asserts each one is a member of this array, and register-session-setup-not-atomic.test.ts's own
// compensating cleanup is built from it too, instead of keeping a second hand-copied list — that
// second copy drifted from this one twice (4a9724f, then again on 2026-09-22 per that test's own
// comment) before the comment warning about the first drift stopped it happening a third time.
//
// activity_event is deliberately absent: FR-0.13 makes it append-only (RESTRICTIVE policies plus
// FORCE ROW LEVEL SECURITY), so this transaction could not delete it even if it tried — see
// audit/schema.ts. join_attempt is also deliberately absent: it carries no household_id column at
// all (see identity/schema.ts's own comment on that table) and app_runtime has no DELETE access
// to it regardless (RLS enabled, zero policies) — tests that call recordJoinAttempt own their own
// teardown via the service-role client (tests/integration/policy/join-rate-limit.test.ts).
export const HOUSEHOLD_SCOPED_TABLES = [
  "round_participation",
  "casting_round",
  "room",
  "application",
  "resident_profile",
  "membership",
  "session",
  "account",
  "household_settings",
  "join_code_issuance",
] as const;

// Builds the one-round-trip data-modifying-CTE delete statement (see the comment inside
// makeCleanup for why it has to be one round trip) from HOUSEHOLD_SCOPED_TABLES, so the SQL text
// and the exported list can never drift from each other the way the two hand-copies used to.
function buildHouseholdCleanupStatement(id: string) {
  const deletes = HOUSEHOLD_SCOPED_TABLES.map(
    (table, i) =>
      sql`${sql.raw(`d_${i}`)} as (delete from ${sql.raw(table)} where household_id = ${id})`,
  );
  return sql`with ${sql.join(deletes, sql`, `)} delete from household where id = ${id}`;
}

// Deletes exactly HOUSEHOLD_SCOPED_TABLES's rows for one household, scoped by the given session
// context. For a household registered directly via registerHousehold (not
// registerTestHousehold()), which has no TestHousehold wrapper to call .cleanup() on — e.g.
// register-session-setup-not-atomic.test.ts's "retried" registration. Its Auth user is tracked
// and deleted separately (that test pushes onto its own accountIds array and calls
// deleteTestAccount), so this only removes the DB rows, mirroring makeCleanup's own CTE exactly.
// G-D15 (openspec application-requires-resident-profile, design Decision 6): `application` now
// carries a RESTRICTIVE policy requiring a resident profile to be present (drizzle/0018). A
// profile-less context here would make the CTE's `application` arm match zero rows and report no
// error — exactly the silent-orphan class this function exists to prevent (see the comment above).
// Sound only because Decision 1's policy checks PRESENCE, not identity: any UUID clears it, so a
// synthetic profile id used only to satisfy this DELETE is safe — this is test-only teardown of
// rows the test itself created, confined to a household about to be deleted anyway.
export async function cleanupHousehold(context: SessionContext, householdId: string): Promise<void> {
  const cleanupContext = { ...context, profileId: context.profileId ?? uuid() };
  await withSessionContext(cleanupContext, async (tx) => {
    await tx.execute(buildHouseholdCleanupStatement(householdId));
  });
}

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
    // The delete set itself lives in HOUSEHOLD_SCOPED_TABLES above (M2) — see its comment for why
    // activity_event and join_attempt are deliberately absent from it.
    await cleanupHousehold(context, id);
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
