-- Migration 074 — coach scheduling contact (Client Portal, multi-coach rollout)
-- Up-script. Paired down: 074_coach_scheduling_assistant_down.sql
--
-- Each coach reaches their portal clients by a booking link (coaches.booking_url,
-- migration 051: Calendly / Zoom Scheduler / HubSpot) and/or an assistant who
-- books for them. These two columns hold the assistant: the portal shows
-- "Email <name> to schedule" and routes the portal's scheduling requests there
-- (Cc the coach). Additive + nullable: NULL = no assistant, the portal behaves
-- exactly as before.

ALTER TABLE coaches ADD COLUMN IF NOT EXISTS scheduling_assistant_name text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS scheduling_assistant_email text;

NOTIFY pgrst, 'reload schema';
