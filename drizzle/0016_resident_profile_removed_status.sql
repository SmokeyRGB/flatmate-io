-- final-member-removal design.md Decision 3: the enum value and its first use must be two
-- migrations -- Postgres refuses "unsafe use of new value" if a value added here is used in the
-- same transaction. This file adds the value and nothing else. 0017 does the rest (backfill,
-- index rebuild, trigger) once this value is visible in a later transaction.
ALTER TYPE "public"."resident_profile_status" ADD VALUE IF NOT EXISTS 'removed';
