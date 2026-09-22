-- join-by-link (FR-2.28): the join route's attempt limit. Hand-written (drizzle-kit generate
-- --custom) because this migration creates a SECURITY DEFINER function, which a plain schema diff
-- cannot express.
--
-- design.md Decision 3: one table, no household_id (EC-2.14 — the limit is on the ROUTE, a guess
-- is tested against every live link at once, so a per-household limit would divide by exactly the
-- number an attack multiplies by), RLS enabled with ZERO policies (denies every row to
-- app_runtime directly), and exactly one SECURITY DEFINER function as its only door.
--
-- Unlike drizzle/0013_join_code_issuance.sql, this migration is purely ADDITIVE — nothing is
-- dropped, nothing is rewritten. Rollback is clean: dropping the function and the table returns
-- the database to its previous state, at the cost of the attempt counters, which are ephemeral by
-- design (24h retention, enforced by the function itself, not a separate job).

-- Step 1: the table itself.
CREATE TABLE "join_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_hash" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "join_attempt_source_hash_attempted_at_idx" ON "join_attempt" USING btree ("source_hash","attempted_at");
--> statement-breakpoint

-- Step 2: RLS enabled, deliberately with NO policy — this table has no tenant to key a policy on
-- (design.md Decision 3), so "enabled, no policy" denies every row to app_runtime directly rather
-- than inventing a tenant for a row that has none. The function below is the only door.
ALTER TABLE "join_attempt" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Step 3: record_join_attempt — SECURITY DEFINER, VOLATILE, SET search_path = public, following
-- drizzle/0005 and drizzle/0013's structure and comment style for this project's "deliberate
-- hole" functions. PL/pgSQL (not LANGUAGE sql) is required here: the prune, the insert and the
-- count must run as separate statements that each see the previous one's effects — a `WITH`-CTE
-- form (as resolve_join_code/claim_join_code use) would have every sub-statement see the same
-- snapshot as of query start and could not count the row it just inserted.
--
-- Every attempt is recorded, INCLUDING refused ones (design.md Decision 3): a source that keeps
-- hammering keeps its window full rather than getting a fresh burst each time the oldest row
-- rolls off. Retention (rows older than 24h) is pruned on every call, as a side effect of the
-- only write path — the table stays small enough for that to be cheap, and a pruning rule that
-- runs here cannot rot the way a scheduled job nobody scheduled does.
CREATE FUNCTION record_join_attempt(p_source_hash text, p_window_seconds int, p_limit int) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE AS $$
DECLARE
  v_count int;
BEGIN
  DELETE FROM "join_attempt" WHERE attempted_at < now() - interval '24 hours';

  INSERT INTO "join_attempt" (source_hash) VALUES (p_source_hash);

  SELECT count(*) INTO v_count
  FROM "join_attempt"
  WHERE source_hash = p_source_hash
    AND attempted_at > now() - make_interval(secs => p_window_seconds);

  RETURN v_count <= p_limit;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION record_join_attempt(text, int, int) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION record_join_attempt(text, int, int) TO app_runtime;
