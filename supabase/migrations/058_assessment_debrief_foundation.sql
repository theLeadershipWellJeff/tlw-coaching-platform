-- Migration 058 — Assessment debrief foundation  (UP)
--
-- Phase 1 of the document-grounded assessment debrief capability (first
-- instrument: the Zenger Folkman Extraordinary Leader 360). This is a FEATURE
-- FLAG on the existing Client Portal, not a second portal: same clients table,
-- same login, same chat. Nothing here changes behavior for any existing client —
-- every new column is nullable or defaulted, and the flag (portal_features)
-- defaults to {} so the 360 surfaces stay hidden until switched on per client.
--
-- Instrument-agnostic by design: no table, column, or value is named after ZF.
-- ZF-specific logic lives in ONE place — a versioned row in prompt_briefs.
--
-- What this adds:
--   1. companies            — client companies (vision/values feed chat context)
--   2. cohorts              — a contracted program at a company (seats, access window)
--   3. client_documents     — uploaded assessments/reviews + structured extraction
--   4. prompt_briefs        — versioned interpretation briefs, editable without a deploy
--   5. support_tickets (+ messages) — "Contact support" for clients with no coach
--   6. portal_events        — outcomes instrumentation (captured from day one)
--   7. clients: client_type gains 'portal'; cohort_id, company_id,
--      portal_features, portal_access_expires_at
--   8. portal_messages.metadata — stamps which brief version produced a reply
--
-- All new tables: org_id (042 pattern) + RLS enabled, no policies (service-role
-- only, consistent with the schema). Reversible via
-- 058_assessment_debrief_foundation_down.sql.

-- ---------------------------------------------------------------------------
-- 1. companies — a client company. vision/values are plain text the chat
--    includes ONLY for clients whose company_id points here (never a placeholder
--    when absent).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                REFERENCES organizations(id),
  name        text NOT NULL,
  vision      text,
  "values"    text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS companies_org_id_idx ON companies (org_id);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. cohorts — one contracted program (e.g. "Q4 2026 leadership cohort") at a
--    company. Billing is on seats_purchased; seats activated is COUNTED from
--    clients.cohort_id, never stored. debrief_coach_name is text on purpose:
--    the debrief coaches have no app access in v1 (no coaches row, no role).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cohorts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                        REFERENCES organizations(id),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                text NOT NULL,
  seats_purchased     integer NOT NULL DEFAULT 0 CHECK (seats_purchased >= 0),
  access_starts_at    timestamptz,
  access_expires_at   timestamptz,
  debrief_coach_name  text,
  -- 'active' | 'closed'
  status              text NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cohorts_company_idx ON cohorts (company_id);
