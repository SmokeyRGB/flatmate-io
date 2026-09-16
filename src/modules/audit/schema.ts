import { sql } from "drizzle-orm";
import { index, jsonb, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Wrapped in (select ...): Supabase's RLS-performance guidance — otherwise Postgres re-evaluates
// current_setting() per row instead of once per query (confirmed via this project's own
// performance advisor after the first migration, 2026-09-16).
const HOUSEHOLD_MATCH = sql`household_id = (select current_setting('app.household_id', true)::uuid)`;

export const activityEvent = pgTable(
  "activity_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(), // RLS-Anker
    roundId: uuid("round_id"),
    eventType: text("event_type").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    actorAccountId: uuid("actor_account_id"),
    actorProfileId: uuid("actor_profile_id"),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    correlationId: uuid("correlation_id"),
    reversesEventId: uuid("reverses_event_id"),
  },
  (t) => [
    index("activity_event_household_id_idx").on(t.householdId),
    // FR-0.2: ActivityEvent carries household_id too — the same isolation guarantee as
    // Application (found missing by /speckit-analyze, added 2026-09-16).
    pgPolicy("activityevent_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
    // FR-0.13: append-only, "except by the deletion concept acting on the entries' referenced
    // data" — i.e. retention redaction is the one permitted UPDATE, not a blanket denial. A bare
    // USING(false) here (this policy's first draft) blocked the redaction path itself, caught by
    // tests/unit/audit/payload-allowlist.test.ts's retention-redaction test failing against the
    // live database (2026-09-16). USING scopes which existing rows may be targeted (only ones
    // whose Application has actually passed retention_until — the same condition
    // redactExpiredActivityEvents() already checks, not a new bypass); WITH CHECK scopes the
    // resulting row (payload must become exactly empty). Everything else — tampering with
    // event_type, actor fields, or redacting before retention is up — stays denied, under raw
    // SQL and (via FORCE ROW LEVEL SECURITY) the table-owning migration role too.
    pgPolicy("activityevent_append_only_update", {
      as: "restrictive",
      for: "update",
      using: sql`EXISTS (
        SELECT 1 FROM application
        WHERE application.id = activity_event.subject_id
          AND activity_event.subject_type = 'application'
          AND application.retention_until IS NOT NULL
          AND application.retention_until < now()
      )`,
      withCheck: sql`payload = '{}'::jsonb`,
    }),
    pgPolicy("activityevent_append_only_delete", {
      as: "restrictive",
      for: "delete",
      using: sql`false`,
    }),
  ],
);
