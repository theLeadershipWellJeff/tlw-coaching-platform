-- theLeadershipWell — session-prep agenda fill-ins
--
-- The prep email carries a "help shape our agenda" link. It points to a public
-- page (token = credential) where the client answers a couple of prompts about
-- what they want from the session; their answers are stored here and shown to
-- the coach in the client workspace.

create table if not exists agenda_requests (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid references coaches (id) on delete set null,
  client_id     uuid references clients (id) on delete cascade,
  token         uuid not null default gen_random_uuid(),
  items         jsonb,                                 -- [{ q, a }] once submitted
  status        text not null default 'pending',       -- pending | submitted
  created_at    timestamptz not null default now(),
  submitted_at  timestamptz
);

create unique index if not exists agenda_requests_token_idx on agenda_requests (token);
create index if not exists agenda_requests_client_idx on agenda_requests (client_id);

alter table agenda_requests enable row level security;
