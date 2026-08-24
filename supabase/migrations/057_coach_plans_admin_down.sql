-- Migration 057 — Coach plans, coach billing, admin audit log  (DOWN)
--
-- Drops the plan/billing columns and the audit table. Note: dropping the
-- Stripe columns severs the app's link to any live coach subscriptions — the
-- subscriptions themselves keep billing in Stripe until canceled there.

DROP TABLE IF EXISTS admin_audit_log;

DROP INDEX IF EXISTS coaches_stripe_customer_idx;
DROP INDEX IF EXISTS coaches_stripe_subscription_idx;

ALTER TABLE coaches DROP COLUMN IF EXISTS subscription_status;
ALTER TABLE coaches DROP COLUMN IF EXISTS stripe_subscription_id;
ALTER TABLE coaches DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE coaches DROP COLUMN IF EXISTS plan_note;
ALTER TABLE coaches DROP COLUMN IF EXISTS plan;
