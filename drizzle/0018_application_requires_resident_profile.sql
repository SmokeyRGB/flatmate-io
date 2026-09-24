-- G-D15 database half (openspec application-requires-resident-profile, design.md Decisions 1/3/7):
-- the household policy on `application` (drizzle/0000/0001) is keyed on household_id alone, so a
-- household-account session (no resident profile acting) could run raw SQL as app_runtime and
-- `SELECT count(*) FROM application` — the exact aggregate ADR-014 names as enough to defeat V-1
-- over the shared household password. These two RESTRICTIVE policies close that: a row of
-- `application`, or of `activity_event` whose subject_type is 'application', is visible or
-- writable only when the session's `app.profile_id` setting is present and non-empty. RESTRICTIVE
-- + FOR ALL/FOR SELECT are ANDed with the existing PERMISSIVE policies, so household isolation is
-- unchanged and this can only narrow access further.
--
-- `nullif(current_setting('app.profile_id', true), '')`, not a bare `IS NOT NULL`: on a pooled
-- connection whose earlier transaction set `app.profile_id`, a later transaction that leaves it
-- unset reads it back as `''`, not real SQL NULL (tests/integration/raw-sql/pool-reuse.test.ts;
-- src/db/session-context.ts). A predicate missing the `nullif` would admit exactly that session.
--
-- Each statement is prefixed with DROP POLICY IF EXISTS so this file survives a partial apply
-- (drizzle-kit's own generated statements are additive-only and would otherwise fail if re-run).
-- Both statements are additive policies with no data change and no constraint interaction, so the
-- order between them is irrelevant.
DROP POLICY IF EXISTS "application_requires_resident_profile" ON "application";--> statement-breakpoint
CREATE POLICY "application_requires_resident_profile" ON "application" AS RESTRICTIVE FOR ALL TO public USING ((select nullif(current_setting('app.profile_id', true), '')) IS NOT NULL) WITH CHECK ((select nullif(current_setting('app.profile_id', true), '')) IS NOT NULL);--> statement-breakpoint
DROP POLICY IF EXISTS "activityevent_application_requires_resident_profile" ON "activity_event";--> statement-breakpoint
CREATE POLICY "activityevent_application_requires_resident_profile" ON "activity_event" AS RESTRICTIVE FOR SELECT TO public USING (subject_type <> 'application' OR (select nullif(current_setting('app.profile_id', true), '')) IS NOT NULL);
