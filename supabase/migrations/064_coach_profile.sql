-- Migration 064 — coach profile (how the app refers to the coach)
-- Additive. Lets a coach set how the app greets them ("Dr. Jeff", "Coach J"),
-- a title/credentials line, and a phone number, edited on Account → Profile.
-- `coaches.name` (the full name used in emails and prompts) already exists and
-- becomes editable through the same card — no change to that column.
-- Procedure: docs/MIGRATION_PROCEDURE.md  (snapshot → staging → verify → prod)

ALTER TABLE coaches ADD COLUMN IF NOT EXISTS preferred_name text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN coaches.preferred_name IS
  'How the app addresses the coach in greetings (e.g. "Dr. Jeff"). NULL = first name of coaches.name.';
COMMENT ON COLUMN coaches.title IS
  'Title / credentials line shown on the coach profile (e.g. "Executive Coach, PCC"). Optional.';
COMMENT ON COLUMN coaches.phone IS
  'Coach phone number, kept on the profile for reference. Optional.';

NOTIFY pgrst, 'reload schema';
