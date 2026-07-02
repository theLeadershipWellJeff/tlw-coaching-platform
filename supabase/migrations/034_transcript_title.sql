-- 034_transcript_title.sql
-- Give transcripts a human-readable title. Plaud names recordings with a bare
-- timestamp ("2026-06-12 16:05:41"), and via the Zapier webhook the filename is
-- often absent entirely, so the app was showing "Untitled recording" everywhere.
--
-- We now compute a proposed title at ingest time — ideally from the calendar
-- slot alignment ("Client Name · Mon DD, YYYY"), falling back to Plaud's own
-- summary title, then a real (non-timestamp) filename. This column stores it;
-- it's coach-editable (rename in the review queue).
--
-- Additive + nullable — NULL means the UI falls back to filename / "Untitled".

alter table transcripts add column if not exists title text;

-- Backfill existing rows so they aren't stuck at "Untitled":
-- 1) Matched rows → "Initials · Mon DD, YYYY" (the client identity we have).
update transcripts
set title = concat_ws(' · ',
      nullif(client_initials, ''),
      case when session_date is not null then to_char(session_date, 'Mon DD, YYYY') end)
where title is null
  and client_id is not null
  and (client_initials is not null or session_date is not null);

-- 2) Otherwise, use the filename when it isn't just a Plaud timestamp.
update transcripts
set title = filename
where title is null
  and filename is not null
  and btrim(filename) !~ '^\d{4}-\d{1,2}-\d{1,2}[ T_]+\d{1,2}:\d{2}';

-- 3) Anything still NULL (bare-timestamp, no client) keeps falling back in the UI.
