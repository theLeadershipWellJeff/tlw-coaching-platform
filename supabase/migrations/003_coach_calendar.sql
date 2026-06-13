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
