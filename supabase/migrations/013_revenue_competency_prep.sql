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
