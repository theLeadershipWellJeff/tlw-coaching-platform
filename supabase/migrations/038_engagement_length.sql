-- 036: engagement length in months.
-- Drives the engagement label on the roster cards / workspace billing bars
-- ("6-Month Engagement"). Additive + nullable: NULL falls back to a label
-- derived from the billing mode ("Fixed Engagement" / "Hourly Engagement" /
-- "Monthly Subscription"), so nothing changes until the coach sets a length.
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS length_months int;
