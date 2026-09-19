-- Migration 070 — AI budget enforcement (down). Exact reversal of 070_ai_budget_enforcement.sql.
-- Drops the SQL functions and the alert ledger; leaves ai_usage / ai_budgets /
-- ai_model_prices (069) untouched. Re-disables the seeded default caps so a
-- rollback returns them to their 069 state (documentation only).

DROP FUNCTION IF EXISTS ai_reserve(text, uuid, uuid, uuid, text, text, text, text, bigint, jsonb);
DROP FUNCTION IF EXISTS ai_budget_status(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS ai_release_stale(integer);
DROP FUNCTION IF EXISTS ai_month_spend(uuid, text, text, date);
DROP FUNCTION IF EXISTS ai_resolve_cap(uuid, text, text[], date);
DROP TABLE IF EXISTS ai_alerts;

UPDATE ai_budgets SET enabled = false, updated_at = now()
 WHERE period_month IS NULL AND note LIKE '%brief default%';

NOTIFY pgrst, 'reload schema';
