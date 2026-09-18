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
 * canonical variable names). No other file may call `SET`/`SET LOCAL` on this context.
 *
 * Uses `SET LOCAL`, never bare `SET` (FR-0.4): `LOCAL` scopes the setting to the current
 * transaction, so it is discarded at COMMIT/ROLLBACK — exactly when a transaction-mode pooler
 * reclaims the physical connection for the next tenant (`research.md` §1). Splitting the
 * `SET LOCAL` and the dependent query across two transactions would defeat this; that is what the
 * guarded pool-reuse test (G-D10/AC-0.7) exists to catch.
 *
 * `profileId` is set via `SET LOCAL` only when non-null — a household-account session (ADR-013)
 * leaves `app.profile_id` unset entirely, so `current_setting('app.profile_id', true)` returns
 * real SQL `NULL` (never an empty string), matching what `docs/domain/invarianten.md` §5.5's
 * `app_profile_id()` expects to distinguish a household-account session (`research.md` §1).
 *
 * `SET LOCAL` does not accept bind parameters at the protocol level, so every value is validated
 * as a UUID (a closed, SQL-metacharacter-free format) before being interpolated into the
 * statement — never passed through unchecked.
 */
export async function withSessionContext<T>(
  context: SessionContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  assertUuid(context.accountId, "accountId");
  assertUuid(context.householdId, "householdId");
  if (context.profileId !== null) {
    assertUuid(context.profileId, "profileId");
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.account_id = '${context.accountId}'`));
    await tx.execute(sql.raw(`SET LOCAL app.household_id = '${context.householdId}'`));
    if (context.profileId !== null) {
      await tx.execute(sql.raw(`SET LOCAL app.profile_id = '${context.profileId}'`));
    }
    return fn(tx as unknown as Tx);
  });
}
