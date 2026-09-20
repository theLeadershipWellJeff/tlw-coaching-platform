-- Migration 071 — portal conversation history summary (down). Exact reversal.
ALTER TABLE portal_conversations DROP COLUMN IF EXISTS history_summary;
ALTER TABLE portal_conversations DROP COLUMN IF EXISTS history_summary_through;
ALTER TABLE portal_conversations DROP COLUMN IF EXISTS history_summary_at;
NOTIFY pgrst, 'reload schema';
