-- 038: Meeting link on appointments.
--
-- The Zoom (or other) meeting link for a booked session. Set by the coach in the
-- "Schedule next session" form (prefilled from the last link used), written into
-- the Google Calendar event (location + description) at booking, and rendered as
-- a "Join the meeting" button in the confirmation email and every reminder nudge.
-- The external-booking sync (Calendly/HubSpot calendar watch) also fills it from
-- the event's conference data, so reminders for external bookings carry the link.
--
-- Additive + nullable: existing rows are unchanged; a NULL link simply means the
-- emails/calendar event render without a join button, exactly as before.

alter table appointments add column if not exists meeting_link text;
