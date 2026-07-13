-- 037: Invoice re-send + receipt tracking.
--
-- invoices.receipt_token   — unguessable token embedded in the client-facing
--                            "View & pay invoice" link (cover email + reminder
--                            email). Public GET /api/billing/invoices/receipt/[token]
--                            marks the invoice received and redirects to the
--                            Stripe hosted payment page. Token = credential,
--                            same pattern as actions.complete_token.
-- invoices.received_at     — set (once) when the client first opens the tracked
--                            invoice link. Surfaced as a "received" chip next to
--                            the "sent" status in the Business Center.
-- invoices.last_resent_at  — timestamp of the most recent re-send of the Stripe
--                            invoice email (audit trail on the invoice page).
--
-- All additive + nullable. Apply BEFORE deploying the resend/receipt code —
-- the send path, resend route, and reminder cron reference these columns.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS receipt_token text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_resent_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_receipt_token_key
  ON invoices (receipt_token)
  WHERE receipt_token IS NOT NULL;
