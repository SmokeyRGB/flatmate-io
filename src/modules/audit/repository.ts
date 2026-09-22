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
  // F1 event types (identity/casting modules) — registered here, the one write path, per FR-1.20.
  "resident_profile.created": [],
  "resident_profile.status_changed": ["fromStatus", "toStatus"],
  "room.created": [],
  "room.renamed": [], // no fromLabel/toLabel — a room label is free text, not a counter/reference (G-D7)
  "room.status_changed": ["fromStatus", "toStatus"],
  "room.removed": [],
  "casting_round.created": [],
  "casting_round.opened": ["participantCount"],
  "casting_round.participant_added": ["source"],
  "household_settings.changed": ["field"],
  "household_settings.changed_while_round_open": ["field", "roundId"],
  "membership.revoked": [],
  "membership.reactivated": [],
  "membership.removed_as_intruder": [], // U-27's hard-removal tier — distinct event type from
  // membership.revoked so the audit trail preserves *why*, even though no other field differs yet
  // join-code-protections (O-18, 2026-09-21): rotateJoinCode/household.join_code_rotated is
  // gone (replaced by issue/extend/delete against JoinCodeIssuance), but the type stays
  // registered — historical rows still carry it, and the allowlist is what makes them readable
  // as valid rather than throwing PayloadValidationError on read-time replay. Nothing writes it
  // any more.
  "household.join_code_rotated": [],
  // Both empty — the join code itself must never enter a payload (G-A5). Extending a link is
  // deliberately NOT audited (design.md Decision 5): it changes no one's access, only defers an
  // expiry.
  "household.join_code_issued": [],
  "household.join_code_deleted": [],
  "membership.role_changed": ["fromRole", "toRole"], // EC-1.7's "appoint it moderator" (Convergence)
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

// FR-0.13/G-D8: end-of-retention redaction — "die personenbeziehbaren Payload-Felder [werden]
// `null`", i.e. only the specific keys classified 🔴/⚫ per event_type, not the whole object.
// Everything else in the payload is exactly the accountability data FR-0.13 requires to survive
// ("die Rechenschaftskette ist noch lesbar"). `application.state_changed`'s keys (`fromState`,
// `toState`) are state names, not personal data, so it has none registered — redaction is
// correctly a no-op for this slice's one event_type, not a bug to "fix" by clearing them anyway.
//
// Fixed 2026-09-17 (/speckit-converge T046): the first implementation set `payload = {}`
// unconditionally, which destroyed `fromState`/`toState` — exactly the state-transition history
// this function exists to preserve. Caught by re-reading FR-0.13/G-D8 against the code, not by
// the test that was passing at the time (it asserted the wrong behavior; corrected alongside).
const REDACTABLE_KEYS: Readonly<Record<string, readonly string[]>> = {
  "application.state_changed": [],
};

export async function redactExpiredActivityEvents(tx: Tx): Promise<number> {
  let redactedCount = 0;

  for (const [eventType, keys] of Object.entries(REDACTABLE_KEYS)) {
    if (keys.length === 0) continue; // nothing classified sensitive for this event_type — nothing to null

    const nullPatch = Object.fromEntries(keys.map((key) => [key, null]));
    const result = await tx
      .update(activityEvent)
      .set({ payload: sql`${activityEvent.payload} || ${JSON.stringify(nullPatch)}::jsonb` })
      .where(
        and(
          eq(activityEvent.eventType, eventType),
          eq(activityEvent.subjectType, "application"),
          sql`${activityEvent.subjectId} IN (
            SELECT ${application.id} FROM ${application}
            WHERE ${application.retentionUntil} IS NOT NULL
              AND ${application.retentionUntil} < now()
          )`,
        ),
      )
      .returning({ id: activityEvent.id });

    redactedCount += result.length;
  }

  return redactedCount;
}
