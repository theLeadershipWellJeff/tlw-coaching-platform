-- Migration 070 — AI budget enforcement: atomic reserve, status, stale release, alerts
-- Procedure: docs/MIGRATION_PROCEDURE.md  (snapshot → staging → verify → prod)
-- Additive (four functions + one table + enabling the seeded caps) — same
-- logged staging exception as 067–069.
--
-- Brief: "AI Cost Controls, Model Routing & Context Budgeting", Phase 2.
-- The gateway (lib/ai/client.ts) no longer inserts the ledger row itself: it
-- calls ai_reserve(), which — inside ONE transaction, under a per-org advisory
-- lock — sums the month's spend for every scope the call falls under
-- (client · org · feature), refuses if spend + worst case would exceed an
-- enabled cap, and otherwise inserts the 'reserved' row. Two concurrent
-- requests at a nearly-exhausted cap therefore cannot both pass: the second
-- sees the first's reservation. No AI in this math.
--
--   ai_resolve_cap    first enabled cap for a scope: a row dated THIS month
--                     wins over the standing (NULL-month) row; scope_ids are
--                     tried in order (client id → 'default:<client_type>' →
--                     'default'; purpose → 'principal:<principal>').
--   ai_month_spend    Σ coalesce(actual, reserved) over reserved+settled rows
--                     in the UTC month for one scope.
--   ai_reserve        the atomic check-and-insert (returns jsonb).
--   ai_budget_status  read-only view of the same numbers (soft/hard state,
--                     reset date) for the gateway's pre-check, the coach's
--                     workspace card, and the Phase 4 cockpit.
--   ai_release_stale  releases 'reserved' rows older than N minutes (a
--                     function killed mid-call) — run hourly by /api/cron/ai-budget.
--   ai_alerts         claim-before-send ledger for the 50/80/100 % org emails
--                     and the per-client soft/hard notices (unique per period).
--
-- Also ENABLES the three caps 069 seeded (org $500 · client $10 · portal
-- participant $3) — Jeff's "go" on the brief defaults, 2026-09-19.
-- Reversible via 070_ai_budget_enforcement_down.sql.

-- ---------------------------------------------------------------------------
-- ai_alerts — claim-before-send
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES organizations(id),
  kind         text NOT NULL CHECK (kind IN ('org_threshold', 'client_soft', 'client_hard')),
  scope_id     text NOT NULL,
  period_month date NOT NULL,
  threshold    integer NOT NULL DEFAULT 0,
  detail       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_alerts ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS ai_alerts_claim_uidx ON ai_alerts (org_id, kind, scope_id, period_month, threshold);
COMMENT ON TABLE ai_alerts IS 'AI spend alert claims (070): one row per (kind, scope, month, threshold); insert before sending so an alert can never double-send.';

-- ---------------------------------------------------------------------------
-- ai_resolve_cap
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai_resolve_cap(p_org_id uuid, p_scope text, p_scope_ids text[], p_period date)
RETURNS TABLE (cap_usd_micros bigint, soft_pct integer, scope_id text)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  sid text;
BEGIN
  FOREACH sid IN ARRAY p_scope_ids LOOP
    CONTINUE WHEN sid IS NULL;
    RETURN QUERY
      SELECT b.cap_usd_micros, b.soft_pct, b.scope_id
        FROM ai_budgets b
       WHERE b.org_id = p_org_id AND b.scope = p_scope AND b.scope_id = sid AND b.enabled
         AND (b.period_month = p_period OR b.period_month IS NULL)
       ORDER BY b.period_month DESC NULLS LAST
       LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END LOOP;
  RETURN;
END $$;

-- ---------------------------------------------------------------------------
-- ai_month_spend — reserved + settled, worst case where not yet settled
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai_month_spend(p_org_id uuid, p_scope text, p_scope_id text, p_period date)
RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(COALESCE(u.actual_usd_micros, u.reserved_usd_micros)), 0)::bigint
    FROM ai_usage u
   WHERE u.org_id = p_org_id
     AND u.status IN ('reserved', 'settled')
     AND u.created_at >= (p_period::timestamp AT TIME ZONE 'utc')
     AND u.created_at <  ((p_period + interval '1 month')::timestamp AT TIME ZONE 'utc')
     AND CASE p_scope
           WHEN 'client'  THEN u.principal = 'client' AND u.client_id::text = p_scope_id
           WHEN 'org'     THEN u.principal = 'client'
           WHEN 'feature' THEN u.purpose = p_scope_id
           ELSE false
         END;
$$;

