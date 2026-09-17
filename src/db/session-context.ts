import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "./client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionContext {
  householdId: string;
  residentProfileId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PgTransaction<any, any, any>;

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`${label} is not a valid UUID: ${value}`);
  }
}

/**
 * The ONE place `household_id`/`resident_profile_id` may be set for row-level security to read
 * (FR-0.3, `docs/GUARDRAILS.md` G-C8). No other file may call `SET`/`SET LOCAL` on this context.
 *
 * Uses `SET LOCAL`, never bare `SET` (FR-0.4): `LOCAL` scopes the setting to the current
 * transaction, so it is discarded at COMMIT/ROLLBACK — exactly when a transaction-mode pooler
 * reclaims the physical connection for the next tenant (`research.md` §1). Splitting the
 * `SET LOCAL` and the dependent query across two transactions would defeat this; that is what the
 * guarded pool-reuse test (G-D10/AC-0.7) exists to catch.
 *
 * `SET LOCAL` does not accept bind parameters at the protocol level, so the value is validated as
 * a UUID (a closed, SQL-metacharacter-free format) before being interpolated into the statement —
 * never passed through unchecked.
 */
export async function withSessionContext<T>(
  context: SessionContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  assertUuid(context.householdId, "householdId");
  assertUuid(context.residentProfileId, "residentProfileId");

  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.household_id = '${context.householdId}'`));
    await tx.execute(sql.raw(`SET LOCAL app.resident_profile_id = '${context.residentProfileId}'`));
    return fn(tx as unknown as Tx);
  });
}
