import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Wrapped in (select ...): Supabase's RLS-performance guidance — otherwise Postgres re-evaluates
// current_setting() per row instead of once per query (F0 precedent, casting/audit schema.ts).
const HOUSEHOLD_MATCH = sql`household_id = (select current_setting('app.household_id', true)::uuid)`;
// Household/HouseholdSettings are keyed BY household_id (or id, for Household itself) — the
// tenant anchor is the row's own primary key here, not a separate column.
const IS_OWN_HOUSEHOLD = sql`id = (select current_setting('app.household_id', true)::uuid)`;
const IS_OWN_HOUSEHOLD_SETTINGS = sql`household_id = (select current_setting('app.household_id', true)::uuid)`;

// data-model.md "ResidentProfile" — three states, no reopen in F1's scope (transitions.ts).
export const residentProfileStatusEnum = pgEnum("resident_profile_status", [
  "prepared",
  "active",
  "moved_out",
]);

// data-model.md "Membership" — orthogonal to is_resident (C-1.3); no hierarchy.
export const membershipRoleEnum = pgEnum("membership_role", [
  "household_admin",
  "moderator",
  "member",
]);

// data-model.md "Account". `household_id` is a deliberate denormalization not in
// docs/domain/identity.md's field list — added under the same documented pattern
// docs/domain/casting.md already uses for Application.household_id ("redundant zur Runde, aber
// Anker der RLS-Policy (ADR-004)"), required by G-C5 ("jede personenbezogene Tabelle führt
// household_id NOT NULL") and satisfiable without a chicken-and-egg problem because the household
// is always known at account-creation time in both the registration flow (created together) and
// the join flow (F2, the code identifies the household up front).
export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
    // Required + unique for the household-admin account (FR-1.1); nullable + a derived,
    // non-deliverable address for a resident account (research.md §2). Uniqueness is enforced at
    // the Supabase Auth layer (the actual sign-in identifier), not duplicated here as a DB
    // constraint — this column is a local cache of what Auth already guarantees unique.
    email: text("email"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    locale: text("locale").notNull().default("de"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("account_household_id_idx").on(t.householdId),
    pgPolicy("account_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
  ],
);

// data-model.md "Session". `household_id` denormalized for the same reason as Account's.
export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    accountId: uuid("account_id").notNull(),
    // Set once at sign-in, never written again (ADR-013/FR-1.6). G-D14(b) requires rejection even
    // via raw SQL, so this is enforced by a BEFORE UPDATE trigger
    // (drizzle/0006_session_acting_profile_id_immutable.sql), not application discipline alone —
    // the same reasoning ADR-004 already applies to authorization generally: a rule that only
    // holds when the application code is right is not the rule G-C7/G-D14 ask for.
    actingProfileId: uuid("acting_profile_id"),
    rememberMe: boolean("remember_me").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("session_household_id_idx").on(t.householdId),
    index("session_account_id_idx").on(t.accountId),
    pgPolicy("session_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
  ],
);

// data-model.md "Household" — the tenant root. RLS keys off `id` itself, not `household_id`.
export const household = pgTable(
  "household",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // "keine Sicherheitsgrenze, nur Zuordnung" (C-1.4) — the account that registered.
    ownerAccountId: uuid("owner_account_id").notNull(),
    contactEmail: text("contact_email").notNull(),
    joinCode: text("join_code").notNull(),
    joinCodeRotatedAt: timestamp("join_code_rotated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  () => [
    pgPolicy("household_is_own_household", {
      as: "permissive",
      for: "all",
      using: IS_OWN_HOUSEHOLD,
      withCheck: IS_OWN_HOUSEHOLD,
    }),
  ],
);

// data-model.md "HouseholdSettings" — 1:1 with Household; household_id is this table's own PK.
export const householdSettings = pgTable(
  "household_settings",
  {
    householdId: uuid("household_id").primaryKey(),
    // The four fields FR-1.21's procedure lock governs — locked while any round is `open`.
    scaleWeights: jsonb("scale_weights")
      .notNull()
      .default({ no: 0, rather_not: 1, good: 3, definitely: 5 }),
    favoriteBudgetFactor: numeric("favorite_budget_factor").notNull().default("1.5"),
    hideResultsUntilVoted: boolean("hide_results_until_voted").notNull().default(true),
    quorumShare: numeric("quorum_share").notNull().default("0.5"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedByAccountId: uuid("updated_by_account_id").notNull(),
  },
  () => [
    pgPolicy("household_settings_is_own_household", {
      as: "permissive",
      for: "all",
      using: IS_OWN_HOUSEHOLD_SETTINGS,
      withCheck: IS_OWN_HOUSEHOLD_SETTINGS,
    }),
  ],
);

// data-model.md "ResidentProfile".
export const residentProfile = pgTable(
  "resident_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
    displayName: text("display_name").notNull(),
    status: residentProfileStatusEnum("status").notNull().default("prepared"),
    movedInOn: date("moved_in_on"),
    movedOutOn: date("moved_out_on"),
    roomId: uuid("room_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("resident_profile_household_id_idx").on(t.householdId),
    // FR-1.4: unique among status != moved_out profiles within a household — a partial unique
    // index, not a plain unique constraint, so a released name is reusable per AC-1.4.
    uniqueIndex("resident_profile_display_name_active_idx")
      .on(t.householdId, t.displayName)
      .where(sql`status != 'moved_out'`),
    pgPolicy("resident_profile_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
  ],
);

// data-model.md "Membership" — Account × Household, orthogonal is_resident/role (C-1.3).
export const membership = pgTable(
  "membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
    accountId: uuid("account_id").notNull(),
    // Set = acts as a resident profile; null = household account (ADR-013 ties this permanently
    // to the account type).
    residentProfileId: uuid("resident_profile_id"),
    isResident: boolean("is_resident").notNull(),
    role: membershipRoleEnum("role").notNull(),
    // F1-relevant subset of FR-1.8's permission list — export/retention permissions are later
    // features' concern.
    permissions: text("permissions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    joinedViaCode: text("joined_via_code"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("membership_household_id_idx").on(t.householdId),
    index("membership_account_id_idx").on(t.accountId),
    pgPolicy("membership_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
  ],
);
