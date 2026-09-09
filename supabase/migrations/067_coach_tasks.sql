-- Migration 067 — coach attention queue, session-note close-out, cron run log
-- Procedure: docs/MIGRATION_PROCEDURE.md  (snapshot → staging → verify → prod)
-- Applied to PRODUCTION WITHOUT STAGING under a logged exception (staging is
-- paused; the change is additive only) — see APP_STATE.md.
--
--  1. coach_tasks — a generic per-coach task queue ("Needs Your Attention").
--     v1 populates it with session-note tasks only (subject_type
--     'session_note', task_type 'write_note' | 'send_note'), but subject_type
--     and task_type are deliberately UNCONSTRAINED text so unmatched bookings,
--     billing review, and nudge approvals can be added later with no migration.
--     States: pending | sent | filed | dismissed (no snooze). The partial unique
--     index is the idempotency guard — a cron re-run cannot double-create a
--     pending task for the same appointment + type.
--     Isolation is application code: every query filters by coach_id.
--
--  2. cron_runs — the reviewable failure queue for every Vercel cron. One row
--     per run (running → ok | failed) with a summary and the error text, so a
--     job that dies leaves evidence. Platform-wide (all seven crons write it),
--     not tenant data; org_id is carried for schema uniformity only.
--
--  3. notes — session-note close-out columns. status is a VIEW FILTER ONLY:
--     the prep engine, nudge pipeline, scorecard and every aggregate keep
--     reading notes of all statuses; a sent note is hidden in the workspace UI
--     only. Sent-state truth stays on the 050 columns (sent_to_client_at,
--     client_communication_id) — code treats a note as sent when EITHER
--     status = 'sent' OR sent_to_client_at IS NOT NULL, so no backfill is
--     needed and pre-067 sends stay correct.
--
--  4. coaches — daily digest settings (hour in the coach's timezone, on/off)
--     and the once-a-day idempotency stamp.
--
-- All additive (one new table + one log table + defaulted/nullable columns, no
-- drops, no type changes, no row backfill). Reversible via
-- 067_coach_tasks_down.sql.

-- 1. coach_tasks ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                     REFERENCES organizations(id),
  coach_id         uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  client_id        uuid REFERENCES clients(id) ON DELETE CASCADE,
  appointment_id   uuid REFERENCES appointments(id) ON DELETE CASCADE,
  subject_type     text NOT NULL DEFAULT 'session_note',   -- extensible
  task_type        text NOT NULL,                          -- 'write_note' | 'send_note' (extensible)
  state            text NOT NULL DEFAULT 'pending',        -- 'pending' | 'sent' | 'filed' | 'dismissed'
  due_at           timestamptz NOT NULL,
  resolved_at      timestamptz,
  resolved_by      uuid REFERENCES coaches(id),            -- NULL = resolved by the system (cron reconcile)
  resolution_note  text,
  digest_count     int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Idempotency guard: at most ONE pending task per (coach, appointment, type).
CREATE UNIQUE INDEX IF NOT EXISTS coach_tasks_pending_once_idx
  ON coach_tasks (coach_id, appointment_id, task_type)
  WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS coach_tasks_coach_state_due_idx
  ON coach_tasks (coach_id, state, due_at);
CREATE INDEX IF NOT EXISTS coach_tasks_appointment_idx ON coach_tasks (appointment_id);
CREATE INDEX IF NOT EXISTS coach_tasks_org_id_idx ON coach_tasks (org_id);

DROP TRIGGER IF EXISTS coach_tasks_set_updated_at ON coach_tasks;
CREATE TRIGGER coach_tasks_set_updated_at
  BEFORE UPDATE ON coach_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE coach_tasks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE coach_tasks IS
  'Per-coach attention queue. v1: session-note tasks. subject_type/task_type are open text so new task kinds need no migration. Scoped by coach_id in application code.';

-- 2. cron_runs --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cron_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                 REFERENCES organizations(id),
  job          text NOT NULL,                       -- 'reminders' | 'coach-tasks' | 'coach-digest' | ...
  status       text NOT NULL DEFAULT 'running',     -- 'running' | 'ok' | 'failed'
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  summary      jsonb,
  error        text
);
CREATE INDEX IF NOT EXISTS cron_runs_job_started_idx ON cron_runs (job, started_at DESC);
CREATE INDEX IF NOT EXISTS cron_runs_failed_idx
  ON cron_runs (started_at DESC) WHERE status <> 'ok';
ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE cron_runs IS
  'One row per cron run (running → ok | failed). The reviewable failure queue: a job that dies must leave evidence.';

-- 3. notes — close-out columns (status is a VIEW filter only) ----------------
ALTER TABLE notes ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS generated_narrative text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS narrative_generated_at timestamptz;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS filed_at timestamptz;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS reopened_at timestamptz;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS reopen_count int NOT NULL DEFAULT 0;

COMMENT ON COLUMN notes.status IS
  'draft | sent | filed. VIEW FILTER ONLY — never filter data consumers (prep, nudges, scoring, aggregates) on it. Sent truth = sent_to_client_at (050); code reads sent as status=sent OR sent_to_client_at IS NOT NULL.';
COMMENT ON COLUMN notes.generated_narrative IS
  'Cached Claude client-narrative draft for the send flow; generated once, edited by the coach, never regenerated on reopen.';

-- 4. coaches — digest settings ---------------------------------------------
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS digest_hour int NOT NULL DEFAULT 17;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS last_digest_sent_on date;

ALTER TABLE coaches DROP CONSTRAINT IF EXISTS coaches_digest_hour_range;
ALTER TABLE coaches ADD CONSTRAINT coaches_digest_hour_range CHECK (digest_hour BETWEEN 0 AND 23);

COMMENT ON COLUMN coaches.digest_hour IS
  'Local hour (0-23, coaches.timezone) the daily Needs-Your-Attention digest is sent. Default 17.';
COMMENT ON COLUMN coaches.last_digest_sent_on IS
  'Coach-local date of the last digest actually sent (idempotency). Not updated when there was nothing to send.';

NOTIFY pgrst, 'reload schema';
