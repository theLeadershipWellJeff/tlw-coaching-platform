-- Down-script for 061 — portal profile, weekly plans, chat modes.
-- Drops every saved weekly plan and every weekly_plan brief version.
DROP TABLE IF EXISTS weekly_plans;
ALTER TABLE portal_conversations DROP COLUMN IF EXISTS mode;
ALTER TABLE clients DROP COLUMN IF EXISTS preferred_name;
DELETE FROM prompt_briefs WHERE slug = 'weekly_plan';
