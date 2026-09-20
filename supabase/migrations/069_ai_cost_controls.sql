-- Migration 069 — AI cost controls: model prices, usage ledger, budgets
-- Procedure: docs/MIGRATION_PROCEDURE.md  (snapshot → staging → verify → prod)
-- Additive only (three new tables, seed rows, no changes to existing tables) —
-- the same logged staging exception as 067/068 applies.
--
-- Brief: "AI Cost Controls, Model Routing & Context Budgeting", Phase 1.
-- Every Anthropic call now goes through ONE gateway (lib/ai/client.ts) which
-- writes a row here BEFORE the call (status 'reserved', worst-case cost) and
-- settles it with the response's real token usage AFTER ('settled'), or marks
-- it 'released' on error. Money is stored as integer USD micros (1 USD =
-- 1,000,000) — never floats. Prices are DATA (ai_model_prices), not code.
--
--   ai_model_prices  per-model list prices, per million tokens, in micros;
--                    the newest effective_from ≤ today wins. Seeded from
--                    platform.claude.com/docs/en/about-claude/pricing (2026-09-18).
--   ai_usage         the ledger — one row per Anthropic request, tenant-scoped
--                    (org_id / coach_id / client_id), tagged with the routing
--                    purpose + the calling feature + who the call was for
--                    (principal). request_id is the idempotency key.
--   ai_budgets       caps per scope. Phase 1 seeds the brief's defaults with
--                    enabled = false; Phase 2 turns enforcement on. period_month
--                    NULL = a standing default for every month; a dated row
--                    overrides that month only (how "Extend this month" works).
--
-- Reversible via 069_ai_cost_controls_down.sql (drops the ledger).

-- ---------------------------------------------------------------------------
-- ai_model_prices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_model_prices (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model                       text NOT NULL,
  -- USD micros per 1,000,000 tokens (so $5.00/MTok = 5000000).
  input_per_mtok_micros       bigint NOT NULL CHECK (input_per_mtok_micros >= 0),
  output_per_mtok_micros      bigint NOT NULL CHECK (output_per_mtok_micros >= 0),
  cache_read_per_mtok_micros  bigint NOT NULL CHECK (cache_read_per_mtok_micros >= 0),
  -- 5-minute cache write (1.25× input). The 1h write (2×) is not used by the app.
  cache_write_per_mtok_micros bigint NOT NULL CHECK (cache_write_per_mtok_micros >= 0),
  effective_from              date NOT NULL DEFAULT current_date,
  source                      text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model, effective_from)
);
ALTER TABLE ai_model_prices ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE ai_model_prices IS
  'AI list prices per model, USD micros per million tokens (069). Newest effective_from <= today wins.';

INSERT INTO ai_model_prices
  (model, input_per_mtok_micros, output_per_mtok_micros, cache_read_per_mtok_micros, cache_write_per_mtok_micros, effective_from, source)
VALUES
  ('claude-opus-5',              5000000, 25000000, 500000, 6250000, '2026-09-18', 'platform.claude.com/docs/en/about-claude/pricing 2026-09-18'),
  ('claude-sonnet-5',            2000000, 10000000, 200000, 2500000, '2026-09-18', 'platform.claude.com/docs/en/about-claude/pricing 2026-09-18'),
  ('claude-haiku-4-5-20251001',  1000000,  5000000, 100000, 1250000, '2026-09-18', 'platform.claude.com/docs/en/about-claude/pricing 2026-09-18'),
  ('claude-haiku-4-5',           1000000,  5000000, 100000, 1250000, '2026-09-18', 'alias of claude-haiku-4-5-20251001'),
  ('claude-sonnet-4-6',          3000000, 15000000, 300000, 3750000, '2026-09-18', 'platform.claude.com/docs/en/about-claude/pricing 2026-09-18'),
  ('claude-opus-4-8',            5000000, 25000000, 500000, 6250000, '2026-09-18', 'platform.claude.com/docs/en/about-claude/pricing 2026-09-18')
