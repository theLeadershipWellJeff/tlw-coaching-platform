-- Migration 062 — reconcile the debrief tables with migration 059 as committed
--
-- Production hit "Could not find the 'updated_at' column of 'client_documents'
-- in the schema cache" on the first portal upload: the client_documents table
-- Jeff created by hand (under the working name 058, before 059 landed on main)
-- predates the final column list. This script is idempotent — it adds every
-- 059/060 column that might be missing and changes nothing that exists — and
-- then asks PostgREST to reload its schema cache, which is the other way that
-- error appears (a column added after the cache was built).
--
-- Safe to run more than once. Reversible: 062_client_documents_reconcile_down.sql
-- is a no-op by design (removing columns 059 defines would break the app).

-- client_documents — the table that failed
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS title                  text;
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS size_bytes             integer;
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS extracted_text         text;
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS structured_data        jsonb;
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS extraction_status      text NOT NULL DEFAULT 'pending';
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS extraction_error       text;
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS uploaded_by            uuid REFERENCES coaches(id) ON DELETE SET NULL;
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS uploader_role          text NOT NULL DEFAULT 'coach';
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS visible_to_coach       boolean NOT NULL DEFAULT false;
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS assessment_date        date;
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS instrument             text;
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS format_version         text;
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS supersedes_document_id uuid REFERENCES client_documents(id) ON DELETE SET NULL;
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS created_at             timestamptz NOT NULL DEFAULT now();
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS updated_at             timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS client_documents_client_kind_date_idx
  ON client_documents (client_id, kind, assessment_date DESC);
CREATE INDEX IF NOT EXISTS client_documents_status_idx
  ON client_documents (extraction_status) WHERE extraction_status <> 'complete';

-- The other 059/060 tables the app stamps updated_at on
ALTER TABLE companies         ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE cohorts           ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE support_tickets   ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE company_documents ADD COLUMN IF NOT EXISTS include_in_chat boolean NOT NULL DEFAULT true;

-- Ask PostgREST (the Supabase API layer) to rebuild its schema cache now
-- rather than on its own schedule.
NOTIFY pgrst, 'reload schema';
