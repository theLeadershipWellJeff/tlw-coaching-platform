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
