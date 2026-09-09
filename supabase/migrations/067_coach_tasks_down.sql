-- Migration 067 — down-script (exact reversal of 067_coach_tasks.sql).
-- Drops the coach attention queue, the cron run log, and the additive
-- session-note / coach digest columns. The 050 sent-state columns on notes
-- (sent_to_client_at, client_communication_id) are NOT touched — 067 reused
-- them rather than adding duplicates.
-- Safe on a database where the up-script was applied.

DROP TABLE IF EXISTS coach_tasks;
DROP TABLE IF EXISTS cron_runs;

ALTER TABLE notes DROP COLUMN IF EXISTS status;
ALTER TABLE notes DROP COLUMN IF EXISTS generated_narrative;
ALTER TABLE notes DROP COLUMN IF EXISTS narrative_generated_at;
ALTER TABLE notes DROP COLUMN IF EXISTS filed_at;
ALTER TABLE notes DROP COLUMN IF EXISTS reopened_at;
ALTER TABLE notes DROP COLUMN IF EXISTS reopen_count;

ALTER TABLE coaches DROP COLUMN IF EXISTS digest_hour;
ALTER TABLE coaches DROP COLUMN IF EXISTS digest_enabled;
ALTER TABLE coaches DROP COLUMN IF EXISTS last_digest_sent_on;

NOTIFY pgrst, 'reload schema';
