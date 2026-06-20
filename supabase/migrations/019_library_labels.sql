-- theLeadershipWell — per-coach custom Library labels.
--
-- Lets a coach rename the fixed Library nodes (the Templates / PDF Resources /
-- Coaching Agreement home tiles and the "Unfiled" bucket) without touching the
-- internal section keys. Stored as a small JSON map keyed by node id:
--   { "templates": "...", "pdf": "...", "agreement": "...", "unfiled": "..." }
-- An absent/empty value falls back to the built-in default label.
--
-- Run by hand in the Supabase SQL editor. Idempotent.

alter table coaches
  add column if not exists library_labels jsonb not null default '{}'::jsonb;
