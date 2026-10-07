-- Migration 075 — relabel sign-in tokens minted by portal reminder emails (UP)
-- Data only, no schema change. Idempotent.
--
-- Before this fix every portal reminder email minted its sign-in link with
-- client_tokens.purpose = 'login' — the same value an invitation uses — so the
-- welcome ladder (anchored on the latest 'login' token) restarted on every
-- reminder and an invited-but-never-signed-in client got a welcome email
-- every 3 days, forever. The code now mints reminder links as 'reminder'.
-- This relabels the links already minted the old way, so the clients already
-- caught in the loop stop now instead of getting up to two more emails.
--
-- Match: a 'login' token created for the same client within 2 minutes after a
-- portal_reminders claim row (the cron claims the ledger row, then mints the
-- token, then sends). A real invitation landing in that window is the only
-- false positive; it would cost one "invited at" date, nothing else — both
-- purposes still sign the client in.

UPDATE client_tokens t
   SET purpose = 'reminder'
  FROM portal_reminders r
 WHERE t.purpose = 'login'
   AND t.client_id = r.client_id
   AND t.created_at >= r.sent_at
   AND t.created_at <  r.sent_at + interval '2 minutes';
