-- 031: Add billing_cc to billing_accounts and client_message to invoices.
--
-- billing_accounts.billing_cc   — optional CC email shown on invoices and
--                                 included in billing correspondence.
-- invoices.client_message       — optional free-text message the coach adds
--                                 to an invoice; shown to the client first.

ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS billing_cc text;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS client_message text;
