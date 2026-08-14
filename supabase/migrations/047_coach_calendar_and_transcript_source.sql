-- 047: Per-coach calendar selection + transcript source (beta coach settings).
--
-- calendar_id — which Google calendar the app reads/writes for this coach
--   (transcript matching, session booking, conflict checks, reminders, external
--   booking capture). NULL = the primary calendar (the pre-047 behavior, so
--   existing coaches are unchanged). Set in Account → Calendar.
--
-- transcript_source — where this coach's transcripts come from:
--   'manual' (default; per-client file upload) | 'plaud' | 'zoom'.
--   Plaud/Zoom automated intake are post-beta; for now the setting records the
--   coach's choice and drives the Account → Transcript source panel. NULL reads
--   as 'manual'.
--
-- Additive only; no backfill needed.

alter table coaches add column if not exists calendar_id text;
alter table coaches add column if not exists transcript_source text;
