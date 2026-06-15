-- 006 supervisor email
-- The coach's supervisor address, so a scored report can be emailed to them.
-- Nullable; set by the coach on the Account page.

alter table public.coaches
  add column if not exists supervisor_email text;
