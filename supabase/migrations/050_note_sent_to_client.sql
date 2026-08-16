-- Migration 050 — record which notes were sent to the client  (UP)
--
-- Until now `POST /api/clients/[id]/send-note` sent the client-facing email and
-- returned WITHOUT logging anything: no `communications` row, no stamp on the
-- note. So there was no record anywhere of which notes a client had been sent,
-- or of what those emails said.
--
-- That record is the gate the Client Portal reads: the portal shows ONLY notes
-- the coach actually sent via "Send to client" — never raw coach notes. It also
-- closes a coach-side gap, since sent notes were missing from the workspace
-- "Recent Communication" card while every other send path logged normally.
--
-- The SENT VERSION (the AI-drafted client-facing narrative plus its Insights and
-- Actions sections) lives in `communications.body_html` under the new
-- `type = 'session_note'` — `communications.type` is unconstrained text, so no
-- DDL is needed for the type itself. These two columns are the note-side link.
--
-- Additive and nullable: existing notes read as never-sent, which is correct —
-- the data was never recorded, so there is nothing to backfill. The portal's
-- notes history therefore begins the day this ships.
--
-- Reversible via 050_note_sent_to_client_down.sql.

alter table notes
  add column if not exists sent_to_client_at timestamptz,
  -- The communications row holding the exact email the client received. ON DELETE
  -- SET NULL so pruning the comms log can never delete a coach's note.
  add column if not exists client_communication_id uuid
    references communications(id) on delete set null;

-- The portal lists a client's sent notes newest-first; partial (sent only) since
-- unsent notes are the majority and are never queried through this path.
create index if not exists notes_sent_to_client_idx
  on notes (client_id, sent_to_client_at desc)
  where sent_to_client_at is not null;

-- The portal reads sent notes out of the communications log by type.
create index if not exists communications_client_type_idx
  on communications (client_id, type, sent_at desc);