ON CONFLICT (model, effective_from) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ai_usage — the ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_usage (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          text NOT NULL UNIQUE,
  org_id              uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES organizations(id),
  coach_id            uuid REFERENCES coaches(id) ON DELETE SET NULL,
  client_id           uuid REFERENCES clients(id) ON DELETE SET NULL,
  principal           text NOT NULL CHECK (principal IN ('coach', 'client', 'system')),
  -- purpose = the routing key in lib/ai/models.ts (what decides the model);
  -- feature = the caller's finer label (e.g. 'portal_chat:general', 'scoring:rescore').
  purpose             text NOT NULL,
  feature             text NOT NULL,
  model               text NOT NULL,
  status              text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'released')),
  reserved_usd_micros bigint NOT NULL DEFAULT 0,
  input_tokens        integer,
  output_tokens       integer,
  cache_read_tokens   integer,
  cache_write_tokens  integer,
  actual_usd_micros   bigint,
  stop_reason         text,
  error               text,
  duration_ms         integer,
  -- free-form: effort, streamed, price_missing, estimated_input_tokens; Phase 3 adds slice sizes.
  metadata            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  settled_at          timestamptz
);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ai_usage_org_created_idx    ON ai_usage (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_client_created_idx ON ai_usage (client_id, created_at DESC) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_usage_coach_created_idx  ON ai_usage (coach_id, created_at DESC) WHERE coach_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_usage_feature_created_idx ON ai_usage (org_id, feature, created_at DESC);
-- The stale-reservation sweep (Phase 2) and the budget check read only open rows.
CREATE INDEX IF NOT EXISTS ai_usage_reserved_idx       ON ai_usage (created_at) WHERE status = 'reserved';
COMMENT ON TABLE ai_usage IS
  'AI usage ledger (069): one row per Anthropic request. reserved (worst case, before the call) -> settled (actual usage) | released (error). USD micros.';

-- ---------------------------------------------------------------------------
-- ai_budgets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_budgets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES organizations(id),
  scope          text NOT NULL CHECK (scope IN ('org', 'client', 'feature')),
  -- org:     the org id (the client-principal ceiling)
  -- client:  a client uuid, or 'default' / 'default:<client_type>' (e.g. 'default:portal')
  -- feature: a purpose name from lib/ai/models.ts, or a family ('coach')
  scope_id       text NOT NULL,
  -- first day of the month this row applies to; NULL = standing default for every month
  period_month   date CHECK (period_month IS NULL OR period_month = date_trunc('month', period_month)::date),
  cap_usd_micros bigint NOT NULL CHECK (cap_usd_micros >= 0),
  soft_pct       integer NOT NULL DEFAULT 80 CHECK (soft_pct BETWEEN 0 AND 100),
  enabled        boolean NOT NULL DEFAULT false,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_budgets ENABLE ROW LEVEL SECURITY;
-- One row per (org, scope, scope_id, month); NULL months collapse onto one sentinel.
CREATE UNIQUE INDEX IF NOT EXISTS ai_budgets_scope_period_uidx
  ON ai_budgets (org_id, scope, scope_id, COALESCE(period_month, '1970-01-01'::date));
COMMENT ON TABLE ai_budgets IS
  'AI spend caps per scope (069). enabled=false rows are documentation only; Phase 2 enforces enabled rows. USD micros.';

-- Brief defaults, enforcement OFF until Phase 2 (and until Jeff confirms the numbers):
--   org portal ceiling $500/month · per-client $10/month · ZF/portal participant $3/month
INSERT INTO ai_budgets (org_id, scope, scope_id, period_month, cap_usd_micros, soft_pct, enabled, note) VALUES
  ('00000000-0000-4000-8000-000000000001', 'org',    '00000000-0000-4000-8000-000000000001', NULL, 500000000, 80, false, 'Org ceiling for all client-principal (portal) calls — brief default $500/month'),
  ('00000000-0000-4000-8000-000000000001', 'client', 'default',                              NULL,  10000000, 80, false, 'Per-client portal cap — brief default $10/month'),
  ('00000000-0000-4000-8000-000000000001', 'client', 'default:portal',                       NULL,   3000000, 80, false, 'ZF 360 participant cap (client_type = portal) — brief default $3/month')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
