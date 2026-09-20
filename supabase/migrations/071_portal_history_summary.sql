-- Migration 071 — portal conversation history summary (context budgeter, Phase 3)
-- Procedure: docs/MIGRATION_PROCEDURE.md  (snapshot → staging → verify → prod)
-- Additive, nullable/defaulted — same logged staging exception as 067–070.
--
-- The portal chat now sends only the last few turns verbatim (lib/ai/
-- context-budget.ts, HISTORY budget); older turns are replaced by a short
-- summary written by the cheapest model. The summary is stored on the thread
-- so it is written once per batch of older turns, not on every message:
--   history_summary          the running summary text
--   history_summary_through  how many of the thread's messages (oldest first)
--                            it covers; messages beyond it are verbatim
--   history_summary_at       when it was last written
-- Reads are defensive (pre-071 the chat drops older turns instead of
-- summarising them). Reversible via 071_portal_history_summary_down.sql.

ALTER TABLE portal_conversations ADD COLUMN IF NOT EXISTS history_summary text;
ALTER TABLE portal_conversations ADD COLUMN IF NOT EXISTS history_summary_through integer NOT NULL DEFAULT 0;
ALTER TABLE portal_conversations ADD COLUMN IF NOT EXISTS history_summary_at timestamptz;

COMMENT ON COLUMN portal_conversations.history_summary IS
  'Running summary of the turns older than the verbatim window (071); rides in the uncached tail of the chat prompt.';

NOTIFY pgrst, 'reload schema';
