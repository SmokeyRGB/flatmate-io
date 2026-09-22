-- join-by-link design.md Decision 13 (human decision, 2026-09-22): a join link may optionally be
-- BOUND to one prepared resident profile of its own household. Step 1 below is plain generated
-- SQL (drizzle-kit generate diffed schema.ts's new column correctly); steps 2-3 are hand-written
-- because this migration replaces two SECURITY DEFINER functions, which a plain schema diff cannot
-- express, following drizzle/0013 and drizzle/0014's structure and comment style for this
-- project's "deliberate hole" functions.
--
--
-- *** WHY DROP-THEN-CREATE AND NOT `CREATE OR REPLACE` (corrected 2026-09-22 before first run) ***
-- Both functions gain two output columns, and Postgres treats the shape of a RETURNS TABLE as part
-- of the return type: `CREATE OR REPLACE FUNCTION` refuses it outright with "cannot change return
-- type of existing function / HINT: Use DROP FUNCTION ... first". The first draft of this migration
-- used CREATE OR REPLACE and would have failed on both statements at the moment a human ran them.
-- It was not caught by the apply because the permission layer refuses these statements before they
-- reach the database, so an agent never sees the error — which is precisely why the SQL handed to a
-- human has to be read, not merely written.
--
-- Nothing existing is dropped or retyped — this migration is purely ADDITIVE. Rollback is clean:
-- restoring drizzle/0013's function bodies (drop-then-create again) and DROPping the column returns the
-- database to its previous state.

-- Step 1: the column itself. Nullable — null is every link this table has ever held (a NEUTRAL
-- link, unchanged behaviour); a set value BINDS the link to one resident_profile row. No FOREIGN
-- KEY (this schema has none, by design — the two-Supabase-project split) and no CHECK that the
-- named profile belongs to the same household or is `prepared` — both are enforced in
-- identity/repository.ts's issueJoinCodeTx (design.md Decision 13), the same place every other
-- cross-row invariant on this table is enforced (e.g. the code's own uniqueness, via retry-on-
-- collision rather than a DB-level guarantee beyond the UNIQUE index).
-- IF NOT EXISTS so the whole file can be re-run: the agent applying this migration got the
-- column through but had both function statements below refused by the permission layer, so a
-- human runs the file afterwards and would otherwise hit 42701 on this line. Every other
-- statement here is already idempotent (DROP ... IF EXISTS, then CREATE; REVOKE/GRANT).
ALTER TABLE "join_code_issuance" ADD COLUMN IF NOT EXISTS "resident_profile_id" uuid;
--> statement-breakpoint

-- Step 2: resolve_join_code, replaced to also return the bound profile's id and display name.
-- STABLE, non-consuming — unchanged in every other respect from drizzle/0013's version. A NULL
-- resident_profile_id on the row means a neutral link, and the two new output columns are simply
-- NULL for it (LEFT JOIN, not INNER) — the repository layer's JoinCodeResolution type carries this
-- as an optional field, never a second lookup.
DROP FUNCTION IF EXISTS resolve_join_code(text);
--> statement-breakpoint
CREATE FUNCTION resolve_join_code(p_code text) RETURNS TABLE (
  household_id uuid,
  issuance_id uuid,
  household_name text,
  bound_resident_profile_id uuid,
  bound_resident_display_name text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT h.id, jci.id, h.name, rp.id, rp.display_name
  FROM "join_code_issuance" jci
  JOIN "household" h ON h.id = jci.household_id
  -- The household predicate is NOT redundant with issueJoinCodeTx's check. This function is
  -- SECURITY DEFINER, so it runs past RLS, and it answers an UNAUTHENTICATED caller; there are
  -- no foreign keys in this schema, so nothing but application code keeps this column honest.
  -- Were a binding ever wrong — a bug, a hand-edited row, a bad backfill — the two output
  -- columns would disclose another household's profile id and display name to a stranger
  -- holding a code. With the predicate they come back null instead, which is the same outcome
  -- as a neutral link. ADR-004's rule applies here as much as to the session trigger: an
  -- invariant that holds only while the application is right is not the invariant G-C asks for.
  LEFT JOIN "resident_profile" rp
    ON rp.id = jci.resident_profile_id AND rp.household_id = jci.household_id
  WHERE jci.code = p_code
    AND jci.deleted_at IS NULL
    AND jci.expires_at > now()
    AND jci.uses < jci.max_uses
    AND h.deleted_at IS NULL
    -- A BOUND link is valid only while the profile it names is still claimable, in its own
    -- household (third review of PR #17). Two live links may legitimately name the same prepared
    -- profile — a moderator re-sending an invitation — so the rule cannot live at issue time; it
    -- belongs here, where a link is judged. Once the first is redeemed the profile is `active` and
    -- every other link naming it goes dead, which is also the honest outcome for the visitor: the
    -- page refuses on open instead of greeting them by name and failing at submit.
    --
    -- `rp.id IS NOT NULL` additionally makes a CORRUPT binding (one pointing outside this
    -- household, which the join above already refuses to match) kill the link outright rather than
    -- letting it behave as a neutral one — a link meant for a named person must never silently
    -- become an open invitation.
    AND (jci.resident_profile_id IS NULL OR (rp.id IS NOT NULL AND rp.status = 'prepared'))
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_join_code(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_join_code(text) TO app_runtime;
--> statement-breakpoint

-- Step 3: claim_join_code, replaced the same way — the single conditional UPDATE ... RETURNING
-- (design.md Decision 1) is unchanged; only the returned columns grow, via the same LEFT JOIN
-- against resident_profile as resolve_join_code above. The row's own status transition (prepared
-- -> active, for a bound claim) and its Account/Membership are still the caller's job
-- (joinHousehold, auth.ts) inside the SAME transaction as this claim — this function only ever
-- decides and counts, never writes resident_profile itself.
DROP FUNCTION IF EXISTS claim_join_code(text);
--> statement-breakpoint
CREATE FUNCTION claim_join_code(p_code text) RETURNS TABLE (
  household_id uuid,
  issuance_id uuid,
  household_name text,
  bound_resident_profile_id uuid,
  bound_resident_display_name text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public VOLATILE AS $$
  WITH claimed AS (
    UPDATE "join_code_issuance"
       SET uses = uses + 1
     WHERE code = p_code
       AND deleted_at IS NULL
       AND expires_at > now()
       AND uses < max_uses
       -- Same rule as resolve_join_code, evaluated in the SAME statement as the increment so a
       -- bound link whose profile is already claimed cannot be spent. This does NOT by itself
       -- settle two links racing for one profile: they update DIFFERENT issuance rows, so nothing
       -- serializes them here and both EXISTS checks can still see `prepared`. The conditional
       -- UPDATE on resident_profile in joinHousehold's bound branch is what decides that case — it
       -- takes a row lock on the profile, so the loser matches zero rows and its whole transaction,
       -- this increment included, rolls back.
       AND (
         resident_profile_id IS NULL
         OR EXISTS (
           SELECT 1
           FROM "resident_profile" rp
           WHERE rp.id = "join_code_issuance".resident_profile_id
             AND rp.household_id = "join_code_issuance".household_id
             AND rp.status = 'prepared'
         )
       )
    RETURNING household_id, id AS issuance_id, resident_profile_id
  )
  SELECT h.id, claimed.issuance_id, h.name, rp.id, rp.display_name
  FROM claimed
  JOIN "household" h ON h.id = claimed.household_id
  -- Same household predicate, same reasoning as resolve_join_code above.
  LEFT JOIN "resident_profile" rp
    ON rp.id = claimed.resident_profile_id AND rp.household_id = claimed.household_id
  WHERE h.deleted_at IS NULL
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION claim_join_code(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION claim_join_code(text) TO app_runtime;
