-- 034: add payment_note to invoices for manual payment registration
-- Stores a free-text note when a coach manually marks an invoice paid
-- (e.g. "Bank transfer received 2026-06-29").

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_note text;
