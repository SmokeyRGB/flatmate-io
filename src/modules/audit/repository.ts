import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { activityEvent } from "./schema";
import { application } from "@/modules/casting/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PgTransaction<any, any, any>;

// FR-0.14: payload validated against a positive list of allowed keys per event_type. Only
// `application.state_changed` is registered by F0 itself (written by the casting transition
// function); other event_types are F1-F5's business logic and are registered when that logic
// ships, not invented here ahead of time.
const PAYLOAD_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  "application.state_changed": ["fromState", "toState"],
};

export class PayloadValidationError extends Error {}

export function assertPayloadAllowed(
  eventType: string,
  payload: Record<string, unknown>,
): void {
  const allowedKeys = PAYLOAD_ALLOWLIST[eventType];
  if (!allowedKeys) {
    throw new PayloadValidationError(`No payload allowlist registered for event_type "${eventType}"`);
  }
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.includes(key)) {
      throw new PayloadValidationError(`Key "${key}" is not allowed for event_type "${eventType}"`);
    }
  }
}

export interface RecordEventInput {
  householdId: string;
  eventType: string;
  subjectType: string;
  subjectId: string;
  actorAccountId: string | null;
  actorProfileId: string | null;
  payload: Record<string, unknown>;
  reversesEventId?: string | null;
}

// FR-0.13/FR-0.14: the one write path for ActivityEvent. Validates the payload before insert;
// the table's own RLS/append-only policies (schema.ts) enforce immutability independently.
export async function recordActivityEvent(tx: Tx, input: RecordEventInput) {
  assertPayloadAllowed(input.eventType, input.payload);

  const [row] = await tx
    .insert(activityEvent)
    .values({
      householdId: input.householdId,
      eventType: input.eventType,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      actorAccountId: input.actorAccountId,
      actorProfileId: input.actorProfileId,
      payload: input.payload,
      reversesEventId: input.reversesEventId ?? null,
    })
    .returning();

  return row;
}

// FR-0.13: end-of-retention redaction. Clears payload (this F0 slice registers no event_type
// with a non-sensitive payload field to preserve — see PAYLOAD_ALLOWLIST above) while leaving
// id/occurred_at/event_type/actor fields readable, on ActivityEvent rows whose referenced
// Application has passed its retention_until (docs/domain/casting.md §7).
export async function redactExpiredActivityEvents(tx: Tx): Promise<number> {
  const result = await tx
    .update(activityEvent)
    .set({ payload: {} })
    .where(
      and(
        eq(activityEvent.subjectType, "application"),
        sql`${activityEvent.subjectId} IN (
          SELECT ${application.id} FROM ${application}
          WHERE ${application.retentionUntil} IS NOT NULL
            AND ${application.retentionUntil} < now()
        )`,
        sql`${activityEvent.payload} <> '{}'::jsonb`,
      ),
    )
    .returning({ id: activityEvent.id });

  return result.length;
}
