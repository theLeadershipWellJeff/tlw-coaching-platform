-- 027_billing.sql
-- Business Center billing tables: billing_accounts, coachees, engagements,
-- billable_sessions, invoices, invoice_lines, invoice_reminders.
-- RLS enabled; no public policies — all access via getSupabaseAdmin().

-- Billing Account (the payer)
CREATE TABLE billing_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  name          text NOT NULL,
  type          text NOT NULL CHECK (type IN ('solo','enterprise')),
  billing_email text NOT NULL,
  stripe_customer_id text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Coachee (thin link to existing client record; no roster duplication)
CREATE TABLE coachees (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id           uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  client_id          uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, client_id)
);

-- Engagement (the coaching arrangement for one coachee)
CREATE TABLE engagements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id              uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  billing_account_id    uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
  coachee_id            uuid NOT NULL REFERENCES coachees(id) ON DELETE RESTRICT,
  billing_mode          text NOT NULL CHECK (billing_mode IN ('arrears','subscription','per_engagement')),
  billing_owner         text NOT NULL CHECK (billing_owner IN ('CA','TLW')) DEFAULT 'TLW',
  status                text NOT NULL CHECK (status IN ('active','paused','ended')) DEFAULT 'active',
  -- arrears fields
  rate_hourly           numeric(10,2),
  -- subscription fields
  monthly_amount        numeric(10,2),
  billing_day           int CHECK (billing_day BETWEEN 1 AND 28),
  -- per_engagement fields
  engagement_total      numeric(10,2),
  installment_count     int CHECK (installment_count IN (1,2)),
  installment_schedule  jsonb,
  -- shared
  description_template  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Billable Session (derived from existing notes records)
CREATE TABLE billable_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id         uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  engagement_id    uuid NOT NULL REFERENCES engagements(id) ON DELETE RESTRICT,
  coachee_id       uuid NOT NULL REFERENCES coachees(id) ON DELETE RESTRICT,
  note_id          uuid REFERENCES notes(id) ON DELETE SET NULL,
  occurred_on      date NOT NULL,
  duration_hours   numeric(4,2) NOT NULL,
  amount           numeric(10,2) NOT NULL,
  billed_invoice_id uuid,  -- FK added below after invoice table
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, note_id)
);

-- Invoice (account-level; rolls up lines across engagements for a period)
CREATE TABLE invoices (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id                  uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  billing_account_id        uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
  period_start              date,
  period_end                date,
  status                    text NOT NULL CHECK (status IN
    ('draft','approved','sent','paid','overdue','failed','void')) DEFAULT 'draft',
  subtotal                  numeric(10,2) NOT NULL DEFAULT 0,
  total                     numeric(10,2) NOT NULL DEFAULT 0,
  currency                  text NOT NULL DEFAULT 'usd',
  stripe_invoice_id         text,
  stripe_payment_intent_id  text,
  stripe_error              text,
  approved_by               text,
  approved_at               timestamptz,
  sent_at                   timestamptz,
  paid_at                   timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Back-fill the FK now that invoice table exists
ALTER TABLE billable_sessions
  ADD CONSTRAINT billable_sessions_billed_invoice_id_fkey
  FOREIGN KEY (billed_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

-- Invoice Line
CREATE TABLE invoice_lines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  coachee_id   uuid REFERENCES coachees(id) ON DELETE SET NULL,
  description  text NOT NULL,
  quantity     numeric(6,2) NOT NULL DEFAULT 1,
  unit_amount  numeric(10,2) NOT NULL,
  amount       numeric(10,2) NOT NULL,
  source       text NOT NULL CHECK (source IN ('session','subscription','engagement_installment')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Invoice Reminder
CREATE TABLE invoice_reminders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  send_at    timestamptz NOT NULL,
  status     text NOT NULL CHECK (status IN ('scheduled','sent','cancelled')) DEFAULT 'scheduled',
  channel    text NOT NULL CHECK (channel IN ('email')) DEFAULT 'email',
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX billing_accounts_coach_id_idx    ON billing_accounts(coach_id);
CREATE INDEX coachees_coach_id_idx            ON coachees(coach_id);
CREATE INDEX coachees_client_id_idx           ON coachees(client_id);
CREATE INDEX engagements_coach_id_idx         ON engagements(coach_id);
CREATE INDEX engagements_billing_account_idx  ON engagements(billing_account_id);
CREATE INDEX engagements_status_owner_idx     ON engagements(coach_id, status, billing_owner);
CREATE INDEX billable_sessions_engagement_idx ON billable_sessions(engagement_id);
CREATE INDEX billable_sessions_unbilled_idx   ON billable_sessions(coach_id, billed_invoice_id)
  WHERE billed_invoice_id IS NULL;
CREATE INDEX invoices_coach_status_idx        ON invoices(coach_id, status);
CREATE INDEX invoice_lines_invoice_id_idx     ON invoice_lines(invoice_id);
CREATE INDEX invoice_reminders_due_idx        ON invoice_reminders(invoice_id, status, send_at)
  WHERE status = 'scheduled';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- No public policies. All access via getSupabaseAdmin() (service-role key).

ALTER TABLE billing_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coachees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE billable_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_reminders  ENABLE ROW LEVEL SECURITY;
