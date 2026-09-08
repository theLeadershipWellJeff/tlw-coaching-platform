-- Migration 063 — portal "My notes" + portal reminders
-- Procedure: docs/MIGRATION_PROCEDURE.md  (snapshot → staging → verify → prod)
--
--  1. portal_notes — the client's own journal inside the portal. PRIVATE to the
--     client: never read by any coach-side query, never the `notes` table. The
--     most recent notes join the assistant's context (chat + Plan your week).
--
--  2. portal_reminders — the dedupe ledger for the daily portal-reminder cron:
--     one row per (client, kind, period_key) ever sent, so a reminder can never
--     go twice. Kinds: 'welcome' (invited, never signed in — day 3, day 10),
--     'comeback' (gone quiet — day 14, day 35), 'quarterly_goals' (first Monday
--     of Jan/Apr/Jul/Oct). period_key = e.g. 'welcome-3d', 'comeback-14d',
--     'goals-2026Q4'.
--
-- Goal progress (progress / progress_updated_at / completed_at) lives inside the
-- existing clients.coaching_goals jsonb — no schema change. The reminder opt-out
-- lives in clients.portal_features ({"reminders": false}) — no schema change.
--
-- All additive; reversible via 063_portal_notes_reminders_down.sql.

CREATE TABLE IF NOT EXISTS portal_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                REFERENCES organizations(id),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title       text,
  body        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_notes_client_idx ON portal_notes (client_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS portal_notes_org_id_idx ON portal_notes (org_id);
ALTER TABLE portal_notes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS portal_reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                REFERENCES organizations(id),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  period_key  text NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  -- 'resend' | 'gmail' | 'none' + the send error, for support
  via         text,
  error       text
);
CREATE UNIQUE INDEX IF NOT EXISTS portal_reminders_once_idx
  ON portal_reminders (client_id, kind, period_key);
CREATE INDEX IF NOT EXISTS portal_reminders_client_idx ON portal_reminders (client_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS portal_reminders_org_id_idx ON portal_reminders (org_id);
ALTER TABLE portal_reminders ENABLE ROW LEVEL SECURITY;
