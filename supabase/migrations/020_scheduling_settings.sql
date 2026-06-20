-- theLeadershipWell — per-coach scheduling settings
--
-- Two jsonb columns on `coaches` so each coach can shape how the workspace
-- scheduler behaves:
--
--   availability     — the coach's bookable hours per weekday. The scheduler
--                      warns (does not block) when a picked time falls outside
--                      these windows, and the picker can highlight in-hours slots.
--   reminder_settings — which session reminders fire: the booking confirmation
--                      (on/off) and any number of "X hours before" nudges, each
--                      toggleable. The hourly reminder cron reads this per coach.
--
-- Both are nullable. A NULL value means "use the built-in defaults" (a normal
-- Mon–Fri 9–5 week and a single 24h nudge + confirmation), so existing coaches
-- keep today's behavior until they customize.
--
-- Shapes (see lib/scheduling.ts for the canonical types + defaults):
--   availability:
--     { "0": { "enabled": false, "start": "09:00", "end": "17:00" },
--       "1": { "enabled": true,  "start": "09:00", "end": "17:00" }, ... "6": {...} }
--     (keys "0".."6" = Sunday..Saturday)
--   reminder_settings:
--     { "confirmation": true,
--       "reminders": [ { "hoursBefore": 24, "enabled": true } ] }

alter table coaches
  add column if not exists availability jsonb,
  add column if not exists reminder_settings jsonb;
