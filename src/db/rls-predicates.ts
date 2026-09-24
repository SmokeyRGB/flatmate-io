import { sql } from "drizzle-orm";

// The one definition of "a resident profile is acting in this session", for every RLS policy that
// gates on it (G-D15 / ADR-014). Shared rather than repeated per schema file, because the
// `nullif` is the part a copy loses: on a pooled connection whose earlier transaction set
// `app.profile_id`, a later transaction that leaves it unset reads it back as '' rather than
// NULL (see session-context.ts), and a bare `IS NOT NULL` would admit that household-account
// session. Same body as docs/domain/invarianten.md §5.5's `app_profile_id()`. Wrapped in
// (select ...) so Postgres evaluates it once per query, not per row (Supabase RLS-performance
// guidance, as with each schema file's HOUSEHOLD_MATCH).
//
// Imports only drizzle-orm's `sql`, never ./client: schema files load this under drizzle-kit,
// which must not open a database connection.
export const PROFILE_PRESENT = sql`(select nullif(current_setting('app.profile_id', true), '')) IS NOT NULL`;
