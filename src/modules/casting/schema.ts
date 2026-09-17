import { sql } from "drizzle-orm";
import { date, index, pgEnum, pgPolicy, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

// Eleven states declared in docs/03-PRD.md §4.2.1 — the maßgeblich transition table (FR-0.9):
// seven main-path states (new → screened → invited → scheduled → interviewed → offer_made →
// moved_in) plus four side states (rejected_by_household, declined_by_applicant, withdrawn,
// archived). Values are not invented here; they are the source's own state names, reproduced
// because Postgres/Drizzle require the literal value list to define the enum type.
export const applicationStateEnum = pgEnum("application_state", [
  "new",
  "screened",
  "invited",
  "scheduled",
  "interviewed",
  "offer_made",
  "moved_in",
  "rejected_by_household",
  "declined_by_applicant",
  "withdrawn",
  "archived",
]);

export const application = pgTable(
  "application",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(), // Anker der RLS-Policy (ADR-004)
    roundId: uuid("round_id"),
    state: applicationStateEnum("state").notNull(),
    stateChangedAt: timestamp("state_changed_at", { withTimezone: true }).notNull().defaultNow(),
    becameResidentId: uuid("became_resident_id"),
    createdByAccountId: uuid("created_by_account_id").notNull(),
    createdByProfileId: uuid("created_by_profile_id").notNull(),
    // Default `created_at + 180 Tage` — docs/domain/casting.md §7/line 124.
    retentionUntil: date("retention_until"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // Every RLS policy filters by household_id — an unindexed scan here would be the single
    // biggest hot path in the app (Supabase's own RLS-performance guidance).
    index("application_household_id_idx").on(t.householdId),
    // FR-0.2: RLS active with at least one policy, on every table carrying household_id.
    // Adding a policy auto-enables RLS (verified, drizzle-orm docs, research.md §2).
    pgPolicy("application_household_isolation", {
      as: "permissive",
      for: "all",
      // Wrapped in (select ...): Supabase's RLS-performance guidance — otherwise Postgres
      // re-evaluates current_setting() per row instead of once per query (confirmed via this
      // project's own performance advisor after the first migration, 2026-09-16).
      using: sql`household_id = (select current_setting('app.household_id', true)::uuid)`,
      withCheck: sql`household_id = (select current_setting('app.household_id', true)::uuid)`,
    }),
  ],
);
