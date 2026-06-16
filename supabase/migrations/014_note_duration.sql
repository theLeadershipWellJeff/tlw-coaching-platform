-- 014 session duration on notes
--
-- Logged session length, in minutes, so the Practice "past week" revenue card
-- can value each session by its actual logged time. Defaults to 60 (the minimum
-- billable hour) so every existing note counts as one hour.
alter table notes add column if not exists duration_minutes integer not null default 60;
