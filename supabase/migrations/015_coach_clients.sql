-- 015_coach_clients.sql
-- Tenant scoping (Block Registry spec, Tier 0). Links each client to the
-- coach(es) who work with them. A client is normally linked to exactly one coach
-- (role 'primary'); the occasional shared client gets an extra 'shared' link.
--
-- This table IS the isolation boundary: the app filters client access by the
-- signed-in coach against it, server-side (lib/client-access.ts). We are on
-- NextAuth, not Supabase Auth, so RLS keyed to auth.uid() does not apply — the
-- table is RLS-enabled with no public policies and reached only via the
-- service-role key, like every other table.

create table if not exists coach_clients (
  coach_id   uuid not null references coaches(id) on delete cascade,
  client_id  uuid not null references clients(id) on delete cascade,
  role       text not null default 'primary',  -- 'primary' | 'shared'
  created_at timestamptz not null default now(),
  primary key (coach_id, client_id)
);

create index if not exists coach_clients_client_idx on coach_clients(client_id);

alter table coach_clients enable row level security;

-- ---------------------------------------------------------------------------
-- BACKFILL — READ BEFORE RUNNING.
--
-- The practice is single-coach today (Jeff), though there may be more than one
-- `coaches` row for him (e.g. his Google sign-in email AND the default coach
-- email the transcript webhook uses). To guarantee he keeps seeing every client
-- no matter which identity he signs in as, we link every existing client to
-- every non-supervisor coach. Supervisors are excluded (they get cross-coach
-- read access through the role, not through ownership).
--
-- IF YOU ALREADY HAVE MULTIPLE DISTINCT COACHES with separate client lists,
-- DO NOT run this as-is — it would share every client with every coach. Replace
-- the statement below with per-coach assignments first.
-- ---------------------------------------------------------------------------
insert into coach_clients (coach_id, client_id, role)
select co.id, cl.id, 'primary'
from clients cl
cross join coaches co
where coalesce(co.role, 'coach') <> 'supervisor'
on conflict (coach_id, client_id) do nothing;
