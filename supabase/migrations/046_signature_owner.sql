-- 046: Attach the seeded global email signature to Jeff's coach row.
--
-- Multi-coach change: signature resolution no longer falls back to the global
-- (coach_id IS NULL) row for coaches with an identity — that row carries Jeff's
-- personal signature, which must never append under another coach's email.
-- Coaches without a saved signature now get a generic TLW signature built from
-- their own name/email, and can build their own in Account → Email signature.
--
-- This migration preserves Jeff's existing signature exactly by converting the
-- seeded global row into HIS coach-specific row (only if he doesn't already
-- have one). Idempotent; safe to re-run. No schema change.

update email_signatures
set coach_id = (select id from coaches where email = 'jeff@jeffkholmes.com')
where coach_id is null
  and exists (select 1 from coaches where email = 'jeff@jeffkholmes.com')
  and not exists (
    select 1 from email_signatures es2
    where es2.coach_id = (select id from coaches where email = 'jeff@jeffkholmes.com')
  );
