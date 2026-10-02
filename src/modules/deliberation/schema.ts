import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgPolicy,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { OWN_PROFILE, PROFILE_PRESENT } from "../../db/rls-predicates";
import { VOTE_VALUES } from "./vote-values";

// Wrapped in (select ...): same shape as every other schema file's HOUSEHOLD_MATCH.
const HOUSEHOLD_MATCH = sql`household_id = (select current_setting('app.household_id', true)::uuid)`;

// Round one (invite) and round two (offer) use the same scale and the same table
// (docs/domain/deliberation.md). Only `invite` is written in v0.1.
export const voteStageEnum = pgEnum("vote_stage", ["invite", "offer"]);
export const voteValueEnum = pgEnum("vote_value", VOTE_VALUES);

// One rating per (application, resident profile, stage), C-4.5. There are no foreign keys, like
// every table here. The rules a vote must satisfy (round open, eligible voter, votable and paired
// application, not the voter's own application) are enforced by the trigger `vote_guard` in
// drizzle/0028, hand-written because drizzle-kit does not generate triggers; the repository only
// maps its refusals to typed codes. `application_keeps_votes` (0028) is the parent side.
export const vote = pgTable(
  "vote",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(), // redundant zur Runde, Anker der RLS-Policy (ADR-004)
    roundId: uuid("round_id").notNull(),
    applicationId: uuid("application_id").notNull(),
    residentProfileId: uuid("resident_profile_id").notNull(),
    stage: voteStageEnum("stage").notNull(),
    value: voteValueEnum("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (t) => [
    index("vote_household_id_idx").on(t.householdId),
    index("vote_round_id_idx").on(t.roundId),
    uniqueIndex("vote_application_profile_stage_idx").on(
      t.applicationId,
      t.residentProfileId,
      t.stage,
    ),
    pgPolicy("vote_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
    // G-D15 (b): a session with no resident profile acting sees and writes no vote.
    pgPolicy("vote_requires_resident_profile", {
      as: "restrictive",
      for: "all",
      using: PROFILE_PRESENT,
      withCheck: PROFILE_PRESENT,
    }),
    // A vote is written only as the voter's own profile. SELECT and DELETE stay household plus
    // profile: F5 decides who reads other votes, F3 change 4's delete path removes them.
    pgPolicy("vote_own_profile_insert", {
      as: "restrictive",
      for: "insert",
      withCheck: OWN_PROFILE,
    }),
    pgPolicy("vote_own_profile_update", {
      as: "restrictive",
      for: "update",
      using: OWN_PROFILE,
      withCheck: OWN_PROFILE,
    }),
  ],
);
