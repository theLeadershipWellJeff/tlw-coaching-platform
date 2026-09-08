-- Migration 064 — down-script. Drops the three optional profile columns; the
-- app reads them defensively, so nothing else depends on them.
ALTER TABLE coaches DROP COLUMN IF EXISTS preferred_name;
ALTER TABLE coaches DROP COLUMN IF EXISTS title;
ALTER TABLE coaches DROP COLUMN IF EXISTS phone;

NOTIFY pgrst, 'reload schema';
