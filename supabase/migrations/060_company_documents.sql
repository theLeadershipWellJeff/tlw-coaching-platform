-- Migration 060 — Company documents  (UP)
--
-- Enterprise sponsors give theLeadershipWell material (vision, values, a
-- leadership framework, a strategy deck) that should shape the chat experience
-- of THEIR participants. Until now the only company context was the two text
-- fields on `companies`. This table holds uploaded documents per company: the
-- file lives in the private `client-documents` bucket under
-- companies/<company_id>/<id>.<ext>; the extracted text is what the chat reads,
-- budgeted, for every client whose `clients.company_id` points at the company
-- and never for anyone else (the same strict lookup as vision/values).
--
-- Additive. RLS enabled, no policies (service-role only). Reversible via
-- 060_company_documents_down.sql.

CREATE TABLE IF NOT EXISTS company_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                       REFERENCES organizations(id),
  company_id         uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title              text NOT NULL,
  storage_path       text NOT NULL,
  size_bytes         integer,
  extracted_text     text,
  -- 'complete' | 'failed'
  extraction_status  text NOT NULL DEFAULT 'pending',
  extraction_error   text,
  -- Whether the text is fed to participants' chat (a sponsor may hand over a
  -- document for reference only).
  include_in_chat    boolean NOT NULL DEFAULT true,
  uploaded_by        uuid REFERENCES coaches(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_documents_company_idx ON company_documents (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS company_documents_org_id_idx ON company_documents (org_id);
ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;
