-- QA batch 2026-09-24 (TLW-002) — READ-ONLY audit. Run in the Supabase SQL editor
-- BEFORE deploying the "empty notes are not sessions" rule.
--
-- From the deploy on, a note with no visible text no longer counts as a
-- coaching session in: the ICF hours log + PDF, the revenue tiles, billing-
-- session derivation, and engagement progress bars. A session hand-logged
-- from the Coaching hours widget used to be stored with an EMPTY body too — those
-- would silently drop out. This lists every empty note so you can tell the two
-- apart. Nothing here writes.

select c.name                              as client,
       n.session_date,
       n.title,
       n.duration_minutes,
       n.created_at,
       n.updated_at,
       n.sent_to_client_at is not null     as was_sent,
       n.id                                as note_id
from notes n
join clients c on c.id = n.client_id
where coalesce(trim(regexp_replace(regexp_replace(n.content, '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|\s', ' ', 'g')), '') = ''
order by n.session_date desc, c.name;

-- If a row above is a REAL hand-logged session (not a stray empty note), keep it
-- counting by giving it the hand-logged marker body — run per id, e.g.:
--
--   update notes
--      set content = '<p><em>Session logged from Coaching hours.</em></p>'
--    where id = '<note_id>';
--
-- Stray empty notes (e.g. Caleb's Test Client Alpha 1 · Sep 12) can be left
-- alone — they no longer count — or deleted from the notes editor.
