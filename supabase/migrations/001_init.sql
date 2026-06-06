-- theLeadershipWell — initial schema
-- Owns the coach's client data + in-app note-taking.
-- Accessed server-side only (service-role key), so RLS is enabled with no
-- public policies: the service role bypasses RLS, the anon/auth roles get nothing.

-- Needed for gen_random_uuid() on older Postgres; no-op on Supabase (already present).
create extension if not exists "pgcrypto";

-- Keep updated_at fresh on every write.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text,
  title         text,                       -- role / job title
  company       text,
  status        text not null default 'active',  -- active | inactive | prospect
  phone         text,
  timezone      text,
  ca_client_id  text,                       -- link back to Coach Accountable
  tags          text[] not null default '{}',
  bio           text,                       -- freeform about/background
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists clients_status_idx on clients (status);
create index if not exists clients_name_idx on clients (lower(name));

create trigger clients_set_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- notes  (in-app note-taking)
-- ---------------------------------------------------------------------------
create table if not exists notes (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients (id) on delete cascade,
  session_date  date not null default current_date,
  title         text,
  content       text not null default '',   -- markdown / rich text
  calendar_event_id text,                   -- optional link to a Google Calendar event
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists notes_client_id_idx on notes (client_id);
create index if not exists notes_session_date_idx on notes (session_date desc);

create trigger notes_set_updated_at
  before update on notes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- actions  (commitments / follow-ups)
-- ---------------------------------------------------------------------------
create table if not exists actions (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients (id) on delete cascade,
  note_id       uuid references notes (id) on delete set null,
  description   text not null,
  due_date      date,
  status        text not null default 'open',  -- open | done | dropped
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists actions_client_id_idx on actions (client_id);
create index if not exists actions_status_idx on actions (status);

create trigger actions_set_updated_at
  before update on actions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Lock down: enable RLS, add no policies. Server uses the service-role key,
-- which bypasses RLS. Nothing is reachable with the public anon key.
-- ---------------------------------------------------------------------------
alter table clients enable row level security;
alter table notes   enable row level security;
alter table actions enable row level security;
