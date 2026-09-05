-- Migration 059 — Assessment debrief foundation  (DOWN)
-- Reverses 059_assessment_debrief_foundation.sql. Drops the seven new tables and
-- the new columns, and restores the two-value client_type check. Any client
-- already set to client_type='portal' is reset to 'client' first so the
-- narrower check can be re-added.

-- 1. Reset portal clients so the original check can be restored.
UPDATE clients SET client_type = 'client' WHERE client_type = 'portal';
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_client_type_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_client_type_check CHECK (client_type IN ('client', 'coach'));

-- 2. Column removals on existing tables.
ALTER TABLE clients DROP COLUMN IF EXISTS portal_access_expires_at;
ALTER TABLE clients DROP COLUMN IF EXISTS portal_features;
ALTER TABLE clients DROP COLUMN IF EXISTS cohort_id;
ALTER TABLE clients DROP COLUMN IF EXISTS company_id;
ALTER TABLE portal_messages DROP COLUMN IF EXISTS metadata;

-- 3. New tables, dependents first.
DROP TABLE IF EXISTS portal_events;
DROP TABLE IF EXISTS support_ticket_messages;
DROP TABLE IF EXISTS support_tickets;
DROP TABLE IF EXISTS prompt_briefs;
DROP TABLE IF EXISTS client_documents;
DROP TABLE IF EXISTS cohorts;
DROP TABLE IF EXISTS companies;
