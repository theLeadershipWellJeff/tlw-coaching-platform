-- 039: Prep Sheet Pipeline (Generate → Review → Approve → Scheduled Send)
--
-- The guarantee: a client's prep sheet lands 48 hours before their session,
-- every time, unless the coach explicitly skips it. This table is the STATE
-- MACHINE that makes that guarantee auditable — one row per appointment, max.
--
--   draft     → generated, waiting on the coach's review/approve
--   approved  → coach approved; will dispatch at scheduled_send_at
--   sent      → delivered to the client (communication_id links the send log)
--   skipped   → coach chose to skip, no history, cancelled appt, or cutoff
--   failed    → generation or dispatch errored (surfaced in /prep)
--
-- NOTE ON THE NAME: the pre-existing `prep_sheets` table (migration 013) is a
-- SEND-LOG SNAPSHOT of interactively-sent prep emails (content jsonb + html)
-- powering the workspace "Prep sheets sent" card. That table is left untouched;
-- this pipeline gets its own name so the two never collide.
--
-- Like every table in this app: RLS ON, no public policies — reached only via
-- the service-role key (getSupabaseAdmin), coach-scoped in code (not RLS).

create table if not exists prep_sheet_pipeline (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coaches(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  -- One pipeline row per appointment, enforced by the unique constraint.
  appointment_id uuid not null unique references appointments(id) on delete cascade,

  status text not null default 'draft',
    -- draft | approved | sent | skipped | failed

  subject text,
  body_html text,

  generated_at timestamptz,
  generation_model text,               -- resolved model id recorded for audit
  eligibility jsonb,                   -- what history fed the draft (counts, ids, dates)

  approved_at timestamptz,
  scheduled_send_at timestamptz,       -- the exact client-delivery moment (T-2d @ delivery_hour, clamped ≥ T-48h)

  sent_at timestamptz,
  communication_id uuid references communications(id) on delete set null,

  skipped_at timestamptz,
  skip_reason text,                    -- coach_choice | no_history | not_approved_in_time | appointment_cancelled

  error_detail text,
  skip_token text unique,              -- one-click skip from the coach review email (credential)

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at maintenance (shared trigger fn from migration 001).
create trigger prep_sheet_pipeline_set_updated_at
  before update on prep_sheet_pipeline
  for each row execute function set_updated_at();

alter table prep_sheet_pipeline enable row level security;

create index if not exists prep_sheet_pipeline_coach_status_idx
  on prep_sheet_pipeline(coach_id, status);
-- Dispatch scans approved rows whose send moment has passed; partial index keeps
-- that hot query tight.
create index if not exists prep_sheet_pipeline_scheduled_idx
  on prep_sheet_pipeline(scheduled_send_at) where status = 'approved';
create index if not exists prep_sheet_pipeline_client_idx
  on prep_sheet_pipeline(client_id);

-- Link the send log to its appointment. Pays forward into the future
-- reply-capture feature as well. Additive/nullable — existing rows unaffected.
alter table communications
  add column if not exists appointment_id uuid references appointments(id) on delete set null;

create index if not exists communications_appointment_id_idx
  on communications(appointment_id);

-- appointment_reminders.kind is free text (no CHECK) — the new coach-facing
-- claim slots 'prep_review' and 'prep_last_call' need no DDL. The existing
-- (appointment_id, kind) unique index gives each its once-only guarantee.
