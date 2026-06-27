-- Distinguish coaching clients from team coaches who appear in the client
-- roster (e.g. imported from CA for note-keeping purposes).
-- Default 'client' so all existing rows are unchanged.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'client'
    CHECK (client_type IN ('client', 'coach'));
