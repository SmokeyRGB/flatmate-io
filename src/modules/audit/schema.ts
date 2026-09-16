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
    // FR-0.13: append-only. RESTRICTIVE policies AND with the permissive one above, so no
    // household match can ever satisfy an UPDATE/DELETE — this holds even under raw SQL.
    // Combined with `FORCE ROW LEVEL SECURITY` (applied in the migration) so it also holds
    // against the table-owning migration role, not only app_runtime.
    pgPolicy("activityevent_append_only_update", {
      as: "restrictive",
      for: "update",
      using: sql`false`,
    }),
    pgPolicy("activityevent_append_only_delete", {
      as: "restrictive",
      for: "delete",
      using: sql`false`,
    }),
  ],
);
