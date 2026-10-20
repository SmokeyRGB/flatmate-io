-- F3 change 4 (application-deletion), design D2/D7. The CONTRACT half: `application.deleted_at` is
-- dropped (Q-8, R-3.5). A deleted application is a deleted row. Applied by a human on the shared
-- dev database AFTER the PR merged, once no deployed code declares the column (drizzle names every
-- declared column, so main would fail on every select from application otherwise). The harness
-- refuses DROP COLUMN, which is the other reason it is the human's.
--
-- Re-runnable: IF EXISTS. No function, trigger, policy, view or script names the column.
--
-- Rollback (a note, not a script): ALTER TABLE "application" ADD COLUMN IF NOT EXISTS
-- "deleted_at" timestamp with time zone. The values were all null (nothing ever set it).

ALTER TABLE "application" DROP COLUMN IF EXISTS "deleted_at";
