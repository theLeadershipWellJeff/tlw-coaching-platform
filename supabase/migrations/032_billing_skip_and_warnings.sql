-- 032_billing_skip_and_warnings.sql
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS skip_billing boolean NOT NULL DEFAULT false;

ALTER TABLE billable_sessions ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS billing_run_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  kind text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_run_warnings_coach_idx ON billing_run_warnings (coach_id, created_at DESC);

ALTER TABLE billing_run_warnings ENABLE ROW LEVEL SECURITY;
