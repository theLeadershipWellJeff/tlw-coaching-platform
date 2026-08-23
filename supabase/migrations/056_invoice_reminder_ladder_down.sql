-- 056_invoice_reminder_ladder_down.sql
-- Reverts the reminder ladder to the single one-shot 14-day reminder.
-- Ladder rungs beyond the first are deleted (they have no meaning without the
-- kind column); already-sent rungs' communications-log rows are untouched.

DELETE FROM invoice_reminders WHERE kind <> 'nudge_14d';

DROP INDEX IF EXISTS invoice_reminders_invoice_kind_uniq;

ALTER TABLE invoice_reminders DROP COLUMN IF EXISTS kind;

ALTER TABLE invoices DROP COLUMN IF EXISTS reminders_exhausted_at;
