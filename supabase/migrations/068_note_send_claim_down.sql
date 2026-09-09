-- Migration 068 — down-script (exact reversal of 068_note_send_claim.sql).
-- Drops the three send-claim columns on notes. Safe on a database where the
-- up-script was applied.
ALTER TABLE notes DROP COLUMN IF EXISTS send_attempt;
ALTER TABLE notes DROP COLUMN IF EXISTS send_claimed_at;
ALTER TABLE notes DROP COLUMN IF EXISTS send_idempotency_key;

NOTIFY pgrst, 'reload schema';
