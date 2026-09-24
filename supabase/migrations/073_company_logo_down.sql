-- Migration 073 — down. Drops the logo columns (the stored files in the
-- client-documents bucket under companies/<id>/logo.* are left in place;
-- remove them from Storage by hand if wanted).

ALTER TABLE companies DROP COLUMN IF EXISTS logo_updated_at;
ALTER TABLE companies DROP COLUMN IF EXISTS logo_content_type;
ALTER TABLE companies DROP COLUMN IF EXISTS logo_path;

NOTIFY pgrst, 'reload schema';
