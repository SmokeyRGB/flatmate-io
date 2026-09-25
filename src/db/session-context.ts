import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "./client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Exported so callers that receive untrusted input (e.g. a cookie value) can check shape
// themselves and fail closed (return null / no session) instead of letting assertUuid's plain
// Error surface as a crash.
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export interface SessionContext {
  accountId: string;
  householdId: string;
  // `null` = a household-account session (ADR-013) — no resident profile is acting. Distinct
  // from an unset/undefined value: a caller must say explicitly that this is a profile-less
  // session, not merely omit the field.
  profileId: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PgTransaction<any, any, any>;

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`${label} is not a valid UUID: ${value}`);
  }
}

/**
 * The ONE place `account_id`/`household_id`/`profile_id` may be set for row-level security to
 * read (FR-1's extension of F0's FR-0.3, `docs/GUARDRAILS.md` G-C8, `docs/adr/0004-*.md`'s
 * canonical variable names). No other file may call `SET`/`SET LOCAL`/`set_config` for this
 * context.
 *
 * loading-feedback design.md D9 (human approval 2026-09-25): runs ONE statement,
 * `SELECT set_config(…, true), …`, instead of up to three separate `SET LOCAL` statements — three
 * round trips become one. `set_config` with its third (`is_local`) argument literally `true` IS
 * `SET LOCAL`: the setting is scoped to the current transaction and is discarded at COMMIT/ROLLBACK,
 * exactly when a
 * transaction-mode pooler reclaims the physical connection for the next tenant (`research.md`
 * §1). Unlike `SET LOCAL`, `set_config` is a function, so several calls fit into one `SELECT`,
 * which is what makes collapsing the three statements into one possible. Splitting the context-setting statement and
 * the dependent query across two transactions would defeat this; that is what the guarded
 * pool-reuse test (G-D10/AC-0.7) exists to catch, and `applySessionContext` itself now has a
 * sibling test through the real mechanism
 * (`tests/integration/raw-sql/session-context-set-config.test.ts`).
 *
 * `profileId`'s `set_config` call is omitted entirely when it is null — a household-account
 * session (ADR-013) leaves `app.profile_id` unset, exactly as before. On a FRESH connection
 * `current_setting('app.profile_id', true)` then returns real SQL `NULL`. **That holds only on a
 * fresh connection.** Once a transaction on a physical connection has set the `app.profile_id`
 * placeholder, a later transaction that leaves it unset reads it back as `''` (empty string), not
 * `NULL` — the Supavisor transaction pooler reuses physical connections across transactions
 * (`tests/integration/raw-sql/pool-reuse.test.ts` covers exactly this and accepts both values).
 * Every policy that gates on profile presence must therefore wrap the read in
 * `nullif(current_setting('app.profile_id', true), '')`, matching
 * `docs/domain/invarianten.md` §5.5's `app_profile_id()` definition (`research.md` §1;
 * openspec application-requires-resident-profile).
 *
 * `assertUuid` is what makes inlining the values safe (see the comment in the body): each one is
 * checked against a closed UUID format before it reaches the statement. The design first chose
 * bound parameters; measurement showed they cost an extra round trip per call under
 * `prepare: false`, so the values are inlined behind the same check the `SET LOCAL` version used.
 */
async function applySessionContext(tx: Tx, context: SessionContext): Promise<void> {
  assertUuid(context.accountId, "accountId");
  assertUuid(context.householdId, "householdId");
  if (context.profileId !== null) {
    assertUuid(context.profileId, "profileId");
  }

  // The values are inlined, not bound: each was just checked by assertUuid, a closed format with
  // no quote or SQL metacharacter, which is the same guarantee the earlier SET LOCAL statements
  // relied on. A bound parameter costs an extra round trip here, because the driver runs with
  // `prepare: false` (required by the Supavisor transaction pooler) and first asks Postgres for
  // the parameter types. Measured from the dev machine: ~95 ms for the inlined statement inside a
  // transaction, ~125 ms bound. Each set_config stays on its own line with a literal `true`, so
  // scripts/lint/session-context.ts can see that it is transaction-local.
  const statement = [
    `SELECT set_config('app.account_id', '${context.accountId}', true) AS account_id,`,
    `       set_config('app.household_id', '${context.householdId}', true) AS household_id`,
    ...(context.profileId !== null
      ? [`     , set_config('app.profile_id', '${context.profileId}', true) AS profile_id`]
      : []),
  ].join("\n");
  await tx.execute(sql.raw(statement));
}

// The one helper G-C8 allows: it opens the transaction itself and sets the context as its first
// statement, so no caller can set context mid-transaction or on a transaction it opened
// elsewhere. `applySessionContext` above is deliberately not exported (review of this change).
// `database` exists only so the raw-SQL pool-leak test can run the real mechanism on a dedicated
// `max: 1` client; application code always uses `withSessionContext`, which passes the shared
// client.
export async function withSessionContextOn<T>(
  database: { transaction: typeof db.transaction },
  context: SessionContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return database.transaction(async (tx) => {
    await applySessionContext(tx as unknown as Tx, context);
    return fn(tx as unknown as Tx);
  });
}

export async function withSessionContext<T>(
  context: SessionContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withSessionContextOn(db, context, fn);
}
