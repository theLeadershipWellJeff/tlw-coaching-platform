-- Migration 058 — saved session plans  (DOWN)
--
-- Drops the saved-plans table. This deletes every saved session plan (the
-- generated briefs AND the coach's own notepad plans) — the app degrades
-- gracefully (the Session plans card reports the feature unavailable and the
-- window's Save button surfaces a clear error), but the data is gone.

drop table if exists session_plans;