-- ---------------------------------------------------------------------------
-- ai_reserve — atomic check-and-insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai_reserve(
  p_request_id text, p_org_id uuid, p_coach_id uuid, p_client_id uuid, p_principal text,
  p_purpose text, p_feature text, p_model text, p_reserved bigint, p_metadata jsonb
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_period  date := date_trunc('month', now() AT TIME ZONE 'utc')::date;
  v_resets  date := (date_trunc('month', now() AT TIME ZONE 'utc') + interval '1 month')::date;
  v_ctype   text;
  v_cap     record;
  v_spent   bigint;
  v_id      uuid;
BEGIN
  -- One lock per org: every reserve in the org is serialized, so the sums below
  -- always include every earlier reservation. Cheap at this scale.
  PERFORM pg_advisory_xact_lock(hashtext('ai_reserve:' || p_org_id::text));

  IF p_principal = 'client' AND p_client_id IS NOT NULL THEN
    SELECT c.client_type INTO v_ctype FROM clients c WHERE c.id = p_client_id;
    SELECT * INTO v_cap FROM ai_resolve_cap(p_org_id, 'client', ARRAY[p_client_id::text, 'default:' || COALESCE(v_ctype, 'client'), 'default'], v_period);
    IF v_cap.cap_usd_micros IS NOT NULL THEN
      v_spent := ai_month_spend(p_org_id, 'client', p_client_id::text, v_period);
      IF v_spent + p_reserved > v_cap.cap_usd_micros THEN
        RETURN jsonb_build_object('ok', false, 'scope', 'client', 'cap', v_cap.cap_usd_micros, 'spent', v_spent, 'reserved', p_reserved, 'resets_on', v_resets);
      END IF;
    END IF;

    SELECT * INTO v_cap FROM ai_resolve_cap(p_org_id, 'org', ARRAY[p_org_id::text], v_period);
    IF v_cap.cap_usd_micros IS NOT NULL THEN
      v_spent := ai_month_spend(p_org_id, 'org', p_org_id::text, v_period);
      IF v_spent + p_reserved > v_cap.cap_usd_micros THEN
        RETURN jsonb_build_object('ok', false, 'scope', 'org', 'cap', v_cap.cap_usd_micros, 'spent', v_spent, 'reserved', p_reserved, 'resets_on', v_resets);
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_cap FROM ai_resolve_cap(p_org_id, 'feature', ARRAY[p_purpose, 'principal:' || p_principal], v_period);
  IF v_cap.cap_usd_micros IS NOT NULL THEN
    v_spent := ai_month_spend(p_org_id, 'feature', p_purpose, v_period);
    IF v_spent + p_reserved > v_cap.cap_usd_micros THEN
      RETURN jsonb_build_object('ok', false, 'scope', 'feature', 'cap', v_cap.cap_usd_micros, 'spent', v_spent, 'reserved', p_reserved, 'resets_on', v_resets);
    END IF;
  END IF;

  INSERT INTO ai_usage (request_id, org_id, coach_id, client_id, principal, purpose, feature, model, status, reserved_usd_micros, metadata)
  VALUES (p_request_id, p_org_id, p_coach_id, p_client_id, p_principal, p_purpose, p_feature, p_model, 'reserved', p_reserved, p_metadata)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- ---------------------------------------------------------------------------
-- ai_budget_status — the same numbers, read-only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai_budget_status(p_org_id uuid, p_client_id uuid, p_principal text, p_purpose text)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_period date := date_trunc('month', now() AT TIME ZONE 'utc')::date;
  v_resets date := (date_trunc('month', now() AT TIME ZONE 'utc') + interval '1 month')::date;
  v_ctype  text;
  v_cap    record;
  v_spent  bigint;
  v_client jsonb := NULL;
  v_org    jsonb := NULL;
  v_feat   jsonb := NULL;
  v_state  text := 'ok';
BEGIN
  IF p_client_id IS NOT NULL THEN
    SELECT c.client_type INTO v_ctype FROM clients c WHERE c.id = p_client_id;
    SELECT * INTO v_cap FROM ai_resolve_cap(p_org_id, 'client', ARRAY[p_client_id::text, 'default:' || COALESCE(v_ctype, 'client'), 'default'], v_period);
    v_spent := ai_month_spend(p_org_id, 'client', p_client_id::text, v_period);
    v_client := jsonb_build_object('spent', v_spent, 'cap', v_cap.cap_usd_micros, 'soft_pct', v_cap.soft_pct, 'source', v_cap.scope_id);
    IF v_cap.cap_usd_micros IS NOT NULL THEN
      IF v_spent >= v_cap.cap_usd_micros THEN v_state := 'hard';
      ELSIF v_spent * 100 >= v_cap.cap_usd_micros * v_cap.soft_pct THEN v_state := 'soft';
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_cap FROM ai_resolve_cap(p_org_id, 'org', ARRAY[p_org_id::text], v_period);
  v_spent := ai_month_spend(p_org_id, 'org', p_org_id::text, v_period);
  v_org := jsonb_build_object('spent', v_spent, 'cap', v_cap.cap_usd_micros, 'soft_pct', v_cap.soft_pct);
  IF p_principal = 'client' AND v_cap.cap_usd_micros IS NOT NULL AND v_spent >= v_cap.cap_usd_micros THEN v_state := 'hard'; END IF;

  IF p_purpose IS NOT NULL THEN
    SELECT * INTO v_cap FROM ai_resolve_cap(p_org_id, 'feature', ARRAY[p_purpose, 'principal:' || COALESCE(p_principal, 'system')], v_period);
    v_spent := ai_month_spend(p_org_id, 'feature', p_purpose, v_period);
    v_feat := jsonb_build_object('spent', v_spent, 'cap', v_cap.cap_usd_micros, 'soft_pct', v_cap.soft_pct);
    IF v_cap.cap_usd_micros IS NOT NULL AND v_spent >= v_cap.cap_usd_micros THEN v_state := 'hard'; END IF;
  END IF;

  RETURN jsonb_build_object('state', v_state, 'period_month', v_period, 'resets_on', v_resets, 'client', v_client, 'org', v_org, 'feature', v_feat);
END $$;

-- ---------------------------------------------------------------------------
-- ai_release_stale — a reservation older than N minutes is a dead call
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai_release_stale(p_minutes integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  n integer;
BEGIN
  UPDATE ai_usage
     SET status = 'released', error = 'stale reservation released by cron', settled_at = now()
   WHERE status = 'reserved' AND created_at < now() - make_interval(mins => p_minutes);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ---------------------------------------------------------------------------
-- Enforcement ON for the seeded defaults (Jeff, 2026-09-19)
-- ---------------------------------------------------------------------------
UPDATE ai_budgets SET enabled = true, updated_at = now()
 WHERE period_month IS NULL AND note LIKE '%brief default%';

NOTIFY pgrst, 'reload schema';
