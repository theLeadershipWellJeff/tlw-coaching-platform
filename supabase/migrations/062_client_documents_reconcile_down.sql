-- Down-script for 062 — intentionally a no-op.
-- 062 only adds columns migration 059/060 already define; dropping them would
-- break the app. Roll back 059/060 with their own down-scripts instead.
SELECT 1;
