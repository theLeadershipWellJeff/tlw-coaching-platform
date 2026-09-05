-- Migration 058 — saved session plans  (UP)
--
-- "Plan next session" was fully ephemeral: the generated brief and the coach's
-- notepad lived only in the open window (notes in localStorage). Beta feedback:
-- the coach generates a plan days ahead, writes their OWN plan in the notepad,
-- and wants to come back to exactly that document on the day of the session —
-- from any device. This table makes a plan a savable document.
--
--   plan   — the generated brief (PlanResult JSON: summary, questions, and the
--            deterministic context lists) frozen at save time
--   notes  — the coach's own plan from the window's notepad (autosaved on edit)
--   title  — display label, defaulted server-side to "Session plan · <date>"
--
-- Surfaced in the client workspace "Session plans" card; opening a row loads it
-- back into the floating plan window / pop-out.
--
-- Reversible via 058_session_plans_down.sql.

create table if not exists session_plans (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null default '00000000-0000-4000-8000-000000000001'
               references organizations(id),
  coach_id   uuid not null references coaches(id) on delete cascade,
  client_id  uuid not null references clients(id) on delete cascade,
  title      text not null default '',
  plan       jsonb not null,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_plans_client_idx
  on session_plans (client_id, created_at desc);
create index if not exists session_plans_org_id_idx
  on session_plans (org_id);

alter table session_plans enable row level security;
