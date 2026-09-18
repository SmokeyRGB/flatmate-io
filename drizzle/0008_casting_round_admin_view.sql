-- ADR-014/research.md §3: the column-restriction half of "a profile-less session sees a round's
-- identity/lifecycle but nothing derived from Application." RLS (casting_round_household_isolation)
-- already restricts by household_id; this view additionally restricts by COLUMN, since Postgres
-- RLS operates per-row, not per-column. The application-layer policy object
-- (src/modules/casting/repository.ts) is what actually confines a profile-less session's calls to
-- this view -- the view alone is not the enforcement, matching G-C7's "a view is not itself a
-- defense against direct base-table access" (the raw-SQL half of G-D15 queries the base table
-- directly, not this view).
CREATE VIEW casting_round_admin_view WITH (security_invoker = true) AS
SELECT
  id,
  household_id,
  title,
  status,
  room_ids,
  opened_at,
  closed_at,
  phase_deadline_at,
  retention_until,
  retention_extensions,
  retention_warned_at
FROM casting_round;

GRANT SELECT ON casting_round_admin_view TO app_runtime;
