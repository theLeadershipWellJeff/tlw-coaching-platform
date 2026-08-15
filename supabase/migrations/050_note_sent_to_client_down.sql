-- Migration 050 — record which notes were sent to the client  (DOWN)
--
-- Drops the note-side link only. The `communications` rows written with
-- `type = 'session_note'` are left in place: they are the record of emails that
-- really were sent, and the column is unconstrained text, so they remain valid
-- log entries with or without these columns.

drop index if exists communications_client_type_idx;
drop index if exists notes_sent_to_client_idx;

alter table notes
  drop column if exists client_communication_id,
  drop column if exists sent_to_client_at;
