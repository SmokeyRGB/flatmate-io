-- candidate-detail D5: the fifth voting-procedure setting, `reveal_vote_authorship` (FR-5.21a, human
-- decision R-1). Whether a candidate's detail names the voters; frozen into each round's
-- settings_snapshot when the round opens, so this column only decides rounds opened afterwards.
-- Expand-only and re-runnable: one ADD COLUMN IF NOT EXISTS with a default, no DROP COLUMN and no
-- SECURITY DEFINER, so the agent harness applies it. Code on other branches ignores the column.
ALTER TABLE "household_settings" ADD COLUMN IF NOT EXISTS "reveal_vote_authorship" boolean DEFAULT false NOT NULL;
