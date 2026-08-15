-- Migration 051 — per-coach client-facing booking link  (UP)
--
-- The Client Portal's "Schedule your next session" button. Clients book through
-- the coach's own scheduler (HubSpot Meetings, Calendly, etc.), which already
-- writes the booking to the coach's Google Calendar — so the existing
-- calendar-watch capture (migration 025) picks it up and surfaces it as the
-- client's Next Appointment with no per-provider integration.
--
-- Until now this link existed in exactly one place: hand-written into the "Book
-- a session →" line of the seeded email signature. This promotes it to a real
-- per-coach column so the portal and the signature can read one value.
--
-- Additive and nullable: NULL simply means the portal shows no booking button.
-- Reversible via 051_coach_booking_url_down.sql.

alter table coaches
  add column if not exists booking_url text;

-- Seed the founding coach's existing HubSpot link (the one already living in the
-- seeded signature) so the portal button works on day one. Idempotent, and
-- scoped so it can never overwrite a coach who has already set their own.
update coaches
   set booking_url = 'https://meetings-na2.hubspot.com/dr-jeff'
 where booking_url is null
   and email in ('jeff@jeffkholmes.com', 'jeff@theleadershipwell.com');
