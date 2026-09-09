-- Migration 068 — session-note send claim (claim-before-send + idempotency key)
-- Procedure: docs/MIGRATION_PROCEDURE.md  (snapshot → staging → verify → prod)
-- Same additive-only shape as 067; same logged staging exception applies.
--
-- The Phase 3 send flow must produce exactly ONE email and ONE communications
-- row for a note even when the coach double-taps Send or has the editor open
-- in two tabs. The billing charge path solved this with a claim row +
-- idempotency key; notes get the same pattern on the row itself:
--
--   send_attempt          monotonically increasing attempt counter. The claim
--                         is a compare-and-set: UPDATE … WHERE send_attempt =
--                         <the value the request read> AND sent_to_client_at
--                         IS NULL AND (send_claimed_at IS NULL OR stale) —
--                         two concurrent requests read the same value, so at
--                         most one UPDATE matches.
--   send_claimed_at       set at claim, cleared on failure. A claim older than
--                         3 minutes is treated as stale (the function died
--                         mid-send) and may be re-claimed.
--   send_idempotency_key  'note:<id>:<attempt>' — recorded on the note and on
--                         the communications row so any duplicate is auditable.
--
-- Additive, defaulted/nullable, no backfill. Reversible via
-- 068_note_send_claim_down.sql.

ALTER TABLE notes ADD COLUMN IF NOT EXISTS send_attempt int NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS send_claimed_at timestamptz;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS send_idempotency_key text;

COMMENT ON COLUMN notes.send_attempt IS
  'Send-claim CAS counter (068). Each send claim increments it; the claim UPDATE matches only the value the request read.';
COMMENT ON COLUMN notes.send_claimed_at IS
  'Set while a send is in flight; cleared on failure. Older than 3 min = stale claim, may be re-claimed.';

NOTIFY pgrst, 'reload schema';
