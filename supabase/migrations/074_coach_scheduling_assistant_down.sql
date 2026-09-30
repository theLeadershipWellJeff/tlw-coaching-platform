-- Migration 074 — down. Drops the scheduling-assistant columns.

ALTER TABLE coaches DROP COLUMN IF EXISTS scheduling_assistant_email;
ALTER TABLE coaches DROP COLUMN IF EXISTS scheduling_assistant_name;

NOTIFY pgrst, 'reload schema';
