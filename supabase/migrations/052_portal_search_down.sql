-- Migration 052 — Client Portal full-text search  (DOWN)
--
-- The search route falls back to its ILIKE path when this function is absent, so
-- dropping these leaves the portal searchable (just slower and transcript-only).

drop function if exists portal_search(uuid, text, int);

drop index if exists communications_session_note_search_idx;
alter table communications drop column if exists search_vector;

drop index if exists transcripts_search_idx;
alter table transcripts drop column if exists search_vector;
