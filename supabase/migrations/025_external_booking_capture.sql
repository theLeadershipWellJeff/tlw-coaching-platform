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