CREATE INDEX IF NOT EXISTS cohorts_org_id_idx ON cohorts (org_id);
ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. client_documents — an uploaded document plus its extraction. The PDF itself
--    lives in the private Storage bucket `client-documents` at storage_path
--    (`${client_id}/${id}.pdf`); the bucket is created in code on first upload.
--
--    kind:              'assessment_360' | 'personnel_review' | 'company_doc'
--    uploader_role:     'coach' | 'client'
--    extraction_status: 'pending' | 'complete' | 'failed' | 'unsupported'
--    visible_to_coach:  enforced at the QUERY layer on every coach-side read —
--                       a personnel_review is always false and never surfaces
--                       to any coach.
--    assessment_date:   parsed from the report cover; the ORDERING key for
--                       longitudinal comparison (never created_at — an older
--                       report may be uploaded after a newer one).
--    supersedes_document_id: the prior assessment this one is compared against.
--    structured_data:   validated JSON, the sole source of truth for any number
--                       the AI states. Rater names are stripped before storage.
--    A document with extraction_status <> 'complete' is never client-visible and
--    never enters chat context; it IS still downloadable by its owner.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_documents (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                             REFERENCES organizations(id),
  client_id                uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind                     text NOT NULL,
  title                    text,
  storage_path             text NOT NULL,
  size_bytes               integer,
  extracted_text           text,
  structured_data          jsonb,
  extraction_status        text NOT NULL DEFAULT 'pending',
  extraction_error         text,
  -- Who uploaded it: a coaches row when uploader_role='coach', else NULL.
  uploaded_by              uuid REFERENCES coaches(id) ON DELETE SET NULL,
  uploader_role            text NOT NULL,
  visible_to_coach         boolean NOT NULL DEFAULT false,
  assessment_date          date,
  instrument               text,
  format_version           text,
  supersedes_document_id   uuid REFERENCES client_documents(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_documents_client_kind_date_idx
  ON client_documents (client_id, kind, assessment_date DESC);
CREATE INDEX IF NOT EXISTS client_documents_status_idx
  ON client_documents (extraction_status) WHERE extraction_status <> 'complete';
CREATE INDEX IF NOT EXISTS client_documents_org_id_idx ON client_documents (org_id);
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. prompt_briefs — versioned interpretation briefs, one slug per document
--    kind/instrument. Exactly one row per slug is_active at a time; the chat
--    loads the active row and stamps its version into portal_messages.metadata.
--    Editable from the command center — a brief change never needs a deploy.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prompt_briefs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                REFERENCES organizations(id),
  slug        text NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  title       text NOT NULL,
  body        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS prompt_briefs_one_active_per_slug
  ON prompt_briefs (org_id, slug) WHERE is_active;
ALTER TABLE prompt_briefs ENABLE ROW LEVEL SECURITY;

-- Placeholder brief so the pipeline is testable end to end. Jeff replaces the
-- body from the command center (a new version row) — the guardrails below are
-- the non-negotiable floor that every version must keep.
INSERT INTO prompt_briefs (slug, version, title, body, is_active)
SELECT 'assessment_360', 1, 'Assessment 360 interpretation brief (placeholder v1)',
$brief$You are helping a leader make sense of their 360 feedback report. They have already had a group debrief with a human coach; you are a thinking partner for what comes next, not a first-contact interpreter.

Non-negotiables:
- A 360 measures PERCEPTION, not ability. Say what raters saw ("your peers saw this as a standout"), never what the person is ("you are strong at this").
- Lead from strengths. Low scores are context, never the agenda.
- Never rank competencies by score. Rank by band, then by score within band.
- Never invent a score, percentile, or comment. If it is not in the structured data, it does not exist.
- Never speculate about which individual said or scored what, in any framing.
- Never tell the participant what their goals should be. Surface where the data points, then ask what they make of it.
- Treat absent or collapsed sections (e.g. Engagement 0.00 from too few direct reports) as absent, not as scores.
- Raise context (new role, new manager, reorganisation, a hard year) as a live explanation before personal attribution.
- When discussing change between two reports, offer it gently for reflection; never assert improvement or decline as fact, and never attribute it to coaching.$brief$,
  true
WHERE NOT EXISTS (SELECT 1 FROM prompt_briefs WHERE slug = 'assessment_360');

-- ---------------------------------------------------------------------------
-- 5. support_tickets — "Contact support" for portal clients who have no coach
--    to email. A coaching client keeps the existing Contact-your-coach card.
--    status: 'open' | 'closed'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                 REFERENCES organizations(id),
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subject      text NOT NULL,
  body         text NOT NULL,
  status       text NOT NULL DEFAULT 'open',
  assigned_to  uuid REFERENCES coaches(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON support_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_client_idx ON support_tickets (client_id);
CREATE INDEX IF NOT EXISTS support_tickets_org_id_idx ON support_tickets (org_id);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                 REFERENCES organizations(id),
  ticket_id    uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  -- 'client' | 'staff'
  author_role  text NOT NULL,
  author_id    uuid,
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx
  ON support_ticket_messages (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS support_ticket_messages_org_id_idx
  ON support_ticket_messages (org_id);
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. portal_events — outcomes instrumentation. Separate from portal_access_log
--    on purpose: the access log is an audit/rate-limit counter that may be
--    pruned; this is the durable outcomes record (first login, report viewed,
--    chat started, goal created, metric defined, comparison viewed, talk-to-a-
--    coach clicked, self-rated progress at 30/90/180/365 days). Append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
                REFERENCES organizations(id),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_events_client_idx
  ON portal_events (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_events_type_idx
  ON portal_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_events_org_id_idx ON portal_events (org_id);
ALTER TABLE portal_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 7. clients — the flag and the links.
--    client_type already exists (031: 'client' | 'coach'). It gains 'portal' =
--    a standalone assessment participant with no coaching relationship. The
--    existing 'client' value IS the coaching client; nothing is renamed.
--    portal_features is INDEPENDENT of client_type: a 'client' can have
--    {"assessments": true}; a 'portal' client can have it false until their
--    report lands. Default {} = today's portal, byte-identical.
-- ---------------------------------------------------------------------------
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_client_type_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_client_type_check
  CHECK (client_type IN ('client', 'coach', 'portal'));

ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_id uuid
  REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cohort_id uuid
  REFERENCES cohorts(id) ON DELETE SET NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_features jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Denormalised from the cohort at activation so a per-client extension is possible.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_access_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS clients_cohort_idx ON clients (cohort_id) WHERE cohort_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS clients_company_idx ON clients (company_id) WHERE company_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8. portal_messages.metadata — e.g. {"brief_slug":"assessment_360","brief_version":1}
--    so engagement can later be compared across brief revisions.
-- ---------------------------------------------------------------------------
ALTER TABLE portal_messages ADD COLUMN IF NOT EXISTS metadata jsonb;
