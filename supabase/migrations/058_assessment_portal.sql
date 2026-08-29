-- Migration 058 — assessment debrief portal data model  (UP)
--
-- The document-grounded assessment debrief capability (ZF 360 first, built
-- instrument-agnostic — see the build brief). One portal, one login: this is a
-- per-client feature flag on the EXISTING client portal, not a second surface.
--
-- What it adds:
--
-- 1. `companies` — client companies (a cohort's sponsor). Vision/values feed
--    the portal chat context for enterprise cohort participants — additive
--    when present, absent without a trace when null.
-- 2. `cohorts` — a contracted program at a company: seats purchased (billing
--    is on purchased, not activated), the access window, and the debrief
--    coach's NAME (deliberately text, not a coaches FK — the five debrief
--    coaches get no app access in v1).
-- 3. `client_documents` — kind-discriminated uploaded documents
--    (assessment_360 | personnel_review | company_doc). Numeric grounding
--    lives in `structured_data` (validated JSON from the deterministic
--    extraction pass), never in raw text. `extraction_status != 'complete'`
--    documents are never client-visible and never enter chat context.
--    Visibility to the coach is a property of kind + client choice
--    (`visible_to_coach`), enforced at the query layer.
-- 4. `prompt_briefs` — versioned interpretation briefs per document kind,
--    editable in the command center without a deploy. ZF-specific knowledge
--    lives HERE and only here.
-- 5. `support_tickets` (+ messages) — "Contact support" for coach-less portal
--    participants; the coach card keeps serving clients who have a coach.
-- 6. `portal_events` — outcomes instrumentation, captured from day one.
--
-- Client columns: `cohort_id`/`company_id` (nullable and independently
-- nullable), `portal_features` jsonb (the feature flag — ORTHOGONAL to
-- client_type; default '{}' so nothing changes for anyone today), and
-- `portal_access_expires_at` (denormalised from the cohort at activation so
-- per-client extensions are possible).
--
-- `clients.client_type` (migration 031: 'client' | 'coach') gains a third
-- value 'portal' — a standalone portal participant with no coaching
-- relationship. The build brief calls these two "coaching | portal"; the
-- existing 'client' value IS the brief's "coaching", and renaming the
-- installed base is not worth the churn.
--
-- All additive. Reversible via 058_assessment_portal_down.sql.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. companies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                REFERENCES organizations(id),
  name        text NOT NULL,
  -- Company vision / values, fed verbatim into cohort participants' chat
  -- context. Plain text authored in the command center.
  vision      text,
  values      text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companies_org_id_idx ON companies (org_id);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER companies_set_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. cohorts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cohorts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                       REFERENCES organizations(id),
  company_id         uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name               text NOT NULL,
  -- Billing is on seats PURCHASED. Activated seats are counted live from
  -- clients.cohort_id — both are shown in the command center.
  seats_purchased    integer NOT NULL DEFAULT 0,
  access_starts_at   timestamptz,
  access_expires_at  timestamptz,
  -- TEXT on purpose, not a coaches FK: debrief coaches run group sessions
  -- off-platform and have no application access in v1.
  debrief_coach_name text,
  -- 'active' | 'closed'
  status             text NOT NULL DEFAULT 'active',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cohorts_company_idx ON cohorts (company_id);
