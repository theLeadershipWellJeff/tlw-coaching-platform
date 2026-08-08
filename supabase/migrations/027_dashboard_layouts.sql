-- 026: Customizable dashboard layouts ("legos")
--
-- The homepage Dashboard becomes a coach-assembled surface of cards. This table
-- persists which cards a coach has placed, at what size, in what order — one row
-- per coach per surface (today only 'dashboard', but `surface` keeps the door
-- open to reusing this for other arrangeable surfaces later).
--
-- `blocks` is the persisted placement list: [{ blockId, size, order }]. It's the
-- exact shape lib/dashboard/types.ts#CardPlacement carries; the API normalizes it
-- (lib/dashboard/validate.ts) on both read and write, so stored values are always
-- coerced back to known cards / supported sizes before render.
--
-- Last-write-wins is fine (a coach edits their own single dashboard). Like every
-- table here, RLS is ON with no public policies — reached only via the
-- service-role key (getSupabaseAdmin); coach-scoped in code, never RLS.

create table if not exists dashboard_layouts (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references coaches(id) on delete cascade,
  surface     text not null default 'dashboard',
  blocks      jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (coach_id, surface)
);
alter table dashboard_layouts enable row level security;

create index if not exists dashboard_layouts_coach_idx on dashboard_layouts (coach_id);
