-- Migration 057 — Coach plans, coach billing (Stripe subscription), admin audit log  (UP)
--
-- The Admin Command Center (Business Center → Command Center) needs three things:
--
-- 1. A per-coach PLAN — beta | free | paying — so the supervisor can see at a
--    glance who is beta testing, who rides free, and who pays. `plan` is
--    hand-set from the command center; `plan_note` is a free-text annotation
--    ("comped through Q4", "founding tester").
--
-- 2. Coach BILLING state — a Stripe subscription per coach, collected via
--    Stripe hosted Checkout (subscription mode; card entry never touches a TLW
--    page). `stripe_customer_id` / `stripe_subscription_id` tie the coach row
--    to Stripe; `subscription_status` mirrors Stripe's status (active,
--    trialing, past_due, canceled, …) via webhook. An active/trialing
--    subscription auto-promotes `plan` to 'paying'; a canceled one drops it to
--    'free' — but `plan` stays hand-editable for comped/beta arrangements.
--
-- 3. `admin_audit_log` — one append-only row per supervisor admin action
--    (plan change, on-behalf portal invite resend, portal unlock, billing link
--    sent), so "who did what to whose account" is always answerable.
--
-- All additive. Reversible via 057_coach_plans_admin_down.sql.

-- 1. Plan label. Unconstrained text (consistent with the rest of the schema);
--    the app writes only beta | free | paying. Existing coaches read as 'beta'.
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'beta';
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS plan_note text;

-- 2. Coach billing (Stripe subscription).
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS subscription_status text;

-- The webhook resolves a subscription event back to a coach by these ids.
CREATE INDEX IF NOT EXISTS coaches_stripe_customer_idx
  ON coaches (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS coaches_stripe_subscription_idx
  ON coaches (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- 3. Admin audit log (append-only; never updated or deleted by the app).
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                     REFERENCES organizations(id),
  -- Who did it. SET NULL so removing a coach never destroys the audit trail.
  actor_coach_id   uuid REFERENCES coaches(id) ON DELETE SET NULL,
  -- 'plan_change' | 'portal_invite_resend' | 'portal_unlock'
  -- | 'billing_checkout_link' | 'coach_added' | 'coach_removed' | …
  action           text NOT NULL,
  target_coach_id  uuid REFERENCES coaches(id) ON DELETE SET NULL,
  target_client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  -- Small structured context (old/new plan, sent-to email). Never secrets.
  detail           jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
  ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_org_id_idx
  ON admin_audit_log (org_id);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