CREATE INDEX IF NOT EXISTS cohorts_org_id_idx ON cohorts (org_id);
ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. client_documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_documents (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                           REFERENCES organizations(id),
  client_id              uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- 'assessment_360' | 'personnel_review' | 'company_doc'
  kind                   text NOT NULL,
  title                  text,
  -- Path in the private `client-documents` Storage bucket
  -- (convention: ${clientId}/${documentId}.pdf).
  storage_path           text NOT NULL,
  size_bytes             integer,
  -- Raw text extraction, rater-names section ALREADY STRIPPED — this is the
  -- verbatims/labels source for chat context. Never the source for a number.
  extracted_text         text,
  -- Validated JSON from the deterministic extraction pass (§5 of the brief).
  -- The SOLE source of truth for any score, band, norm, or comparison.
  structured_data        jsonb,
  -- 'pending' | 'complete' | 'failed' | 'unsupported'
  -- Anything other than 'complete' is never client-visible and never enters
  -- chat context. The FILE itself stays downloadable by its owner regardless —
  -- extraction gates the AI grounding, not the participant's own document.
  extraction_status      text NOT NULL DEFAULT 'pending',
  extraction_error       text,
  -- Who put it here. No FK — the principal is a coach OR the client
  -- themselves; uploader_role disambiguates ('coach' | 'client').
  uploaded_by            uuid,
  uploader_role          text NOT NULL DEFAULT 'coach',
  -- Visibility is kind + CLIENT CHOICE, not uploader (see the brief §4 table).
  -- personnel_review is always false and the client cannot change it; a
  -- client-uploaded assessment_360 is the client's call, changeable any time.
  -- Enforced at the query layer, never as a UI-only hide.
  visible_to_coach       boolean NOT NULL DEFAULT true,
  -- Parsed from the report cover. THE ordering key for longitudinal
  -- comparison — never order assessments by created_at (a client may upload
  -- an older report after a newer one).
  assessment_date        date,
  -- e.g. 'Zenger Folkman Extraordinary Leader'. Comparison is only ever
  -- within the same instrument.
  instrument             text,
  -- Detected report layout version; unknown layouts fail as 'unsupported'
  -- rather than being parsed wrong.
  format_version         text,
  -- A re-test links to its predecessor (same client + instrument); the §5d
  -- comparison block is computed at upload and stored in structured_data.
  supersedes_document_id uuid REFERENCES client_documents(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- The portal card: this client's completed assessments, newest first.
CREATE INDEX IF NOT EXISTS client_documents_client_idx
  ON client_documents (client_id, kind, assessment_date DESC);
CREATE INDEX IF NOT EXISTS client_documents_org_id_idx
  ON client_documents (org_id);
-- The command center review queue (failed / unsupported extractions).
CREATE INDEX IF NOT EXISTS client_documents_status_idx
  ON client_documents (extraction_status)
  WHERE extraction_status <> 'complete';
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. prompt_briefs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prompt_briefs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                REFERENCES organizations(id),
  -- The document kind / instrument this brief interprets,
  -- e.g. 'assessment_360_zf'. Chat context loads the active brief by slug.
  slug        text NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  title       text NOT NULL,
  body        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Every (slug, version) once; at most ONE active version per slug per org.
CREATE UNIQUE INDEX IF NOT EXISTS prompt_briefs_slug_version_idx
  ON prompt_briefs (org_id, slug, version);
CREATE UNIQUE INDEX IF NOT EXISTS prompt_briefs_one_active_idx
  ON prompt_briefs (org_id, slug) WHERE is_active;
ALTER TABLE prompt_briefs ENABLE ROW LEVEL SECURITY;

-- Placeholder ZF brief so the pipeline is testable end to end before Jeff's
-- authored brief lands (brief §13). Replace via the command center editor.
INSERT INTO prompt_briefs (slug, version, title, body, is_active)
SELECT 'assessment_360_zf', 1, 'ZF Extraordinary Leader — interpretation brief (placeholder)',
       'PLACEHOLDER — replace with the authored interpretation brief before go-live. '
       || 'Until then: ground every number in the structured data provided; a 360 measures '
       || 'perception, not ability; lead from strengths; never rank competencies by raw score '
       || '(rank by band, then score within band); never speculate about which rater said what; '
       || 'never prescribe goals — surface patterns and ask what the participant makes of them.',
       true
WHERE NOT EXISTS (SELECT 1 FROM prompt_briefs WHERE slug = 'assessment_360_zf');

-- ---------------------------------------------------------------------------
-- 5. support_tickets (+ messages)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                REFERENCES organizations(id),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subject     text NOT NULL,
  body        text NOT NULL,
  -- 'open' | 'closed'
  status      text NOT NULL DEFAULT 'open',
  -- Free-text assignee (support is run from the command center; no FK).
  assigned_to text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  closed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON support_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_client_idx
  ON support_tickets (client_id);
CREATE INDEX IF NOT EXISTS support_tickets_org_id_idx
  ON support_tickets (org_id);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                REFERENCES organizations(id),
  ticket_id   uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  -- 'client' | 'admin'
  author_role text NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx
  ON support_ticket_messages (ticket_id, created_at);
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. portal_events — outcomes instrumentation. Append-only; capture from day
--    one (it cannot be retrofitted). Event types include: first_login,
--    report_viewed, document_downloaded, comparison_viewed, chat_started,
--    chat_message, goal_created, metric_defined, action_created,
--    action_completed, talk_to_coach_clicked, progress_prompt_response.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                REFERENCES organizations(id),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  -- Small structured context (a document id, a message count). Never content.
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_events_client_idx
  ON portal_events (client_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_events_org_id_idx
  ON portal_events (org_id);
ALTER TABLE portal_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 7. Client columns. cohort_id and company_id are nullable and INDEPENDENTLY
--    nullable: a standalone participant has neither; a coaching client with a
--    360 usually has neither; an enterprise cohort participant has both.
-- ---------------------------------------------------------------------------
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS cohort_id uuid REFERENCES cohorts(id) ON DELETE SET NULL;
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
-- The feature flag, e.g. {"assessments": true}. Orthogonal to client_type: a
-- coaching client can have assessments on; a portal participant can have it
-- off until their report lands. '{}' = today's portal, unchanged, for everyone.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS portal_features jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Denormalised from the cohort at activation (per-client extensions possible).
-- NULL = no expiry (coaching clients).
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS portal_access_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS clients_cohort_idx
  ON clients (cohort_id) WHERE cohort_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8. client_type gains 'portal' (standalone portal participant, no coaching
--    relationship). 031's inline CHECK auto-named clients_client_type_check.
-- ---------------------------------------------------------------------------
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_client_type_check;
ALTER TABLE clients ADD CONSTRAINT clients_client_type_check
  CHECK (client_type IN ('client', 'coach', 'portal'));

COMMIT;
