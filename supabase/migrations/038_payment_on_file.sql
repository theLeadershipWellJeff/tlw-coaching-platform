-- 038_payment_on_file.sql
-- Payment on File & Charge-on-Run (build brief v3).
--
-- Stores a client's *mandate* (recorded permission to be charged off-session)
-- on a billing account, lets the coach trigger a card charge inside the billing
-- run, and adds a refund/credit/void adjustment path. Additive only — code must
-- not assume this migration is applied until Jeff confirms.
--
-- Note the brief calls this "migration 035"; the repo already has 035–037, so
-- this lands as 038 (the real next number). All three new tables get RLS with
-- no policies (service-role only, coach-scoped in code).

-- ── billing_accounts: the stored mandate ───────────────────────────────────────
ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id    text,
  ADD COLUMN IF NOT EXISTS stripe_setup_intent_id      text,
  ADD COLUMN IF NOT EXISTS payment_method_type         text DEFAULT 'card',   -- 'card' now; 'us_bank_account' reserved (ACH, §12.2)
  ADD COLUMN IF NOT EXISTS payment_method_brand        text,
  ADD COLUMN IF NOT EXISTS payment_method_last4        text,
  ADD COLUMN IF NOT EXISTS payment_method_exp_month    int,
  ADD COLUMN IF NOT EXISTS payment_method_exp_year     int,
  -- none | active | dormant | expired | removed ('pending_verification' reserved for ACH)
  ADD COLUMN IF NOT EXISTS payment_method_status       text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS authorization_token         text,          -- unguessable, single purpose
  ADD COLUMN IF NOT EXISTS authorization_token_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS authorized_at               timestamptz,
  ADD COLUMN IF NOT EXISTS authorized_ip               text,
  ADD COLUMN IF NOT EXISTS authorized_by_email         text,
  ADD COLUMN IF NOT EXISTS authorization_text          text,          -- verbatim snapshot of language shown
  ADD COLUMN IF NOT EXISTS dormant_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS reconfirmed_at              timestamptz,
  ADD COLUMN IF NOT EXISTS last_charge_at              timestamptz,   -- drives 24-month inactivity detach
  ADD COLUMN IF NOT EXISTS charge_mode                 text DEFAULT 'manual';  -- 'manual' | 'auto' (Phase B, unused)

CREATE INDEX IF NOT EXISTS billing_accounts_auth_token_idx
  ON billing_accounts(authorization_token)
  WHERE authorization_token IS NOT NULL;

-- ── invoices: charge state + adjustment denormalization ─────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS collection_method       text DEFAULT 'send_invoice',   -- 'send_invoice' | 'charge_automatically'
  -- none | succeeded | failed | action_required
  ADD COLUMN IF NOT EXISTS charge_status           text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS charge_attempted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS charge_attempt_count    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charge_failure_code     text,
  ADD COLUMN IF NOT EXISTS charge_failure_message  text,
  ADD COLUMN IF NOT EXISTS charge_retry_at         timestamptz,
  ADD COLUMN IF NOT EXISTS fallback_invoice_sent_at timestamptz,      -- set by the action_required auto-fallback
  ADD COLUMN IF NOT EXISTS receipt_sent_at         timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_communication_id uuid,
  ADD COLUMN IF NOT EXISTS refunded_cents          int DEFAULT 0,     -- denormalized for run UI; invoice_adjustments is source of truth
  ADD COLUMN IF NOT EXISTS credited_cents          int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voided_at               timestamptz;

CREATE INDEX IF NOT EXISTS invoices_charge_retry_idx
  ON invoices(charge_retry_at)
  WHERE charge_retry_at IS NOT NULL;

-- ── invoice_charge_attempts: the idempotency claim ──────────────────────────────
-- Insert a row BEFORE calling Stripe. The unique (invoice_id, attempt_number)
-- means a second concurrent request fails to claim and reads the first attempt's
-- state — mirrors the claim-before-send pattern in appointment_reminders.
CREATE TABLE IF NOT EXISTS invoice_charge_attempts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id               uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  attempt_number           int  NOT NULL,
  idempotency_key          text NOT NULL,
  status                   text NOT NULL DEFAULT 'claimed',   -- claimed | succeeded | failed
  stripe_payment_intent_id text,
  failure_code             text,
  failure_message          text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  resolved_at              timestamptz,
  UNIQUE (invoice_id, attempt_number),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS invoice_charge_attempts_invoice_idx
  ON invoice_charge_attempts(invoice_id);

-- ── invoice_adjustments: refund / credit / void (append-only) ───────────────────
-- Only status, failure_message, notified_at, communication_id, and the stripe id
-- fields are ever updated. Everything else is written once.
CREATE TABLE IF NOT EXISTS invoice_adjustments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  billing_account_id    uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  coach_id              uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  type                  text NOT NULL CHECK (type IN ('refund','credit_to_balance','void')),
  amount_cents          int  NOT NULL,
  reason                text NOT NULL,                 -- coach's plain-language reason, REQUIRED
  idempotency_key       text NOT NULL UNIQUE,
  stripe_credit_note_id text,
  stripe_refund_id      text,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  failure_message       text,
  created_by_email      text NOT NULL,
  notified_at           timestamptz,
  communication_id      uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_adjustments_invoice_idx ON invoice_adjustments(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_adjustments_coach_idx   ON invoice_adjustments(coach_id, created_at DESC);

-- ── billing_authorization_events: append-only audit trail ───────────────────────
CREATE TABLE IF NOT EXISTS billing_authorization_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  coach_id           uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  -- link_sent | page_viewed | authorized | payment_method_updated | marked_dormant
  -- | reconfirmed | removed | expired | auto_detached | charge_disputed
  event              text NOT NULL,
  ip                 text,
  detail             jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_authorization_events_account_idx
  ON billing_authorization_events(billing_account_id, created_at DESC);

-- ── RLS: enabled, no policies (service-role only) ───────────────────────────────
ALTER TABLE invoice_charge_attempts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_adjustments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_authorization_events  ENABLE ROW LEVEL SECURITY;

-- A charge-failure warning isn't tied to an engagement, so relax the NOT NULL
-- on billing_run_warnings.engagement_id (migration 032 required it). Safe/additive.
ALTER TABLE billing_run_warnings ALTER COLUMN engagement_id DROP NOT NULL;

-- communications.type gains 'receipt', 'billing_authorization', 'billing_adjustment'
-- at the application layer — the column is unconstrained text, so no DDL needed.
