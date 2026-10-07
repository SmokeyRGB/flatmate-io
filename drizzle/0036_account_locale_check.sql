-- language-switch D4: `account.locale` (text NOT NULL DEFAULT 'de' since 0004, never read until this
-- change) is limited to the two UI languages the application offers, whichever path writes it,
-- raw SQL as app_runtime included. Every existing row is 'de' (no path ever wrote anything else),
-- so the ADD validates. No enum is involved, no DROP COLUMN and no SECURITY DEFINER, so the agent
-- harness applies it. Re-runnable: drop-then-add. Rollback: DROP CONSTRAINT account_locale_check.
ALTER TABLE "account" DROP CONSTRAINT IF EXISTS "account_locale_check";--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_locale_check" CHECK ("account"."locale" in ('de','en'));
