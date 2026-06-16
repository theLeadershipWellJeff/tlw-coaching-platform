-- theLeadershipWell — coaching agreements (e-sign)
--
-- Library folders gain a `kind` so a folder can be Note / Agreement / Worksheet.
-- Templates inside an agreement-kind folder can be assigned to a client to sign.
--
-- `agreements` is one assigned-and-(maybe)-signed copy: the body is SNAPSHOTTED
-- at send time so a later template edit never changes what was agreed to. The
-- client signs by tapping an "I have read and agree" checkbox link in their
-- email (sign_token is the credential), mirroring the action-completion loop.

alter table library_folders
  add column if not exists kind text not null default 'note';   -- note | agreement | worksheet | generic

create table if not exists agreements (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid references coaches (id) on delete set null,
  client_id    uuid references clients (id) on delete cascade,
  template_id  uuid references note_templates (id) on delete set null,  -- origin
  title        text not null,
  body_html    text not null,                                   -- snapshot at send time
  status       text not null default 'sent',                    -- sent | signed
  sign_token   uuid not null default gen_random_uuid(),
  sent_at      timestamptz not null default now(),
  signed_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists agreements_sign_token_idx on agreements (sign_token);
create index if not exists agreements_client_idx on agreements (client_id);

create trigger agreements_set_updated_at
  before update on agreements
  for each row execute function set_updated_at();

alter table agreements enable row level security;
