-- Track session allotment on engagements
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS session_count integer;

-- Allow billing accounts to be closed (vs deleted)
ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;
