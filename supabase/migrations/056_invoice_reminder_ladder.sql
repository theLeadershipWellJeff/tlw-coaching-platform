-- 056_invoice_reminder_ladder.sql
-- Invoice reminder ladder (invoices are due on receipt).
--
-- Replaces the single one-shot 14-day reminder with a cadence, anchored to the
-- send date and paced ~14 days apart (each rung is scheduled when the previous
-- one actually sends, so late/backfilled invoices never get burst-emailed):
--
--   nudge_14d   ~day 14  gentle reminder (the legacy reminder, unchanged tone)
--   overdue_1   ~day 28  flips the invoice sent → overdue + firmer notice
--   overdue_2   ~day 42  final automated client reminder
--   coach_alert ~day 56  no client email — notifies the COACH ("needs
--                        attention") and stamps invoices.reminders_exhausted_at
--
-- Each rung fires at most once per invoice, enforced by a real UNIQUE index
-- (the old claim logic only approximated this). Cancellation on paid/void is
-- unchanged and kills the whole remaining ladder.

-- 1. Rung identity. Existing rows are all the legacy single 14-day reminder,
--    which is exactly the ladder's first rung — the default backfills them.
ALTER TABLE invoice_reminders
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'nudge_14d';

-- 2. Collapse any duplicate (invoice_id, kind) rows so the unique index can
--    build (in practice there is at most one row per invoice today).
DELETE FROM invoice_reminders a
  USING invoice_reminders b
  WHERE a.invoice_id = b.invoice_id
    AND a.kind = b.kind
    AND a.id > b.id;

-- 3. One firing per rung per invoice — the hard double-send guard.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_reminders_invoice_kind_uniq
  ON invoice_reminders(invoice_id, kind);

-- 4. Needs-attention stamp, set when the ladder exhausts (coach_alert rung):
--    the signal that automated reminders are done and a personal follow-up is
--    owed. Cleared implicitly by being irrelevant once the invoice is paid.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS reminders_exhausted_at timestamptz;

-- 5. Backfill: outstanding invoices whose legacy 14-day reminder already fired
--    rejoin the cadence at the next rung. Scheduled at least 1 day out so
--    nothing blasts the moment the next cron run happens.
INSERT INTO invoice_reminders (invoice_id, kind, send_at, status, channel)
SELECT r.invoice_id,
       'overdue_1',
       GREATEST(COALESCE(r.sent_at, now()) + interval '14 days', now() + interval '1 day'),
       'scheduled',
       'email'
FROM invoice_reminders r
JOIN invoices i ON i.id = r.invoice_id
WHERE r.kind = 'nudge_14d'
  AND r.status = 'sent'
  AND i.status IN ('sent', 'overdue')
ON CONFLICT (invoice_id, kind) DO NOTHING;
