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
