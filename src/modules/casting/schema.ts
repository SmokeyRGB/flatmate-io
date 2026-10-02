import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { PROFILE_PRESENT } from "../../db/rls-predicates";

// Wrapped in (select ...): Supabase's RLS-performance guidance — same shape as F0's Application
// policy below and identity/schema.ts's HOUSEHOLD_MATCH.
const HOUSEHOLD_MATCH = sql`household_id = (select current_setting('app.household_id', true)::uuid)`;


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

// S-38 axis 1: the intake path. Set by the system, never taken from a submission. No default
// anywhere (C-3.2, AC-3.7). Only `manual_form` is written by this slice.
export const applicationSourceEnum = pgEnum("application_source", [
  "manual_form",
  "paste_parser",
  "availability_link",
  "portal_import",
]);

// S-38 axis 2: whose data it is, i.e. the legal bearer of the Art. 13/14 choice (Compliance
// §4.4). Independent of the intake path (C-3.10). No default anywhere (C-3.2, AC-3.7): a
// submission without it is refused, never defaulted.
export const applicationCollectedFromEnum = pgEnum("application_collected_from", [
  "data_subject",
  "third_party",
]);

export const application = pgTable(
  "application",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(), // Anker der RLS-Policy (ADR-004)
    // NOT NULL since drizzle/0023 (A-3.4, C-3.11). The pairing with `household_id` (the round must
    // be a round of the SAME household) is enforced by the trigger
    // `application_round_same_household` in drizzle/0023, hand-written because drizzle-kit does
    // not generate triggers (design D12); drizzle/0025 locks the round row through the check, and
    // drizzle/0026 refuses to delete or re-home a round that applications belong to. There are no
    // foreign keys.
    roundId: uuid("round_id").notNull(),
    state: applicationStateEnum("state").notNull(),
    stateChangedAt: timestamp("state_changed_at", { withTimezone: true }).notNull().defaultNow(),
    becameResidentId: uuid("became_resident_id"),
    createdByAccountId: uuid("created_by_account_id").notNull(),
    createdByProfileId: uuid("created_by_profile_id").notNull(),
    // 180 days (or the household's `retention_days`) from `CastingRound.closed_at`, not from
    // `created_at` — corrected 2026-09-24 to match docs/06-Compliance-Anhang.md §5.3, the
    // authoritative source. No DB default; nothing sets it yet (the retention slice will).
    retentionUntil: date("retention_until"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Applicant columns of docs/domain/casting.md §2.2. Personal data (data-inventory.yml).
    // Empty optional fields are NULL, never '' (assumption A4).
    applicantName: text("applicant_name").notNull(),
    age: integer("age"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    contactOther: text("contact_other"),
    messageRaw: text("message_raw"),
    attributes: jsonb("attributes"),
    // NO .default() on either axis (C-3.2, AC-3.7).
    source: applicationSourceEnum("source").notNull(),
    collectedFrom: applicationCollectedFromEnum("collected_from").notNull(),
  },
  (t) => [
    // C-3.14 limits as CHECKs (drizzle/0023, and 0025 for the attributes). Every value is written as literal SQL, never
    // interpolated as `${value}`: drizzle-kit keeps only the SQL text of a check() and drops its
    // bound parameters, which would leave `$1` in the migration (design D1).
    check(
      "application_applicant_name_length",
      sql`char_length(btrim(applicant_name)) BETWEEN 1 AND 200`,
    ),
    // btrim strips spaces only; this makes tabs, line breaks and NBSP-only names fail as well.
    check("application_applicant_name_not_blank", sql`applicant_name ~ '[^[:space:]]'`),
    check(
      "application_contact_email_length",
      sql`contact_email IS NULL OR char_length(contact_email) <= 254`,
    ),
    check(
      "application_contact_phone_length",
      sql`contact_phone IS NULL OR char_length(contact_phone) <= 50`,
    ),
    check(
      "application_contact_other_length",
      sql`contact_other IS NULL OR char_length(contact_other) <= 200`,
    ),
    check(
      "application_message_raw_length",
      sql`message_raw IS NULL OR char_length(message_raw) <= 4000`,
    ),
    check("application_age_range", sql`age IS NULL OR age BETWEEN 0 AND 150`),
    // drizzle/0025: the list shape (1-10 entries) AND the per-element limits (an object with exactly
    // the string keys label 1-60 and value 1-500, after btrim) are now enforced by the database,
    // through the IMMUTABLE function application_attributes_valid (a CHECK cannot hold a
    // subquery, a function can iterate). The repository parser mirrors it so a normal refusal
    // never reaches the database. The limits are the C-3.14 values of APPLICATION_LIMITS.
    check("application_attributes_shape", sql.raw("application_attributes_valid(attributes)")),
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
    // G-D15 (openspec application-requires-resident-profile, design Decision 1): a household-
    // account session (no resident profile acting) SHALL NOT read, count, insert, update or
    // delete any Application row — not through the repository, and not by raw SQL under
    // app_runtime. RESTRICTIVE + FOR ALL: Postgres ANDs this with the PERMISSIVE household
    // policy above, so household isolation is unchanged and this can only narrow access further.
    // FOR ALL rather than FOR SELECT: created_by_profile_id is NOT NULL (O-17), so a
    // household-account session has no legitimate write either — an insert fails loudly
    // (WITH CHECK), an update/delete matches zero rows.
    pgPolicy("application_requires_resident_profile", {
      as: "restrictive",
      for: "all",
      using: PROFILE_PRESENT,
      withCheck: PROFILE_PRESENT,
    }),
  ],
);

// data-model.md "Room" — six states (FR-1.10), independent of round state (FR-1.11).
export const roomStatusEnum = pgEnum("room_status", [
  "planned",
  "open",
  "promised",
  "occupied",
  "on_hold",
  "not_available",
]);

export const room = pgTable(
  "room",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
    label: text("label").notNull(),
    status: roomStatusEnum("status").notNull().default("planned"),
    currentResidentProfileId: uuid("current_resident_profile_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("room_household_id_idx").on(t.householdId),
    pgPolicy("room_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
  ],
);

// data-model.md "CastingRound" — five states (FR-1.13), deliberately thin (C-1.2).
export const castingRoundStatusEnum = pgEnum("casting_round_status", [
  "draft",
  "open",
  "paused",
  "closed",
  "archived",
]);

export const castingRound = pgTable(
  "casting_round",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
    title: text("title").notNull(),
    // LOCK ORDER: membership (FOR SHARE) -> household_settings -> casting_round -> room -> application.
    // Every writer of `status` takes FOR UPDATE on the row (openRoundTx does), and the
    // household_settings row is locked before it (`openRoundTx`). captureApplication
    // reads it FOR SHARE, and the pair is serialised only while every status writer locks the row
    // (design D4). A future close or pause must do the same.
    // Also (design D12): application.round_id points here without a foreign key. No path may
    // delete a casting_round or change its household_id without considering the applications
    // pointing at it; the pairing trigger in drizzle/0023 checks only writes to application.
    status: castingRoundStatusEnum("status").notNull().default("draft"),
    roomIds: uuid("room_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    // Copy of HouseholdSettings' four locked fields, frozen at draft -> open (FR-1.15) — a copy,
    // never a reference (C-1.1). Null until opened.
    settingsSnapshot: jsonb("settings_snapshot"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    phaseDeadlineAt: timestamp("phase_deadline_at", { withTimezone: true }),
    // Not exercised in F1 (no `closed` transition in this slice's scope) — kept as a placeholder
    // column per data-model.md, populated when a later feature implements `open -> closed`.
    quorumDenominatorFrozen: integer("quorum_denominator_frozen"),
    retentionUntil: date("retention_until"),
    retentionExtensions: text("retention_extensions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    retentionWarnedAt: timestamp("retention_warned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("casting_round_household_id_idx").on(t.householdId),
    pgPolicy("casting_round_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
  ],
);

// data-model.md "RoundParticipation" — one row per profile per round; the quorum/participation
// denominator (FR-1.17).
// FR-1.18 (revised 2026-09-17): `joined_after_open` is now the default path — a household_trigger
// (drizzle/0009_*.sql) fires when a resident becomes active while a round is open, and adds them
// automatically. `added_manually` remains for a moderator's manual correction of a case the
// trigger missed — a fallback, not the primary path anymore.
export const roundParticipationSourceEnum = pgEnum("round_participation_source", [
  "snapshot_at_open",
  "added_manually",
  "joined_after_open",
]);

export const roundParticipation = pgTable(
  "round_participation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id").notNull(),
    // Denormalized, not in docs/domain/casting.md's field list — added under the same documented
    // pattern already used for Application.household_id ("redundant zur Runde, aber Anker der
    // RLS-Policy (ADR-004)").
    householdId: uuid("household_id").notNull(),
    residentProfileId: uuid("resident_profile_id").notNull(),
    source: roundParticipationSourceEnum("source").notNull(),
    canVote: boolean("can_vote").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [
    index("round_participation_household_id_idx").on(t.householdId),
    index("round_participation_round_id_idx").on(t.roundId),
    // The trigger (auto_join_open_rounds) and addResidentToRound's manual insert are two
    // independent writers into this table for the same pairing — this is what stops either of
    // them from producing a second active denominator row for a resident already in the round.
    uniqueIndex("round_participation_active_pairing_idx")
      .on(t.roundId, t.residentProfileId)
      .where(sql`removed_at IS NULL`),
    pgPolicy("round_participation_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
  ],
);
