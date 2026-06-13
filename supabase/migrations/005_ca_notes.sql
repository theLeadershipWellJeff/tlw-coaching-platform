-- theLeadershipWell — Coach Accountable note import
--
-- Lets us port session notes from Coach Accountable into the in-app notes
-- table. ca_session_id holds CA's session ID so re-running the import is
-- idempotent (a partial unique index dedupes per client; manual notes keep a
-- NULL ca_session_id and aren't constrained).

alter table notes add column if not exists ca_session_id text;

create unique index if not exists notes_client_ca_session_idx
  on notes (client_id, ca_session_id)
  where ca_session_id is not null;
