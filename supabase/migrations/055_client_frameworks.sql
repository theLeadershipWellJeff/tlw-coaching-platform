-- Migration 055 — frameworks surfaced to a client  (UP)
--
-- The portal's Frameworks card previously derived its list from the client's
-- `type='framework'` nudges, so a framework only appeared if a nudge about it
-- was actually drafted and kept. The nudge pipeline already detects when a
-- session NAMES a framework — but that detection is then mostly discarded by
-- the 2-per-window cap, which is about how much mail a client should get, not
-- about what they've discussed.
--
-- This records every detected framework relationship at scoring time,
-- independent of whether a nudge survives. `source` distinguishes the two:
--   'mentioned' — the coach named it in a scored session
--   'nudged'    — a framework nudge was sent about it
--   'coach'     — assigned by hand (also used to correct a false positive)
--
-- `dismissed_at` is the coach's override: a mention the model got wrong is
-- hidden from the client without deleting the record of the detection.
--
-- Reversible via 055_client_frameworks_down.sql.

create table if not exists client_frameworks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default '00000000-0000-4000-8000-000000000001'
                   references organizations(id),
  client_id      uuid not null references clients(id) on delete cascade,
  coach_id       uuid not null references coaches(id) on delete cascade,
  -- Matches garden_notes.id (the leaf slug). No FK: the garden index is rebuilt
  -- wholesale by vault sync, and a leaf briefly missing mid-sync must not
  -- cascade-delete a client's history. Reads re-check the leaf and its
  -- nudge_eligible gate anyway.
  framework_slug text not null,
  source         text not null default 'mentioned',
  -- The transcript the mention came from, when it came from one.
  transcript_id  uuid references transcripts(id) on delete set null,
  dismissed_at   timestamptz,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

-- One row per client per framework; repeat mentions bump last_seen_at.
create unique index if not exists client_frameworks_unique_idx
  on client_frameworks (client_id, framework_slug);
create index if not exists client_frameworks_client_idx
  on client_frameworks (client_id, dismissed_at);
create index if not exists client_frameworks_org_id_idx
  on client_frameworks (org_id);

alter table client_frameworks enable row level security;
