-- ============================================================================
-- theLeadershipWell — SYNTHETIC STAGING SEED (test bots, 2026-10-09)
-- ============================================================================
-- Run AFTER 000_full_baseline.sql and 003_test_email_sink.sql, in the STAGING
-- project ONLY (the staging-db workflow refuses any database without the
-- tlw_environment 'staging' marker).
--
-- ⚠️  NEVER run against production. NEVER copy production data into staging.
--     Every person here is fictional. Every email ends @bots.theleadershipwell.test
--     — the .test TLD is reserved and can never deliver.
--
-- Canaries: every client's key_info carries PRIVATE-CANARY-KEYINFO-<client id>
-- and every client has an UNSENT coach note carrying PRIVATE-CANARY-NOTE-<id>.
-- Neither may ever appear in a portal page or /api/portal/** response (bot B4).
--
-- Dates are fixed (no now()) so screenshots don't drift. "Upcoming" sessions sit
-- in 2030 so they stay upcoming. Fixed ids live in bots/fixtures/seed-ids.ts
-- (Phase 2) — change one, change both.
--
-- Shape
--   Org A "Northwind Coaching" (org #1, renamed on staging only)
--     Olivia Owner (coach)        → Indy, Ellis, Zoe (house link), Archie, Pia
--     Arlo Associate (coach)      → Ada only
--     Sam Supervisor (supervisor) → no clients; sees the Command Center
--     Company "Fabrikam" + cohort "Fabrikam 2026": Ellis (enterprise coachee,
--     single payer) and Zoe (ZF 360 participant) are co-workers
--   Org B "Contoso Leadership"
--     Bea Contoso (coach)         → Bruno
--
-- Idempotent: re-running is safe (ON CONFLICT on every key).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
update organizations set name = 'Northwind Coaching', legal_entity_name = 'Northwind Coaching (staging)'
 where id = '00000000-0000-4000-8000-000000000001';
insert into organizations (id, name, legal_entity_name) values
  ('00000000-0000-4000-8000-0000000000b0', 'Contoso Leadership', 'Contoso Leadership (staging)')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Coaches (plan beta = open; a lapsed plan would wall them)
-- ---------------------------------------------------------------------------
insert into coaches (id, org_id, email, name, role, plan, timezone, booking_url) values
  ('a1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'owner.coach@bots.theleadershipwell.test',     'Olivia Owner',     'coach',      'beta', 'America/Denver', 'https://staging.theleadershipwell.online/book-olivia'),
  ('a1000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'associate.coach@bots.theleadershipwell.test', 'Arlo Associate',   'coach',      'beta', 'America/Denver', null),
  ('a1000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'supervisor@bots.theleadershipwell.test',      'Sam Supervisor',   'supervisor', 'beta', 'America/Denver', null),
  ('b1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b0', 'contoso.coach@bots.theleadershipwell.test',   'Bea Contoso',      'coach',      'beta', 'Europe/London',  null)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Company + cohort (Org A's enterprise customer)
-- ---------------------------------------------------------------------------
insert into companies (id, org_id, name, vision, values) values
  ('f1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Fabrikam (synthetic)',
   'Leaders who make work better for everyone.', 'Candor · Care · Craft')
on conflict (id) do nothing;
insert into cohorts (id, org_id, company_id, name, seats_purchased, access_starts_at, access_expires_at, status) values
  ('f2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
   'Fabrikam 2026', 10, '2026-01-01T00:00:00Z', '2030-12-31T00:00:00Z', 'active')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
insert into clients (id, org_id, name, email, title, company, status, timezone, client_type,
                     company_id, cohort_id, portal_features, portal_access_expires_at,
                     agreement_on_file, recording_authorized, coaching_goals, key_info, created_at) values
  -- F4 individual client
  ('c1000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'Indy Individual',
   'indy@bots.theleadershipwell.test', 'VP Operations', 'Synthetic Widgets', 'active', 'America/Denver', 'client',
   null, null, '{}'::jsonb, null, true, true,
   '[{"title":"You want to delegate the weekly ops review","description":"Hand it to your two leads by March.","metrics":["Leads run 3 reviews alone"]}]'::jsonb,
   'PRIVATE-CANARY-KEYINFO-c1000000-0000-4000-8000-0000000000a1', '2026-01-05T15:00:00Z'),
  -- F5 enterprise coachee (single payer = Fabrikam)
  ('c1000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', 'Ellis Enterprise',
   'ellis@bots.theleadershipwell.test', 'Director, Platform', 'Fabrikam (synthetic)', 'active', 'America/Chicago', 'client',
   'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', '{}'::jsonb, null, true, true,
   '[{"title":"You want your team to bring you solutions, not problems","description":"Coach first, answer second.","metrics":["Two decisions a week made without you"]}]'::jsonb,
   'PRIVATE-CANARY-KEYINFO-c1000000-0000-4000-8000-0000000000a2', '2026-01-06T15:00:00Z'),
  -- F6 ZF 360 participant (portal-only, house-coach link to Olivia)
  ('c1000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000001', 'Zoe Participant',
   'zoe@bots.theleadershipwell.test', 'Senior Manager', 'Fabrikam (synthetic)', 'active', 'America/Chicago', 'portal',
   'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', '{"assessments":true}'::jsonb, '2030-12-31T00:00:00Z', false, null,
   '[]'::jsonb,
   'PRIVATE-CANARY-KEYINFO-c1000000-0000-4000-8000-0000000000a3', '2026-01-07T15:00:00Z'),
  -- F7a archived portal access
  ('c1000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-000000000001', 'Archie Archived',
   'archie@bots.theleadershipwell.test', 'COO', 'Synthetic Widgets', 'inactive', 'America/Denver', 'client',
   null, null, '{"archived":true}'::jsonb, null, true, true, '[]'::jsonb,
   'PRIVATE-CANARY-KEYINFO-c1000000-0000-4000-8000-0000000000a4', '2025-06-01T15:00:00Z'),
  -- F7b access window expired
  ('c1000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-000000000001', 'Pia Past-Window',
   'pia@bots.theleadershipwell.test', 'Manager', 'Fabrikam (synthetic)', 'inactive', 'America/Chicago', 'portal',
   'f1000000-0000-4000-8000-000000000001', null, '{"assessments":true}'::jsonb, '2026-01-01T00:00:00Z', false, null, '[]'::jsonb,
   'PRIVATE-CANARY-KEYINFO-c1000000-0000-4000-8000-0000000000a6', '2025-06-02T15:00:00Z'),
  -- F2 the associate's only client
  ('c1000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-000000000001', 'Ada Assigned',
   'ada@bots.theleadershipwell.test', 'Head of Sales', 'Synthetic Widgets', 'active', 'America/New_York', 'client',
   null, null, '{}'::jsonb, null, true, true,
   '[{"title":"You want a forecast your CEO trusts","description":"","metrics":["Within 10% two quarters running"]}]'::jsonb,
   'PRIVATE-CANARY-KEYINFO-c1000000-0000-4000-8000-0000000000a5', '2026-01-08T15:00:00Z'),
  -- Org B — the client the breakers try to reach
  ('c2000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b0', 'Bruno Contoso',
   'bruno@bots.theleadershipwell.test', 'CEO', 'Contoso Bank (synthetic)', 'active', 'Europe/London', 'client',
   null, null, '{}'::jsonb, null, true, true,
   '[{"title":"ORG-B-SECRET-GOAL — you want a calmer board meeting","description":"","metrics":[]}]'::jsonb,
   'PRIVATE-CANARY-KEYINFO-c2000000-0000-4000-8000-0000000000b1', '2026-01-09T15:00:00Z')
on conflict (id) do nothing;

insert into coach_clients (coach_id, client_id, role, org_id) values
  ('a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000a1', 'primary', '00000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000a2', 'primary', '00000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000a3', 'primary', '00000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000a4', 'primary', '00000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000a6', 'primary', '00000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-0000000000a5', 'primary', '00000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-0000000000b1', 'primary', '00000000-0000-4000-8000-0000000000b0')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Billing: Fabrikam pays for Ellis (enterprise, single payer); Indy pays solo
-- ---------------------------------------------------------------------------
insert into billing_accounts (id, org_id, coach_id, name, type, billing_email, status) values
  ('e1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Fabrikam (synthetic)', 'enterprise', 'ap@bots.theleadershipwell.test', 'active'),
  ('e1000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Indy Individual', 'solo', 'indy@bots.theleadershipwell.test', 'active'),
  ('e2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b0', 'b1000000-0000-4000-8000-000000000001',
   'Bruno Contoso', 'solo', 'bruno@bots.theleadershipwell.test', 'active')
on conflict (id) do nothing;
insert into coachees (id, org_id, coach_id, client_id, billing_account_id) values
  ('e3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000a2', 'e1000000-0000-4000-8000-000000000001'),
  ('e3000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000a1', 'e1000000-0000-4000-8000-000000000002'),
  ('e4000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b0', 'b1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-0000000000b1', 'e2000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Coach notes: one UNSENT per client (carries the note canary — the portal must
-- never show it) + one SENT note for Indy (the portal shows that one)
-- ---------------------------------------------------------------------------
insert into notes (id, org_id, client_id, session_date, title, content, status, duration_minutes, created_at)
select ('d1000000-0000-4000-8000-' || right(c.id::text, 12))::uuid, c.org_id, c.id, date '2026-02-10',
       c.name || ' · Feb 10, 2026',
       '<p>Private working note. PRIVATE-CANARY-NOTE-' || c.id || '</p><p>ACTION: Draft the delegation list</p><p>INSIGHT: Control feels like safety</p>',
       'draft', 60, timestamptz '2026-02-10T17:00:00Z'
  from clients c
 where c.email like '%@bots.theleadershipwell.test'
on conflict (id) do nothing;

insert into communications (id, org_id, coach_id, client_id, type, direction, subject, preview, body_html, status, sent_at) values
  ('d2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-0000000000a1', 'session_note', 'outbound', 'Our session on Feb 3',
   'Great work naming what you will hand off.', '<p>Great work naming what you will hand off. SENT-NOTE-OK-INDY</p>',
   'sent', '2026-02-03T18:00:00Z'),
  ('d2000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b0', 'b1000000-0000-4000-8000-000000000001',
   'c2000000-0000-4000-8000-0000000000b1', 'session_note', 'outbound', 'ORG-B-SECRET session recap',
   'Board prep.', '<p>ORG-B-SECRET recap for Bruno.</p>', 'sent', '2026-02-04T18:00:00Z')
on conflict (id) do nothing;
insert into notes (id, org_id, client_id, session_date, title, content, status, sent_to_client_at, client_communication_id, created_at) values
  ('d3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-0000000000a1',
   date '2026-02-03', 'Indy Individual · Feb 3, 2026', '<p>Sent session note.</p>', 'sent', '2026-02-03T18:00:00Z',
   'd2000000-0000-4000-8000-000000000001', '2026-02-03T17:00:00Z')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Transcripts (portal shows a client's own session records)
-- ---------------------------------------------------------------------------
insert into transcripts (id, org_id, coach_id, client_id, client_initials, source, filename, title, raw_md, content_hash, session_date, match_status, created_at) values
  ('d4000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-0000000000a1', 'II', 'manual', 'indy-2026-02-03.md', 'Indy Individual · Feb 3, 2026',
   E'# Session\n\nCoach: What would you like to focus on?\nIndy: Delegating the ops review.',
   'staging-seed-indy-1', date '2026-02-03', 'matched', '2026-02-03T17:30:00Z'),
  ('d4000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b0', 'b1000000-0000-4000-8000-000000000001',
   'c2000000-0000-4000-8000-0000000000b1', 'BC', 'manual', 'bruno-2026-02-04.md', 'Bruno Contoso · Feb 4, 2026',
   E'# Session\n\nCoach: Where shall we start?\nBruno: ORG-B-SECRET-TRANSCRIPT board nerves.',
   'staging-seed-bruno-1', date '2026-02-04', 'matched', '2026-02-04T17:30:00Z')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Upcoming sessions (2030 keeps them "upcoming" forever)
-- ---------------------------------------------------------------------------
insert into appointments (id, org_id, coach_id, client_id, scheduled_at, duration_minutes, google_event_id, status, source, title) values
  ('d5000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-0000000000a1', '2030-01-15T16:00:00Z', 55, 'staging-evt-indy-1', 'scheduled', 'native', 'Coaching · Indy'),
  ('d5000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-0000000000a2', '2030-01-16T16:00:00Z', 55, 'staging-evt-ellis-1', 'scheduled', 'native', 'Coaching · Ellis'),
  ('d5000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b0', 'b1000000-0000-4000-8000-000000000001',
   'c2000000-0000-4000-8000-0000000000b1', '2030-01-17T10:00:00Z', 55, 'staging-evt-bruno-1', 'scheduled', 'native', 'Coaching · Bruno')
on conflict (id) do nothing;

commit;
