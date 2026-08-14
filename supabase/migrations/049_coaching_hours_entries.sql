-- Migration 049 — Coaching hours entries (imported / historical hours)  (UP)
-- Makes the app the canonical record of the coach's lifetime coaching hours:
-- rows imported from a CSV, logged by hand, or entered as a single aggregate
-- "prior hours" block covering pre-platform coaching. These merge with the
-- note-derived session log in /api/coaching-hours and feed the ICF PDF export.
-- client_label is free text — historical clients need not exist in the roster.
-- Reversible via 049_coaching_hours_entries_down.sql.

create table if not exists coaching_hours_entries (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default '00000000-0000-4000-8000-000000000001'
                      references organizations(id),
  coach_id          uuid not null references coaches(id) on delete cascade,
  session_date      date not null,
  duration_minutes  integer not null check (duration_minutes > 0),
  client_label      text not null,                     -- free-text client / block label
  title             text,                              -- optional description
  kind              text not null default 'session',   -- 'session' | 'aggregate' (a block of prior hours)
  paid              boolean not null default true,     -- ICF logs split paid vs pro-bono
  source            text not null default 'manual',    -- 'manual' | 'csv'
  created_at        timestamptz not null default now()
);

create index if not exists coaching_hours_entries_coach_idx
  on coaching_hours_entries (coach_id, session_date desc);
create index if not exists coaching_hours_entries_org_id_idx
  on coaching_hours_entries (org_id);

alter table coaching_hours_entries enable row level security;
