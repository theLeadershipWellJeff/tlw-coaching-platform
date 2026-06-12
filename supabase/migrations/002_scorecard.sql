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
