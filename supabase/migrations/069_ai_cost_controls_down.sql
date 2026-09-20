-- Migration 069 — AI cost controls (model prices, usage ledger, budgets)
-- Down-script (exact reversal of 069_ai_cost_controls.sql). Authored BEFORE the up.
-- Drops the three tables 069 created. Nothing else in the schema referenced them.
-- NOTE: this discards the whole AI usage ledger — every settled cost row. Export
-- `ai_usage` first if the history matters (Phase 4 reconciles it against the
-- Anthropic invoice).

DROP TABLE IF EXISTS ai_budgets;
DROP TABLE IF EXISTS ai_usage;
DROP TABLE IF EXISTS ai_model_prices;

NOTIFY pgrst, 'reload schema';
