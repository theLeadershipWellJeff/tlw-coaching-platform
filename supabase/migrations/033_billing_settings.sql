-- 033_billing_settings.sql
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS billing_settings jsonb;
