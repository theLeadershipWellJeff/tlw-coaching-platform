-- Migration 075 — relabel reminder sign-in tokens (DOWN)
-- Puts every 'reminder' token back to 'login'. Only correct together with
-- reverting the code change (lib/portal/tokens.ts + reminders.ts); the old code
-- signs in only 'login' tokens.

UPDATE client_tokens SET purpose = 'login' WHERE purpose = 'reminder';
