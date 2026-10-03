-- HUMAN HAND-OFF. Run this whole file in the Supabase SQL editor on flatmate-io-dev,
-- as the migration role (postgres). Do not apply it through DATABASE_URL: that login is
-- app_runtime and cannot REVOKE. Production only at go-live, after the rest of the chain.
-- Re-runnable: every REVOKE and ALTER DEFAULT PRIVILEGES is a no-op once the privilege is gone.
--
-- anon and authenticated hold explicit grants from Supabase's default privileges, so the
-- earlier migrations' REVOKE ... FROM PUBLIC does not remove them. service_role and
-- app_runtime are not touched. casting_round_admin_view loses its anon/authenticated
-- grants with the other relations; the app reads that view only as app_runtime
-- (src/modules/casting/repository.ts), never through PostgREST.
--
-- rls_auto_enable() is Supabase's, not ours. On flatmate-io-dev it is the function behind
-- event trigger ensure_rls (pg_event_trigger.evtowner = postgres, pg_proc.proowner = postgres,
-- prosecdef = true), and its ACL grants EXECUTE to PUBLIC as well as to anon and authenticated.
-- The revoke below drops those three and leaves postgres's own EXECUTE in place. PostgreSQL
-- fires the trigger as part of the DDL command (https://www.postgresql.org/docs/current/event-trigger-definition.html);
-- it does not document an EXECUTE check against the DDL caller. The function is SECURITY
-- DEFINER, so the body runs as postgres, who keeps EXECUTE. Skipped when the function is absent.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
-- Functions: only anon/authenticated, never PUBLIC wholesale. Policies and CHECKs call
-- non-definer helpers as app_runtime, and those helpers stay executable through PUBLIC.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
--> statement-breakpoint
-- drizzle/0026 never revoked the EXECUTE that PUBLIC gets on every new function, so anon and
-- authenticated still reach this SECURITY DEFINER function through PUBLIC. It is only ever a
-- trigger function: EXECUTE is checked when a trigger is created, not when it fires.
REVOKE ALL ON FUNCTION public.casting_round_keeps_applications() FROM PUBLIC;
--> statement-breakpoint
-- Future objects created by postgres start closed to the Data API roles.
-- Read-only pg_default_acl on flatmate-io-dev: postgres IN SCHEMA public grants
-- anon/authenticated on tables ('r'), functions ('f') and sequences ('S').
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
--> statement-breakpoint
-- supabase_admin has the same three public-schema defaults (same catalog query). The SQL
-- editor cannot always alter another role's defaults. insufficient_privilege is caught so
-- the file still finishes; objects this project creates are owned by postgres.
DO $$
BEGIN
  BEGIN
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'leaving supabase_admin default privileges unchanged: %', SQLERRM;
  END;
END $$;
