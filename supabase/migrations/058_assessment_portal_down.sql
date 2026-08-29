-- Migration 058 — assessment debrief portal data model  (DOWN)
--
-- Reverses 058_assessment_portal.sql. Destructive: drops every uploaded
-- document row (the Storage objects in the `client-documents` bucket are NOT
-- removed — delete those by hand if truly abandoning the feature), all
-- companies/cohorts, prompt briefs, support tickets, and portal events.
--
-- The client_type CHECK is restored to its 031 form ('client','coach'), so any
-- portal participant row is first folded back to 'client' — their client row
-- survives, only the discriminator is lost.

BEGIN;

-- 1. Client columns added by 058.
ALTER TABLE clients DROP COLUMN IF EXISTS cohort_id;
ALTER TABLE clients DROP COLUMN IF EXISTS company_id;
ALTER TABLE clients DROP COLUMN IF EXISTS portal_features;
ALTER TABLE clients DROP COLUMN IF EXISTS portal_access_expires_at;

-- 2. client_type back to the 031 two-value CHECK.
UPDATE clients SET client_type = 'client' WHERE client_type = 'portal';
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_client_type_check;
ALTER TABLE clients ADD CONSTRAINT clients_client_type_check
  CHECK (client_type IN ('client', 'coach'));

-- 3. New tables, children first.
DROP TABLE IF EXISTS support_ticket_messages;
DROP TABLE IF EXISTS support_tickets;
DROP TABLE IF EXISTS portal_events;
DROP TABLE IF EXISTS client_documents;
DROP TABLE IF EXISTS prompt_briefs;
DROP TABLE IF EXISTS cohorts;
DROP TABLE IF EXISTS companies;

COMMIT;
