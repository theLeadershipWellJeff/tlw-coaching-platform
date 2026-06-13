-- theLeadershipWell — client workspace
--
-- Extends the client record for the redesigned client workspace:
--   address         — basic contact info shown/edited on the name card
--   coaching_goals  — the current goals shown on the goals card, stored as a
--                     JSON array of { title, description } (same shape as the
--                     session-prep coaching plan). Nullable with a [] default so
--                     existing client inserts keep working unchanged.

alter table clients
  add column if not exists address text,
  add column if not exists coaching_goals jsonb default '[]'::jsonb;
