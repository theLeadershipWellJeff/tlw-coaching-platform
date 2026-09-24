-- Migration 073 — company logo (enterprise co-branding on the Client Portal)
-- Up-script. Paired down: 073_company_logo_down.sql
--
-- A sponsor company (e.g. an enterprise that bought portal seats) can carry a
-- logo. Its participants see it at the top of the portal home and the chat,
-- side by side with "Powered by theLeadershipWell" at equal size. The file
-- lives in the private `client-documents` bucket at
-- `companies/<company_id>/logo.<ext>` and is streamed only to a portal client
-- whose own clients.company_id matches. Additive + nullable: NULL = no logo,
-- the portal renders exactly as before.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_path text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_content_type text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_updated_at timestamptz;

NOTIFY pgrst, 'reload schema';
