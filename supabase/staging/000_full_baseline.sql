-- ============================================================================
-- theLeadershipWell — FULL SCHEMA BASELINE (migrations 001–041, ordered)
-- Generated for the STAGING Supabase project (Phase 0.1).
-- Paste this whole file into the staging SQL editor to reproduce production
-- structure. Contains NO data. Run 001_synthetic_seed.sql afterward.
-- Note: 023_frameworks creates a table that 024_garden drops — this is the
-- correct ordered replay of production history, not an error.
-- ============================================================================


-- ==================== 001_init.sql ====================
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


-- ==================== 002_scorecard.sql ====================
-- theLeadershipWell — coaching scorecard
-- Implements the Session Report Spec v0.3 (see spec/).
--
-- Pipeline: Plaud.ai transcript -> Zapier -> /api/transcripts/ingest (+ Drive
-- archive). Each transcript is fuzzy-matched to a client, then scored by the
-- evaluation engine against the eight ICF 2025 Core Competencies. The engine's
-- JSON output (spec §16) is stored verbatim in session_reports.report and the
-- report template renders from it — scoring stays decoupled from presentation.
--
-- Like 001_init, these tables are reached only with the service-role key, so
-- RLS is enabled with no public policies.

-- ---------------------------------------------------------------------------
-- coaches
-- One row per coach. Phase 1 is self-development only (a coach sees their own
-- reports); the `role` column lets a supervisor roll up across coaches in a
-- later phase without re-architecting. Coaches are matched to the signed-in
-- Google account by email (get-or-create on first use).
-- ---------------------------------------------------------------------------
create table if not exists coaches (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text not null,
  role        text not null default 'coach',   -- coach | supervisor
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger coaches_set_updated_at
  before update on coaches
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- transcripts
-- Raw ingested markdown plus the result of client-matching. Fail-loud: an
-- uncertain match lands as match_status = 'needs_review' rather than being
-- guessed (spec §19). content_hash makes ingestion idempotent, so the same
-- transcript arriving via both the webhook and the Drive sweep can't double up.
-- ---------------------------------------------------------------------------
create table if not exists transcripts (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid references coaches (id) on delete set null,
  client_id        uuid references clients (id) on delete set null,
  client_initials  text,                              -- privacy-preserving label (spec §3)
  source           text not null default 'plaud',
  drive_file_id    text,
  filename         text,
  raw_md           text not null,
  content_hash     text not null unique,              -- dedupe key (sha-256 of raw_md)
  session_date     date,
  match_status     text not null default 'needs_review',  -- matched | needs_review | unmatched
  match_confidence real,                              -- 0..1, how sure the name match was
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists transcripts_coach_id_idx on transcripts (coach_id);
create index if not exists transcripts_client_id_idx on transcripts (client_id);
create index if not exists transcripts_match_status_idx on transcripts (match_status);
create index if not exists transcripts_session_date_idx on transcripts (session_date desc);

create trigger transcripts_set_updated_at
  before update on transcripts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- session_reports
-- One scored report per transcript. `report` holds the full engine output
-- (spec §16) and the UI renders from it. The scalar columns are denormalized
-- copies for fast trend/aggregate queries. coach_self_scores / coach_overall /
-- coach_notes are the coach's own parallel assessment (spec §13) — they sit
-- alongside the machine score and never overwrite it.
-- ---------------------------------------------------------------------------
create table if not exists session_reports (
  id                uuid primary key default gen_random_uuid(),
  transcript_id     uuid not null unique references transcripts (id) on delete cascade,
  coach_id          uuid references coaches (id) on delete set null,
  client_id         uuid references clients (id) on delete set null,
  client_initials   text,
  session_date      date,
  session_type      text,
  session_number    integer,
  engagement_total  integer,
  overall_score     numeric(2,1),                    -- machine overall (spec §6.4)
  band              text,
  report            jsonb not null,                  -- full engine output (spec §16)
  coach_self_scores jsonb,                           -- { "<competencyId>": 1..5 }
  coach_overall     numeric(2,1),
  coach_notes       text,
  status            text not null default 'scored',  -- scored | reviewed
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists session_reports_coach_id_idx on session_reports (coach_id);
create index if not exists session_reports_client_id_idx on session_reports (client_id);
create index if not exists session_reports_session_date_idx on session_reports (session_date desc);

create trigger session_reports_set_updated_at
  before update on session_reports
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Lock down: enable RLS, no policies. Server uses the service-role key.
-- ---------------------------------------------------------------------------
alter table coaches         enable row level security;
alter table transcripts     enable row level security;
alter table session_reports enable row level security;


-- ==================== 003_coach_calendar.sql ====================
-- theLeadershipWell — calendar-based transcript matching
--
-- Plaud names transcripts with a bare timestamp (e.g. "2026-06-12 16:05:41"),
-- so we match the client by aligning that time with the coach's Google
-- Calendar and reading the session's guest. The Zapier webhook runs with no
-- signed-in user, so the server needs its own calendar access: we persist the
-- coach's Google refresh token (issued because sign-in already requests offline
-- access) and mint short-lived access tokens from it.
--
-- The refresh token is sensitive. It lives only in this RLS-locked table,
-- reachable solely with the service-role key (same posture as the rest of the
-- schema). Treat it like a credential.

alter table coaches
  add column if not exists google_refresh_token text,
  add column if not exists timezone text not null default 'America/Los_Angeles';


-- ==================== 004_client_workspace.sql ====================
-- theLeadershipWell — client workspace
--
-- Extends the client record for the redesigned client workspace:
--   address         — basic contact info shown/edited on the name card
--   coaching_goals  — the current goals shown on the goals card, stored as a
--                     JSON array of { title, description } (same shape as the
--                     session-prep coaching plan). Nullable with a [] default so
--                     existing client inserts keep working unchanged.

alter table clients
  add column if not exists address text,
  add column if not exists coaching_goals jsonb default '[]'::jsonb;


-- ==================== 005_ca_notes.sql ====================
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


-- ==================== 006_supervisor_email.sql ====================
-- 006 supervisor email
-- The coach's supervisor address, so a scored report can be emailed to them.
-- Nullable; set by the coach on the Account page.

alter table public.coaches
  add column if not exists supervisor_email text;


-- ==================== 007_client_key_info_map.sql ====================
-- theLeadershipWell — client key info + coaching map
--
-- Two more persistent, per-client fields surfaced on the session-notes panel
-- (alongside the live ACTION/INSIGHT capture and the engagement goals):
--
--   key_info      — freeform reference the coach wants in front of them every
--                   session (boss's name, spouse, kids, context to remember).
--   coaching_map  — the map assigned to this client from theLeadershipWell's
--                   core practice (e.g. "6 Components"). Stored as text so any
--                   map can be named; nullable so existing clients are unchanged.

alter table clients
  add column if not exists key_info text,
  add column if not exists coaching_map text;


-- ==================== 008_note_templates.sql ====================
-- theLeadershipWell — note templates (Library)
--
-- Reusable, formatted note templates the coach authors in the Library and drops
-- into a note from the editor's "Templates" dropdown. Coach-scoped; content is
-- the same rich-text HTML the note editor produces. Reached only with the
-- service-role key, so RLS is on with no public policies (like the other tables).

create table if not exists note_templates (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references coaches (id) on delete cascade,
  name        text not null,
  content     text not null default '',   -- rich-text HTML
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists note_templates_coach_id_idx on note_templates (coach_id);

create trigger note_templates_set_updated_at
  before update on note_templates
  for each row execute function set_updated_at();

alter table note_templates enable row level security;


-- ==================== 009_action_completion.sql ====================
-- theLeadershipWell — action completion tracking
--
-- The "send to client" note email renders each action item as a click-to-log
-- checkbox (a link, since email can't run live checkboxes). Clicking it hits a
-- public endpoint keyed by an unguessable token, which marks the action done.
--
--   complete_token — unguessable key embedded in the email link (one per action)
--   completed_at   — when the client marked it done (status also flips to 'done')
--   completed_via  — how it was completed (e.g. 'email')

alter table actions
  add column if not exists complete_token uuid default gen_random_uuid(),
  add column if not exists completed_at   timestamptz,
  add column if not exists completed_via  text;

create unique index if not exists actions_complete_token_idx
  on actions (complete_token) where complete_token is not null;


-- ==================== 010_library_folders.sql ====================
-- theLeadershipWell — Library folder system
--
-- The Library becomes a folder system with two sections:
--   templates — folders (Note, Worksheets, Agreements, + custom) holding the
--               coach's note_templates
--   pdf       — folders holding uploaded PDF resources (files live in Supabase
--               Storage; pdf_resources rows are the index)
--
-- Folders and their contents are coach-scoped. Reached only with the
-- service-role key, so RLS is on with no public policies.

create table if not exists library_folders (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references coaches (id) on delete cascade,
  section     text not null,                 -- 'templates' | 'pdf'
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists library_folders_coach_section_idx on library_folders (coach_id, section);

create trigger library_folders_set_updated_at
  before update on library_folders
  for each row execute function set_updated_at();

alter table library_folders enable row level security;

-- Note templates now belong to a folder (null = unfiled). Deleting a folder
-- removes the templates it holds.
alter table note_templates
  add column if not exists folder_id uuid references library_folders (id) on delete cascade;

create index if not exists note_templates_folder_idx on note_templates (folder_id);

-- PDF resources — one row per uploaded file (the bytes live in Storage).
create table if not exists pdf_resources (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid references coaches (id) on delete cascade,
  folder_id     uuid references library_folders (id) on delete cascade,
  name          text not null,
  storage_path  text not null,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);

create index if not exists pdf_resources_folder_idx on pdf_resources (folder_id);

alter table pdf_resources enable row level security;


-- ==================== 011_agreements.sql ====================
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


-- ==================== 012_agenda_requests.sql ====================
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


-- ==================== 013_revenue_competency_prep.sql ====================
-- 013 revenue + competency focus + persisted prep sheets
--
-- 1) Per-client session fee — drives the Practice revenue cards. A flat amount
--    earned per logged session (treated as one ~1-hour session). NULL = no fee
--    on file (counts as $0 toward revenue).
alter table clients add column if not exists session_fee numeric;

-- 2) Coach's per-competency improvement focus — freeform "what I'll try" notes,
--    keyed by competency id (1..8), surfaced under the Practice competency
--    scores. Coach-scoped, never per session.
alter table coaches add column if not exists competency_focus jsonb not null default '{}'::jsonb;

-- 3) Persisted session-prep sheets — every prep email we send is snapshotted
--    here so it can be re-read in the client workspace alongside the session
--    notes. `content` is the PrepContent JSON; `html` is the rendered email.
create table if not exists prep_sheets (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references coaches(id) on delete set null,
  client_id uuid references clients(id) on delete cascade,
  content jsonb not null,
  html text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists prep_sheets_client_idx on prep_sheets (client_id, sent_at desc);

-- RLS on, no public policies — reached only via the service-role key.
alter table prep_sheets enable row level security;


-- ==================== 014_note_duration.sql ====================
-- 014 session duration on notes
--
-- Logged session length, in minutes, so the Practice "past week" revenue card
-- can value each session by its actual logged time. Defaults to 60 (the minimum
-- billable hour) so every existing note counts as one hour.
alter table notes add column if not exists duration_minutes integer not null default 60;


-- ==================== 015_coach_clients.sql ====================
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


-- ==================== 016_appointments.sql ====================
-- theLeadershipWell — scheduled sessions + pre-programmed reminders
--
-- At the end of a session the coach books the next one from the client
-- workspace ("Schedule next session"), which creates a Google Calendar event
-- (client as guest) and records it here. `appointments` is the source of truth
-- the reminder engine scans — not the calendar — so a missing/edited calendar
-- event never drops a reminder.
--
-- Reminders are "simple confirmations": a confirmation email at booking time and
-- a single nudge ~24h before. `appointment_reminders` logs what's been sent;
-- the unique (appointment_id, kind) index makes the hourly cron idempotent so a
-- reminder can never fire twice.

create table if not exists appointments (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid references coaches (id) on delete cascade,
  client_id        uuid references clients (id) on delete cascade,
  scheduled_at     timestamptz not null,
  duration_minutes integer not null default 60,
  google_event_id  text,                                  -- the created Calendar event (best-effort)
  status           text not null default 'scheduled',     -- scheduled | cancelled | completed
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists appointments_client_idx on appointments (client_id);
create index if not exists appointments_coach_sched_idx on appointments (coach_id, scheduled_at);

create trigger appointments_set_updated_at
  before update on appointments
  for each row execute function set_updated_at();

alter table appointments enable row level security;

create table if not exists appointment_reminders (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments (id) on delete cascade,
  kind           text not null,                           -- confirmation | nudge_24h
  sent_at        timestamptz not null default now()
);

-- One row per (appointment, kind): the reminder engine inserts before sending,
-- so a unique violation means "already sent" and the cron is safe to re-run.
create unique index if not exists appointment_reminders_unique_idx
  on appointment_reminders (appointment_id, kind);

alter table appointment_reminders enable row level security;


-- ==================== 017_email_signatures_communications.sql ====================
-- 017: Email signatures + communications log (Phase 1B — branded email send)
--
-- Two tables behind the client-workspace Compose Email flow:
--   * email_signatures — the single source of truth for the branded signature.
--     It is appended at SEND time (never baked into a draft body), so editing it
--     changes every future send. coach_id is nullable: a NULL row is the global
--     default; a coach-specific row (added later) overrides it.
--   * communications — the outbound log that powers the Recent Communication
--     card. Type-discriminated and direction-tagged so reminders ('reminder')
--     and future inbound reply-capture ('inbound') slot in with no refactor.
--
-- Like every table in this app, RLS is ON with no public policies — reached only
-- via the service-role key (getSupabaseAdmin). Never queried from the browser.

create table if not exists email_signatures (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references coaches(id) on delete cascade,  -- null = global default
  html        text not null,
  logo_url    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table email_signatures enable row level security;

create table if not exists communications (
  id                uuid primary key default gen_random_uuid(),
  coach_id          uuid references coaches(id) on delete set null,
  client_id         uuid not null references clients(id) on delete cascade,
  type              text not null default 'email',     -- 'email' | 'reminder' | 'prep_sheet'
  direction         text not null default 'outbound',  -- 'outbound' | 'inbound' (future)
  subject           text,
  preview           text,                              -- first ~140 chars of body, for the card
  body_html         text,
  status            text not null default 'sent',      -- 'sent' | 'failed' | 'scheduled'
  gmail_message_id  text,                              -- returned by Gmail send; future threading hook
  error_detail      text,                              -- populated when status = 'failed'
  sent_at           timestamptz not null default now()
);
alter table communications enable row level security;

create index if not exists communications_client_idx
  on communications (client_id, sent_at desc);

-- Seed Jeff's signature as the global default (coach_id = null). Email-safe
-- table layout with inline styles and a RASTER logo — the only thing mail
-- clients reliably render (SVG is stripped by Gmail/Outlook/Apple Mail). DM Sans
-- is declared but falls back to Arial/Helvetica in most clients; that's expected.
-- Keep this HTML in sync with DEFAULT_SIGNATURE_HTML in lib/signature.ts.
insert into email_signatures (coach_id, html, logo_url)
values (
  null,
  '<table cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #e5e0d8;padding-top:16px;font-family:''DM Sans'',Helvetica,Arial,sans-serif;"><tr><td style="padding-bottom:10px;"><img src="https://theleadershipwell.online/logo-email.png" width="200" alt="theLeadershipWell" style="display:block;border:0;height:auto;" /></td></tr><tr><td><div style="font-weight:700;font-size:14px;color:#111226;">Jeff Holmes</div><div style="font-size:12px;color:#8B8680;margin-top:1px;">Executive Coach &middot; theLeadershipWell</div><div style="font-size:12px;color:#8B8680;margin-top:4px;"><a href="mailto:jeff@jeffkholmes.com" style="color:#0C1940;text-decoration:none;">jeff@jeffkholmes.com</a>&nbsp;&middot;&nbsp;<a href="https://www.theleadershipwell.com" style="color:#0C1940;text-decoration:none;">theleadershipwell.com</a></div><div style="font-size:12px;margin-top:4px;"><a href="https://meetings-na2.hubspot.com/dr-jeff" style="color:#0C1940;text-decoration:none;font-weight:600;">Book a session &rarr;</a></div></td></tr></table>',
  'https://theleadershipwell.online/logo-email.png'
);


-- ==================== 018_agreement_system.sql ====================
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


-- ==================== 019_library_labels.sql ====================
-- theLeadershipWell — per-coach custom Library labels.
--
-- Lets a coach rename the fixed Library nodes (the Templates / PDF Resources /
-- Coaching Agreement home tiles and the "Unfiled" bucket) without touching the
-- internal section keys. Stored as a small JSON map keyed by node id:
--   { "templates": "...", "pdf": "...", "agreement": "...", "unfiled": "..." }
-- An absent/empty value falls back to the built-in default label.
--
-- Run by hand in the Supabase SQL editor. Idempotent.

alter table coaches
  add column if not exists library_labels jsonb not null default '{}'::jsonb;


-- ==================== 020_scheduling_settings.sql ====================
-- theLeadershipWell — per-coach scheduling settings
--
-- Two jsonb columns on `coaches` so each coach can shape how the workspace
-- scheduler behaves:
--
--   availability     — the coach's bookable hours per weekday. The scheduler
--                      warns (does not block) when a picked time falls outside
--                      these windows, and the picker can highlight in-hours slots.
--   reminder_settings — which session reminders fire: the booking confirmation
--                      (on/off) and any number of "X hours before" nudges, each
--                      toggleable. The hourly reminder cron reads this per coach.
--
-- Both are nullable. A NULL value means "use the built-in defaults" (a normal
-- Mon–Fri 9–5 week and a single 24h nudge + confirmation), so existing coaches
-- keep today's behavior until they customize.
--
-- Shapes (see lib/scheduling.ts for the canonical types + defaults):
--   availability:
--     { "0": { "enabled": false, "start": "09:00", "end": "17:00" },
--       "1": { "enabled": true,  "start": "09:00", "end": "17:00" }, ... "6": {...} }
--     (keys "0".."6" = Sunday..Saturday)
--   reminder_settings:
--     { "confirmation": true,
--       "reminders": [ { "hoursBefore": 24, "enabled": true } ] }

alter table coaches
  add column if not exists availability jsonb,
  add column if not exists reminder_settings jsonb;


-- ==================== 021_client_timezone_label.sql ====================
-- theLeadershipWell — friendly display city for a client's timezone
--
-- The picker stores an IANA zone (e.g. America/Chicago), but several cities share
-- one zone (Austin, Dallas, Houston, Chicago …). To show the coach back the city
-- they actually picked ("Austin — GMT-05:00") instead of the zone's canonical
-- city ("Chicago"), we remember the chosen label here. Purely cosmetic — all time
-- math still uses `clients.timezone`. Nullable; absent = fall back to the zone's
-- representative city.

alter table clients
  add column if not exists timezone_label text;


-- ==================== 022_nudges.sql ====================
-- 022: Nudging system — Phase A (action + insight check-ins)
--
-- A between-session nudge is a short, warm, client-facing message the system
-- drafts after a session and the coach REVIEWS before it sends. Phase A covers
-- action check-ins and insight reminders only (no framework matching, no vault,
-- no re-engagement, no auto-send — those are later phases).
--
-- A nudge moves: draft → (coach edits/approves) → scheduled → sent. Nothing
-- leaves this table for a client inbox without the coach approving it. On send it
-- reuses the existing rails: the coach's Gmail (lib/gmail.ts), the server-appended
-- signature (lib/signature.ts), and the communications log (type = 'reminder'),
-- linked back here via communication_id.
--
-- Like every table in this app, RLS is ON with no public policies — reached only
-- via the service-role key (getSupabaseAdmin). Coach-scoped in code, never RLS.

create table if not exists nudges (
  id                   uuid primary key default gen_random_uuid(),
  coach_id             uuid not null references coaches(id) on delete cascade,
  client_id            uuid not null references clients(id) on delete cascade,
  -- The session/transcript that triggered this nudge. Null for a manually-added
  -- nudge or a future time-triggered re-engagement touch.
  source_session_id    uuid references transcripts(id) on delete set null,
  type                 text not null,            -- action_checkin | insight | framework | reengagement
  origin               text not null,            -- mentioned | suggested | auto | manual
  -- The note/transcript snippet that justifies the nudge, shown to the coach in
  -- the queue so they can see what it's grounded in.
  trigger_excerpt      text,
  -- One line: why the AI proposed this (shown to the coach).
  rationale            text,
  -- Reserved for Phase B (framework nudges) — unused in Phase A.
  framework_slug       text,
  linked_resource_slug text,
  draft_subject        text,
  draft_body           text,
  status               text not null default 'draft', -- draft | approved | scheduled | sent | skipped | snoozed
  scheduled_for        timestamptz,
  sent_at              timestamptz,
  -- Set to the communications row after a successful send.
  communication_id     uuid references communications(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table nudges enable row level security;

-- The queue is read two ways: the coach's cross-client review screen
-- (coach_id + status) and the per-client workspace card (client_id).
create index if not exists nudges_coach_status_idx on nudges (coach_id, status, created_at desc);
create index if not exists nudges_client_idx on nudges (client_id, created_at desc);
-- The cron dispatches due scheduled nudges by time.
create index if not exists nudges_due_idx on nudges (status, scheduled_for)
  where status = 'scheduled';

-- Per-coach nudge settings (spacing, re-engagement cadence, and — from Phase B —
-- the vault folder). NULL = the built-in defaults; canonical shape + defaults
-- live in lib/nudges/settings.ts (dependency-free), mirroring lib/scheduling.ts.
-- Additive and nullable, so existing coaches are unchanged.
alter table coaches add column if not exists nudge_settings jsonb;


-- ==================== 023_frameworks.sql ====================
-- 023: Framework index (Phase A-parallel — vault connection)
--
-- A DERIVED index over the coach's mind garden (the TheLeadershipWell-Vault repo),
-- not a content store. The vault stays the single source of truth: this table holds
-- only POINTERS + the 1-hop association graph so the nudge engine can (a) match a
-- framework the coach named in session against `aliases`, and (b) pull the note's
-- CURRENT content live from GitHub at draft time. Note bodies are NEVER copied here.
--
-- Built/refreshed by the vault sync job (lib/vault/sync.ts), which reads only files
-- under the configured folder that carry the `framework: true` frontmatter tag
-- (double scoping). Re-runs upsert on (coach_id, slug); blob_sha lets a sync skip
-- unchanged notes.
--
-- RLS on, no public policies — reached only via the service-role key. Coach-scoped
-- in code (the vault PAT is a single, app-level read credential).

create table if not exists frameworks (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null references coaches(id) on delete cascade,
  -- Stable id from frontmatter; the matching/linking key. Unique per coach.
  slug            text not null,
  name            text not null,
  -- Everything the coach might say out loud that should match this note.
  aliases         text[] not null default '{}',
  -- Situational cues that suggest the framework even if unnamed (Phase C).
  trigger_signals text[] not null default '{}',
  -- Short "when to use" line from frontmatter (optional).
  when_to_use     text,
  -- Path within the vault repo, used to pull live content at draft time.
  vault_path      text not null,
  -- 1-hop wikilink edges: target slugs when the target is also a tagged framework,
  -- else the raw link title. The association graph used to enrich nudges.
  linked_slugs    text[] not null default '{}',
  -- The note's git blob SHA at last index — lets a sync skip unchanged files.
  blob_sha        text,
  last_synced_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table frameworks enable row level security;

create unique index if not exists frameworks_coach_slug_idx on frameworks (coach_id, slug);
create index if not exists frameworks_coach_idx on frameworks (coach_id);


-- ==================== 024_garden.sql ====================
-- 024: Garden index (supersedes 023 frameworks) — vault connection, node + edge model
--
-- A DERIVED index over the coach's mind garden (the TheLeadershipWell-Vault repo).
-- The vault stays the single source of truth: these tables hold only POINTERS +
-- the association graph so the nudge engine can match a leaf the coach is working
-- and pull the note's CURRENT content live from GitHub at draft time. Note bodies
-- are NEVER copied here.
--
-- Why this replaces 023's `frameworks`: client-facing leaves are deliberately
-- heterogeneous in `type` (framework, principle, phrase, psycap-seed,
-- psycap-deep-dive), so keying on `type == framework` / `framework: true` would
-- silently miss leaves like Hope, Clarity, Delegate, Inner HERO. A note is an
-- indexable LEAF iff its frontmatter carries `nudge_eligible` (equivalently a
-- `themes` array); `nudge_eligible: true` is the separate client-SURFACING gate.
--
-- Built/refreshed by lib/vault/sync.ts (manual button + hourly cron). RLS on, no
-- public policies — reached only via the service-role key; coach-scoped in code.

-- 023's table was empty (indexed 0) — drop it outright.
drop table if exists frameworks;

create table if not exists garden_notes (
  -- coach_id + the frontmatter `id` (a stable slug) are the identity. `id` is the
  -- edge endpoint referenced by garden_edges. Composite PK = unique per coach.
  coach_id        uuid not null references coaches(id) on delete cascade,
  id              text not null,
  title           text not null,
  -- Free-form leaf kind (framework | principle | phrase | psycap-seed | ...). Not
  -- a gate — kept for display/filtering only.
  type            text,
  -- Cross-cutting tags the nudge engine matches against (e.g. psycap, feedback).
  themes          text[] not null default '{}',
  -- Short client-facing line; present only on eligible leaves.
  summary         text,
  -- The client-surfacing gate. A leaf is indexed regardless; only `true` leaves
  -- are ever surfaced to a client.
  nudge_eligible  boolean not null default false,
  -- Spoken/alternate names → used to resolve [[wikilinks]] to ids.
  aliases         text[] not null default '{}',
  -- Path within the vault repo; used to pull live content at draft time.
  vault_path      text not null,
  -- Git blob SHA at last index (change detection; reserved).
  blob_sha        text,
  last_synced_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (coach_id, id)
);
alter table garden_notes enable row level security;
create index if not exists garden_notes_coach_idx on garden_notes (coach_id);
create index if not exists garden_notes_eligible_idx on garden_notes (coach_id, nudge_eligible);

create table if not exists garden_edges (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references coaches(id) on delete cascade,
  -- Both endpoints are garden_notes.id values (within the same coach).
  source_id   text not null,
  target_id   text not null,
  -- Where the link came from: 'parent' (frontmatter parent:), 'framework'
  -- (frontmatter frameworks:), or 'link' (inline body [[wikilink]]).
  relation    text not null default 'link',
  created_at  timestamptz not null default now(),
  foreign key (coach_id, source_id) references garden_notes (coach_id, id) on delete cascade,
  foreign key (coach_id, target_id) references garden_notes (coach_id, id) on delete cascade,
  unique (coach_id, source_id, target_id, relation)
);
alter table garden_edges enable row level security;
create index if not exists garden_edges_coach_idx on garden_edges (coach_id);
create index if not exists garden_edges_source_idx on garden_edges (coach_id, source_id);


-- ==================== 025_external_booking_capture.sql ====================
-- theLeadershipWell — external booking capture (Calendly / HubSpot → Next Appointment)
--
-- Jeff sometimes hands an overwhelmed client his Calendly or HubSpot link to book
-- the next session later. Both tools write the booking to his Google Calendar with
-- the client as a guest — the same calendar the native "Schedule next session"
-- modal writes to. So Google Calendar is the single source of truth, and we capture
-- external bookings by WATCHING the calendar (incremental events.list + a stored
-- syncToken), not by wiring per-provider webhooks.
--
-- This migration EXTENDS the existing `appointments` table (migration 016) rather
-- than adding a parallel `sessions` table: native, Calendly, and HubSpot bookings
-- all live as appointment rows, keyed by their Google event id, so "Next
-- Appointment" is one source-agnostic query.

-- Capture columns. `source` is best-effort/cosmetic (Calendly vs HubSpot is sniffed
-- from the event); it never gates matching. `attendee_email` is the match key.
-- `raw_event` keeps the Google resource for debugging/audit.
alter table appointments
  add column if not exists source         text not null default 'native', -- native | calendly | hubspot | external
  add column if not exists attendee_email text,
  add column if not exists title          text,
  add column if not exists raw_event      jsonb;

-- Idempotency key for the calendar-sync upsert: one appointment per (coach, event).
-- Partial so the many native rows created before this migration (google_event_id
-- may be null on a calendar hiccup) don't collide on null.
create unique index if not exists appointments_coach_event_idx
  on appointments (coach_id, google_event_id)
  where google_event_id is not null;

-- Surfaces the unmatched-booking review queue: an event we captured but couldn't
-- tie to a roster client lands as a client_id-null, status='scheduled' row.
create index if not exists appointments_unmatched_idx
  on appointments (coach_id)
  where client_id is null and status = 'scheduled';

-- Incremental-sync cursor: the calendar's nextSyncToken so each run pulls only the
-- delta. A 410 Gone on a stale token clears this and we full-resync.
alter table coaches
  add column if not exists calendar_sync_token text,
  add column if not exists calendar_synced_at  timestamptz;

-- Status vocabulary note (no enum to alter — `status` is plain text):
--   scheduled  — a live/upcoming session (the only status the cron + cards read)
--   cancelled  — calendar event deleted/cancelled, or a native cancel
--   completed  — past session (legacy)
--   ignored    — coach dismissed an unmatched booking; terminal, never resurfaced


-- ==================== 026_coach_growth_areas.sql ====================
-- 026: Coach Growth Areas — coach-defined development focuses + per-session assessments
--
-- Two tables, both coach-scoped with RLS. The supervisor read-only path is built
-- into the policy from day one (filter by coach role or a future supervisor_of
-- relation) even though no supervisor UI exists yet. Client-facing exposure is
-- never permitted — these are coach-internal records.
--
-- coach_growth_areas: the coach's personal development focuses (up to 5 active).
--   band_scale: JSON array of 5 band objects, band 1 anchored to the coach's
--     "least proficient" wording, band 5 to "most proficient", 2-4 AI-interpolated.
--     Each band carries a coach_edited flag so AI re-gen never clobbers a hand-edit.
--   definition_version: increments on any edit to title/description/anchors/band_scale
--     so trend charts can mark where a growth area was redefined.
--
-- growth_area_assessments: one row per growth area per scored session.
--   observed: the Observed Gate — false means no opportunity in this session, null
--     band, and the session is excluded from trend math.
--   definition_version_snapshot: the area's version at scoring time; immutable.
--
-- The 5-active cap is enforced in code (POST /api/growth-areas), not in the DB,
-- for flexibility. Apply this migration before the growth-areas APIs are used.

create table if not exists coach_growth_areas (
  id                      uuid primary key default gen_random_uuid(),
  coach_id                uuid not null references coaches(id) on delete cascade,
  title                   text not null,
  description             text not null default '',
  least_proficient_when   text not null default '',
  most_proficient_when    text not null default '',
  -- Array of 5 band objects: {band: 1..5, description: string, coach_edited: bool}
  band_scale              jsonb not null default '[]'::jsonb,
  status                  text not null default 'active' check (status in ('active', 'archived')),
  definition_version      integer not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table coach_growth_areas enable row level security;

-- Coach can read + write their own areas.
create policy "coach_growth_areas_coach_rw" on coach_growth_areas
  for all
  using (
    coach_id = (
      select id from coaches where email = current_setting('request.jwt.claims', true)::jsonb->>'email'
    )
  );

-- Index for the common query: list active areas for a coach.
create index if not exists growth_areas_coach_status_idx on coach_growth_areas (coach_id, status);


create table if not exists growth_area_assessments (
  id                          uuid primary key default gen_random_uuid(),
  growth_area_id              uuid not null references coach_growth_areas(id) on delete cascade,
  session_id                  uuid not null references session_reports(id) on delete cascade,
  coach_id                    uuid not null references coaches(id) on delete cascade,
  -- The Observed Gate: false = no opportunity in this session; band is null.
  observed                    boolean not null,
  -- null when observed = false.
  band                        integer check (band between 1 and 5),
  -- Array of {quote_or_paraphrase: string, timestamp: string|null}
  evidence                    jsonb not null default '[]'::jsonb,
  developmental_note          text not null default '',
  -- Snapshot of the area's definition_version at scoring time; never updated.
  definition_version_snapshot integer not null,
  -- One row per area per session; re-scoring replaces this row.
  unique (growth_area_id, session_id),
  created_at                  timestamptz not null default now()
);

alter table growth_area_assessments enable row level security;

create policy "growth_area_assessments_coach_rw" on growth_area_assessments
  for all
  using (
    coach_id = (
      select id from coaches where email = current_setting('request.jwt.claims', true)::jsonb->>'email'
    )
  );

create index if not exists growth_assessments_coach_idx on growth_area_assessments (coach_id);
create index if not exists growth_assessments_session_idx on growth_area_assessments (session_id);
create index if not exists growth_assessments_area_idx on growth_area_assessments (growth_area_id);


-- ==================== 027_dashboard_layouts.sql ====================
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


-- ==================== 028_billing.sql ====================
-- 027_billing.sql
-- Business Center billing tables: billing_accounts, coachees, engagements,
-- billable_sessions, invoices, invoice_lines, invoice_reminders.
-- RLS enabled; no public policies — all access via getSupabaseAdmin().

-- Billing Account (the payer)
CREATE TABLE billing_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  name          text NOT NULL,
  type          text NOT NULL CHECK (type IN ('solo','enterprise')),
  billing_email text NOT NULL,
  stripe_customer_id text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Coachee (thin link to existing client record; no roster duplication)
CREATE TABLE coachees (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id           uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  client_id          uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, client_id)
);

-- Engagement (the coaching arrangement for one coachee)
CREATE TABLE engagements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id              uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  billing_account_id    uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
  coachee_id            uuid NOT NULL REFERENCES coachees(id) ON DELETE RESTRICT,
  billing_mode          text NOT NULL CHECK (billing_mode IN ('arrears','subscription','per_engagement')),
  billing_owner         text NOT NULL CHECK (billing_owner IN ('CA','TLW')) DEFAULT 'TLW',
  status                text NOT NULL CHECK (status IN ('active','paused','ended')) DEFAULT 'active',
  -- arrears fields
  rate_hourly           numeric(10,2),
  -- subscription fields
  monthly_amount        numeric(10,2),
  billing_day           int CHECK (billing_day BETWEEN 1 AND 28),
  -- per_engagement fields
  engagement_total      numeric(10,2),
  installment_count     int CHECK (installment_count IN (1,2)),
  installment_schedule  jsonb,
  -- shared
  description_template  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Billable Session (derived from existing notes records)
CREATE TABLE billable_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id         uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  engagement_id    uuid NOT NULL REFERENCES engagements(id) ON DELETE RESTRICT,
  coachee_id       uuid NOT NULL REFERENCES coachees(id) ON DELETE RESTRICT,
  note_id          uuid REFERENCES notes(id) ON DELETE SET NULL,
  occurred_on      date NOT NULL,
  duration_hours   numeric(4,2) NOT NULL,
  amount           numeric(10,2) NOT NULL,
  billed_invoice_id uuid,  -- FK added below after invoice table
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, note_id)
);

-- Invoice (account-level; rolls up lines across engagements for a period)
CREATE TABLE invoices (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id                  uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  billing_account_id        uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
  period_start              date,
  period_end                date,
  status                    text NOT NULL CHECK (status IN
    ('draft','approved','sent','paid','overdue','failed','void')) DEFAULT 'draft',
  subtotal                  numeric(10,2) NOT NULL DEFAULT 0,
  total                     numeric(10,2) NOT NULL DEFAULT 0,
  currency                  text NOT NULL DEFAULT 'usd',
  stripe_invoice_id         text,
  stripe_payment_intent_id  text,
  stripe_error              text,
  approved_by               text,
  approved_at               timestamptz,
  sent_at                   timestamptz,
  paid_at                   timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Back-fill the FK now that invoice table exists
ALTER TABLE billable_sessions
  ADD CONSTRAINT billable_sessions_billed_invoice_id_fkey
  FOREIGN KEY (billed_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

-- Invoice Line
CREATE TABLE invoice_lines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  coachee_id   uuid REFERENCES coachees(id) ON DELETE SET NULL,
  description  text NOT NULL,
  quantity     numeric(6,2) NOT NULL DEFAULT 1,
  unit_amount  numeric(10,2) NOT NULL,
  amount       numeric(10,2) NOT NULL,
  source       text NOT NULL CHECK (source IN ('session','subscription','engagement_installment')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Invoice Reminder
CREATE TABLE invoice_reminders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  send_at    timestamptz NOT NULL,
  status     text NOT NULL CHECK (status IN ('scheduled','sent','cancelled')) DEFAULT 'scheduled',
  channel    text NOT NULL CHECK (channel IN ('email')) DEFAULT 'email',
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX billing_accounts_coach_id_idx    ON billing_accounts(coach_id);
CREATE INDEX coachees_coach_id_idx            ON coachees(coach_id);
CREATE INDEX coachees_client_id_idx           ON coachees(client_id);
CREATE INDEX engagements_coach_id_idx         ON engagements(coach_id);
CREATE INDEX engagements_billing_account_idx  ON engagements(billing_account_id);
CREATE INDEX engagements_status_owner_idx     ON engagements(coach_id, status, billing_owner);
CREATE INDEX billable_sessions_engagement_idx ON billable_sessions(engagement_id);
CREATE INDEX billable_sessions_unbilled_idx   ON billable_sessions(coach_id, billed_invoice_id)
  WHERE billed_invoice_id IS NULL;
CREATE INDEX invoices_coach_status_idx        ON invoices(coach_id, status);
CREATE INDEX invoice_lines_invoice_id_idx     ON invoice_lines(invoice_id);
CREATE INDEX invoice_reminders_due_idx        ON invoice_reminders(invoice_id, status, send_at)
  WHERE status = 'scheduled';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- No public policies. All access via getSupabaseAdmin() (service-role key).

ALTER TABLE billing_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coachees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE billable_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_reminders  ENABLE ROW LEVEL SECURITY;


-- ==================== 029_billing_fixes.sql ====================
-- 028_billing_fixes.sql
-- Two constraint fixes for the billing schema.

-- 1. Fix installment_count check to allow 1–12 (was restricted to 1 or 2).
ALTER TABLE engagements
  DROP CONSTRAINT IF EXISTS engagements_installment_count_check;

ALTER TABLE engagements
  ADD CONSTRAINT engagements_installment_count_check
    CHECK (installment_count IS NULL OR installment_count BETWEEN 1 AND 12);

-- 2. Add 'manual' as a valid invoice_lines.source (for manually created invoices).
ALTER TABLE invoice_lines
  DROP CONSTRAINT IF EXISTS invoice_lines_source_check;

ALTER TABLE invoice_lines
  ADD CONSTRAINT invoice_lines_source_check
    CHECK (source IN ('session','subscription','engagement_installment','manual'));


-- ==================== 030_billing_sessions_and_account_status.sql ====================
-- Track session allotment on engagements
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS session_count integer;

-- Allow billing accounts to be closed (vs deleted)
ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;


-- ==================== 031_client_type.sql ====================
-- Distinguish coaching clients from team coaches who appear in the client
-- roster (e.g. imported from CA for note-keeping purposes).
-- Default 'client' so all existing rows are unchanged.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'client'
    CHECK (client_type IN ('client', 'coach'));


-- ==================== 032_billing_cc_invoice_message.sql ====================
-- 031: Add billing_cc to billing_accounts and client_message to invoices.
--
-- billing_accounts.billing_cc   — optional CC email shown on invoices and
--                                 included in billing correspondence.
-- invoices.client_message       — optional free-text message the coach adds
--                                 to an invoice; shown to the client first.

ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS billing_cc text;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS client_message text;


-- ==================== 033_billing_skip_and_warnings.sql ====================
-- 032_billing_skip_and_warnings.sql
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS skip_billing boolean NOT NULL DEFAULT false;

ALTER TABLE billable_sessions ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS billing_run_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  kind text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_run_warnings_coach_idx ON billing_run_warnings (coach_id, created_at DESC);

ALTER TABLE billing_run_warnings ENABLE ROW LEVEL SECURITY;


-- ==================== 034_billing_settings.sql ====================
-- 033_billing_settings.sql
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS billing_settings jsonb;


-- ==================== 035_nudge_coach_note.sql ====================
-- 034: add coach_note to nudges
-- A private text field the coach attaches before sending (never sent to the client).
ALTER TABLE nudges ADD COLUMN IF NOT EXISTS coach_note text;

ALTER TABLE nudges ENABLE ROW LEVEL SECURITY;


-- ==================== 036_transcript_title.sql ====================
-- 034_transcript_title.sql
-- Give transcripts a human-readable title. Plaud names recordings with a bare
-- timestamp ("2026-06-12 16:05:41"), and via the Zapier webhook the filename is
-- often absent entirely, so the app was showing "Untitled recording" everywhere.
--
-- We now compute a proposed title at ingest time — ideally from the calendar
-- slot alignment ("Client Name · Mon DD, YYYY"), falling back to Plaud's own
-- summary title, then a real (non-timestamp) filename. This column stores it;
-- it's coach-editable (rename in the review queue).
--
-- Additive + nullable — NULL means the UI falls back to filename / "Untitled".

alter table transcripts add column if not exists title text;

-- Backfill existing rows so they aren't stuck at "Untitled":
-- 1) Matched rows → "Initials · Mon DD, YYYY" (the client identity we have).
update transcripts
set title = concat_ws(' · ',
      nullif(client_initials, ''),
      case when session_date is not null then to_char(session_date, 'Mon DD, YYYY') end)
where title is null
  and client_id is not null
  and (client_initials is not null or session_date is not null);

-- 2) Otherwise, use the filename when it isn't just a Plaud timestamp.
update transcripts
set title = filename
where title is null
  and filename is not null
  and btrim(filename) !~ '^\d{4}-\d{1,2}-\d{1,2}[ T_]+\d{1,2}:\d{2}';

-- 3) Anything still NULL (bare-timestamp, no client) keeps falling back in the UI.


-- ==================== 037_nudge_pdf_attachment.sql ====================
-- 035: Framework PDF attachments for nudges.
--
-- A framework nudge can carry a PDF of the framework (a Library PDF resource)
-- that is attached to the email when the nudge sends.
--
--   nudges.pdf_resource_id       — the PDF attached to THIS nudge (coach-editable
--                                  in the queue; framework nudges only in the UI).
--   garden_notes.pdf_resource_id — the framework leaf's standing PDF. New framework
--                                  nudges for that leaf default to it, and attaching
--                                  a PDF on a nudge writes it back here so future
--                                  nudges auto-attach ("attach as they get made").
--
-- Additive + nullable — nothing existing changes behavior until a PDF is attached.
-- ON DELETE SET NULL: removing a Library PDF simply detaches it everywhere.

alter table nudges
  add column if not exists pdf_resource_id uuid references pdf_resources(id) on delete set null;

alter table garden_notes
  add column if not exists pdf_resource_id uuid references pdf_resources(id) on delete set null;


-- ==================== 038_engagement_length.sql ====================
-- 036: engagement length in months.
-- Drives the engagement label on the roster cards / workspace billing bars
-- ("6-Month Engagement"). Additive + nullable: NULL falls back to a label
-- derived from the billing mode ("Fixed Engagement" / "Hourly Engagement" /
-- "Monthly Subscription"), so nothing changes until the coach sets a length.
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS length_months int;


-- ==================== 039_invoice_resend_receipt.sql ====================
-- 037: Invoice re-send + receipt tracking.
--
-- invoices.receipt_token   — unguessable token embedded in the client-facing
--                            "View & pay invoice" link (cover email + reminder
--                            email). Public GET /api/billing/invoices/receipt/[token]
--                            marks the invoice received and redirects to the
--                            Stripe hosted payment page. Token = credential,
--                            same pattern as actions.complete_token.
-- invoices.received_at     — set (once) when the client first opens the tracked
--                            invoice link. Surfaced as a "received" chip next to
--                            the "sent" status in the Business Center.
-- invoices.last_resent_at  — timestamp of the most recent re-send of the Stripe
--                            invoice email (audit trail on the invoice page).
--
-- All additive + nullable. Apply BEFORE deploying the resend/receipt code —
-- the send path, resend route, and reminder cron reference these columns.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS receipt_token text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_resent_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_receipt_token_key
  ON invoices (receipt_token)
  WHERE receipt_token IS NOT NULL;


-- ==================== 040_payment_on_file.sql ====================
-- 038_payment_on_file.sql
-- Payment on File & Charge-on-Run (build brief v3).
--
-- Stores a client's *mandate* (recorded permission to be charged off-session)
-- on a billing account, lets the coach trigger a card charge inside the billing
-- run, and adds a refund/credit/void adjustment path. Additive only — code must
-- not assume this migration is applied until Jeff confirms.
--
-- Note the brief calls this "migration 035"; the repo already has 035–037, so
-- this lands as 038 (the real next number). All three new tables get RLS with
-- no policies (service-role only, coach-scoped in code).

-- ── billing_accounts: the stored mandate ───────────────────────────────────────
ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id    text,
  ADD COLUMN IF NOT EXISTS stripe_setup_intent_id      text,
  ADD COLUMN IF NOT EXISTS payment_method_type         text DEFAULT 'card',   -- 'card' now; 'us_bank_account' reserved (ACH, §12.2)
  ADD COLUMN IF NOT EXISTS payment_method_brand        text,
  ADD COLUMN IF NOT EXISTS payment_method_last4        text,
  ADD COLUMN IF NOT EXISTS payment_method_exp_month    int,
  ADD COLUMN IF NOT EXISTS payment_method_exp_year     int,
  -- none | active | dormant | expired | removed ('pending_verification' reserved for ACH)
  ADD COLUMN IF NOT EXISTS payment_method_status       text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS authorization_token         text,          -- unguessable, single purpose
  ADD COLUMN IF NOT EXISTS authorization_token_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS authorized_at               timestamptz,
  ADD COLUMN IF NOT EXISTS authorized_ip               text,
  ADD COLUMN IF NOT EXISTS authorized_by_email         text,
  ADD COLUMN IF NOT EXISTS authorization_text          text,          -- verbatim snapshot of language shown
  ADD COLUMN IF NOT EXISTS dormant_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS reconfirmed_at              timestamptz,
  ADD COLUMN IF NOT EXISTS last_charge_at              timestamptz,   -- drives 24-month inactivity detach
  ADD COLUMN IF NOT EXISTS charge_mode                 text DEFAULT 'manual';  -- 'manual' | 'auto' (Phase B, unused)

CREATE INDEX IF NOT EXISTS billing_accounts_auth_token_idx
  ON billing_accounts(authorization_token)
  WHERE authorization_token IS NOT NULL;

-- ── invoices: charge state + adjustment denormalization ─────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS collection_method       text DEFAULT 'send_invoice',   -- 'send_invoice' | 'charge_automatically'
  -- none | succeeded | failed | action_required
  ADD COLUMN IF NOT EXISTS charge_status           text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS charge_attempted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS charge_attempt_count    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charge_failure_code     text,
  ADD COLUMN IF NOT EXISTS charge_failure_message  text,
  ADD COLUMN IF NOT EXISTS charge_retry_at         timestamptz,
  ADD COLUMN IF NOT EXISTS fallback_invoice_sent_at timestamptz,      -- set by the action_required auto-fallback
  ADD COLUMN IF NOT EXISTS receipt_sent_at         timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_communication_id uuid,
  ADD COLUMN IF NOT EXISTS refunded_cents          int DEFAULT 0,     -- denormalized for run UI; invoice_adjustments is source of truth
  ADD COLUMN IF NOT EXISTS credited_cents          int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voided_at               timestamptz;

CREATE INDEX IF NOT EXISTS invoices_charge_retry_idx
  ON invoices(charge_retry_at)
  WHERE charge_retry_at IS NOT NULL;

-- ── invoice_charge_attempts: the idempotency claim ──────────────────────────────
-- Insert a row BEFORE calling Stripe. The unique (invoice_id, attempt_number)
-- means a second concurrent request fails to claim and reads the first attempt's
-- state — mirrors the claim-before-send pattern in appointment_reminders.
CREATE TABLE IF NOT EXISTS invoice_charge_attempts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id               uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  attempt_number           int  NOT NULL,
  idempotency_key          text NOT NULL,
  status                   text NOT NULL DEFAULT 'claimed',   -- claimed | succeeded | failed
  stripe_payment_intent_id text,
  failure_code             text,
  failure_message          text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  resolved_at              timestamptz,
  UNIQUE (invoice_id, attempt_number),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS invoice_charge_attempts_invoice_idx
  ON invoice_charge_attempts(invoice_id);

-- ── invoice_adjustments: refund / credit / void (append-only) ───────────────────
-- Only status, failure_message, notified_at, communication_id, and the stripe id
-- fields are ever updated. Everything else is written once.
CREATE TABLE IF NOT EXISTS invoice_adjustments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  billing_account_id    uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  coach_id              uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  type                  text NOT NULL CHECK (type IN ('refund','credit_to_balance','void')),
  amount_cents          int  NOT NULL,
  reason                text NOT NULL,                 -- coach's plain-language reason, REQUIRED
  idempotency_key       text NOT NULL UNIQUE,
  stripe_credit_note_id text,
  stripe_refund_id      text,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  failure_message       text,
  created_by_email      text NOT NULL,
  notified_at           timestamptz,
  communication_id      uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_adjustments_invoice_idx ON invoice_adjustments(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_adjustments_coach_idx   ON invoice_adjustments(coach_id, created_at DESC);

-- ── billing_authorization_events: append-only audit trail ───────────────────────
CREATE TABLE IF NOT EXISTS billing_authorization_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  coach_id           uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  -- link_sent | page_viewed | authorized | payment_method_updated | marked_dormant
  -- | reconfirmed | removed | expired | auto_detached | charge_disputed
  event              text NOT NULL,
  ip                 text,
  detail             jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_authorization_events_account_idx
  ON billing_authorization_events(billing_account_id, created_at DESC);

-- ── RLS: enabled, no policies (service-role only) ───────────────────────────────
ALTER TABLE invoice_charge_attempts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_adjustments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_authorization_events  ENABLE ROW LEVEL SECURITY;

-- A charge-failure warning isn't tied to an engagement, so relax the NOT NULL
-- on billing_run_warnings.engagement_id (migration 032 required it). Safe/additive.
ALTER TABLE billing_run_warnings ALTER COLUMN engagement_id DROP NOT NULL;

-- communications.type gains 'receipt', 'billing_authorization', 'billing_adjustment'
-- at the application layer — the column is unconstrained text, so no DDL needed.


-- ==================== 041_prep_sheet_pipeline.sql ====================
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

