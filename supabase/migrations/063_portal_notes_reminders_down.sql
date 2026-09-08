-- Down-script for 063 — drops every portal note and the reminder ledger
-- (reminders would then re-send once the cron next runs).
DROP TABLE IF EXISTS portal_reminders;
DROP TABLE IF EXISTS portal_notes;
