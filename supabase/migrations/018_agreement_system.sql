-- theLeadershipWell — Client Agreement Management System
--
-- Builds on the existing `agreements` e-sign table (migration 011) rather than
-- duplicating it. Adds:
--   1. `agreement_templates` — one structured master template per coach, with
--      coach-editable sections and ICF/legal `locked_*` sections (seeded from
--      lib/agreement-template.ts on first load, so the text has a single source).
--   2. New columns on `agreements` for the richer signing flow: per-issue merge
--      vars, a recording-authorization decision, typed-name + IP capture, a
--      30-day token expiry, and an HTML snapshot taken AT SIGNING.
--   3. `clients` flags that the rest of the platform (and the scoring engine's
--      Gate 1) reads as the source of truth: agreement_on_file, recording_authorized.
--
-- Status vocabulary moves from sent|signed to sent|active. 'none' is never stored
-- in a row — it is the ABSENCE of an agreement (mirrored by clients.agreement_on_file
-- = false). Existing 'signed' rows are migrated to 'active' below.
--
-- Run by hand in the Supabase SQL editor (project convention). Idempotent.

-- 1. Master agreement template (one per coach) -------------------------------
create table if not exists agreement_templates (
  id        uuid primary key default gen_random_uuid(),
  coach_id  uuid not null references coaches (id) on delete cascade,
  name      text not null default 'Coaching Agreement',

  -- Coach-editable sections
  description_of_coaching text not null,
  agreement_logistics     text not null,
  method_of_contact       text not null,
  late_policy             text not null,
  cancellation_policy     text not null,
  payment_terms           text,                  -- nullable; blank = section omitted

  -- Locked sections (ICF & legal). Stored for snapshot integrity; never editable
  -- in the UI. Seeded from lib/agreement-template.ts.
  locked_coach_client_relationship text not null,
  locked_confidentiality           text not null,
  locked_ai_recording              text not null,
  locked_release_of_information    text not null,
  locked_termination               text not null,
  locked_limited_liability         text not null,
  locked_standard_legal            text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One master template per coach.
create unique index if not exists agreement_templates_coach_idx
  on agreement_templates (coach_id);

drop trigger if exists agreement_templates_set_updated_at on agreement_templates;
create trigger agreement_templates_set_updated_at
  before update on agreement_templates
  for each row execute function set_updated_at();

alter table agreement_templates enable row level security;

-- 2. Extend the existing `agreements` table ----------------------------------
alter table agreements
  add column if not exists agreement_template_id  uuid references agreement_templates (id) on delete set null,
  add column if not exists client_name            text,
  add column if not exists client_email           text,
  add column if not exists coach_name             text,
  add column if not exists zoom_link              text,
  add column if not exists phone                  text,
  add column if not exists payment_terms          text,
  add column if not exists recording_authorized   boolean,        -- null until signed
  add column if not exists signer_typed_name      text,
  add column if not exists signer_ip              text,
  add column if not exists signing_token_expires_at timestamptz,
  add column if not exists signed_agreement_html  text;           -- snapshot AT signing

-- Migrate status vocabulary: signed -> active (idempotent).
update agreements set status = 'active' where status = 'signed';

-- 3. Client-record flags (read by the workspace + scoring Gate 1) ------------
alter table clients
  add column if not exists agreement_on_file    boolean not null default false,
  add column if not exists recording_authorized boolean,
  add column if not exists agreement_id         uuid references agreements (id) on delete set null;

-- Backfill: a client with an active agreement has one on file. recording_authorized
-- is left null for legacy rows (predate the recording decision = unknown, which
-- the no-recording compliance flag treats as "not an explicit decline").
update clients c
set agreement_on_file = true,
    agreement_id = a.id
from (
  select distinct on (client_id) id, client_id
  from agreements
  where status = 'active'
  order by client_id, signed_at desc nulls last, sent_at desc
) a
where a.client_id = c.id
  and c.agreement_on_file = false;
