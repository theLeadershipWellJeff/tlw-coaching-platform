-- ============================================================================
-- theLeadershipWell — SYNTHETIC STAGING SEED  (Phase 0.1)
-- ============================================================================
-- Run AFTER 000_full_baseline.sql, in the STAGING project ONLY.
--
-- ⚠️  NEVER run this against production. NEVER copy production data into staging.
--     Every name/email below is deliberately fictional and must not resemble any
--     real client. Emails use the reserved .example TLD so nothing can be sent.
--
-- Tenancy note: there is no `organizations` table yet (that is Phase 1). "Org A"
-- and "Org B" are represented today by their coaches + the coach_clients links.
-- Shape: 2 orgs · 3 coaches (2 in Org A, 1 in Org B) · 6 clients (4 in Org A
-- split across its two coaches, 2 in Org B) · 2 transcripts + 2 notes per client
-- · one agreement, one appointment, and one billing account per org.
--
-- Idempotent: re-running is safe (ON CONFLICT guards on every unique key).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Coaches  (Org A: Ada + Ben · Org B: Cara)
-- ---------------------------------------------------------------------------
insert into coaches (id, email, name, role) values
  ('a0000000-0000-4000-8000-000000000a01', 'ada.coach@orga.example',  'Ada Ampersand', 'coach'),
  ('a0000000-0000-4000-8000-000000000a02', 'ben.coach@orga.example',  'Ben Bracket',   'coach'),
  ('b0000000-0000-4000-8000-000000000b01', 'cara.coach@orgb.example', 'Cara Caret',    'coach')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Clients  (Org A/Ada: Fiona, Gil · Org A/Ben: Hana, Ivan · Org B/Cara: Nadia, Omar)
-- ---------------------------------------------------------------------------
insert into clients (id, name, email, title, company, status, timezone) values
  ('c0000000-0000-4000-8000-0000000000c1', 'Fiona Fictional',    'fiona@client.example', 'VP Operations', 'Acme Synthetic Corp', 'active', 'America/New_York'),
  ('c0000000-0000-4000-8000-0000000000c2', 'Gil Placeholder',    'gil@client.example',   'Director',      'Acme Synthetic Corp', 'active', 'America/Chicago'),
  ('c0000000-0000-4000-8000-0000000000c3', 'Hana Hypothetical',  'hana@client.example',  'Head of Eng',   'Sample Widgets LLC',  'active', 'America/Denver'),
  ('c0000000-0000-4000-8000-0000000000c4', 'Ivan Invented',      'ivan@client.example',  'CFO',           'Sample Widgets LLC',  'active', 'America/Los_Angeles'),
  ('c0000000-0000-4000-8000-0000000000c5', 'Nadia Notreal',      'nadia@client.example', 'CEO',           'Placeholder Bank',    'active', 'Europe/London'),
  ('c0000000-0000-4000-8000-0000000000c6', 'Omar Obviously-Fake','omar@client.example',  'COO',           'Placeholder Bank',    'active', 'Europe/Berlin')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tenant links  (each client → its one coach)
-- ---------------------------------------------------------------------------
insert into coach_clients (coach_id, client_id, role) values
  ('a0000000-0000-4000-8000-000000000a01', 'c0000000-0000-4000-8000-0000000000c1', 'primary'),
  ('a0000000-0000-4000-8000-000000000a01', 'c0000000-0000-4000-8000-0000000000c2', 'primary'),
  ('a0000000-0000-4000-8000-000000000a02', 'c0000000-0000-4000-8000-0000000000c3', 'primary'),
  ('a0000000-0000-4000-8000-000000000a02', 'c0000000-0000-4000-8000-0000000000c4', 'primary'),
  ('b0000000-0000-4000-8000-000000000b01', 'c0000000-0000-4000-8000-0000000000c5', 'primary'),
  ('b0000000-0000-4000-8000-000000000b01', 'c0000000-0000-4000-8000-0000000000c6', 'primary')
on conflict (coach_id, client_id) do nothing;

-- ---------------------------------------------------------------------------
-- Notes  (2 per client)
-- ---------------------------------------------------------------------------
insert into notes (client_id, session_date, title, content)
select m.client_id::uuid,
       (current_date - (g.n * 14)),
       m.cname || ' · session ' || g.n || ' (SYNTHETIC)',
       'SYNTHETIC seed note for ' || m.cname || '. INSIGHT: growth theme #' || g.n ||
       '. ACTION: follow up on item ' || g.n || ' before next session.'
from (values
  ('c0000000-0000-4000-8000-0000000000c1','Fiona Fictional'),
  ('c0000000-0000-4000-8000-0000000000c2','Gil Placeholder'),
  ('c0000000-0000-4000-8000-0000000000c3','Hana Hypothetical'),
  ('c0000000-0000-4000-8000-0000000000c4','Ivan Invented'),
  ('c0000000-0000-4000-8000-0000000000c5','Nadia Notreal'),
  ('c0000000-0000-4000-8000-0000000000c6','Omar Obviously-Fake')
) as m(client_id, cname)
cross join (values (1),(2)) as g(n);

-- ---------------------------------------------------------------------------
-- Transcripts  (2 per client; matched to the owning coach)
-- ---------------------------------------------------------------------------
insert into transcripts
  (coach_id, client_id, client_initials, source, filename, raw_md, content_hash,
   session_date, match_status, match_confidence)
select m.coach_id::uuid, m.client_id::uuid, m.initials, 'seed',
       'synthetic-' || split_part(m.client_id,'-',5) || '-' || g.n || '.md',
       '# Coaching session with ' || m.cname || ' (SYNTHETIC)' || chr(10) ||
       'Coach: ' || m.cname || ' and coach discuss goal #' || g.n || '.' || chr(10) ||
       m.cname || ': This is fabricated transcript text for staging session ' || g.n || '.',
       'seed-hash-' || m.client_id || '-' || g.n,
       (current_date - (g.n * 14)),
       'matched', 1.0
from (values
  ('a0000000-0000-4000-8000-000000000a01','c0000000-0000-4000-8000-0000000000c1','FF','Fiona Fictional'),
  ('a0000000-0000-4000-8000-000000000a01','c0000000-0000-4000-8000-0000000000c2','GP','Gil Placeholder'),
  ('a0000000-0000-4000-8000-000000000a02','c0000000-0000-4000-8000-0000000000c3','HH','Hana Hypothetical'),
  ('a0000000-0000-4000-8000-000000000a02','c0000000-0000-4000-8000-0000000000c4','II','Ivan Invented'),
  ('b0000000-0000-4000-8000-000000000b01','c0000000-0000-4000-8000-0000000000c5','NN','Nadia Notreal'),
  ('b0000000-0000-4000-8000-000000000b01','c0000000-0000-4000-8000-0000000000c6','OO','Omar Obviously-Fake')
) as m(coach_id, client_id, initials, cname)
cross join (values (1),(2)) as g(n)
on conflict (content_hash) do nothing;

-- ---------------------------------------------------------------------------
-- Agreements  (one per org)
-- ---------------------------------------------------------------------------
insert into agreements (coach_id, client_id, title, body_html, status) values
  ('a0000000-0000-4000-8000-000000000a01', 'c0000000-0000-4000-8000-0000000000c1',
   'Coaching Agreement — Fiona Fictional (SYNTHETIC)',
   '<h1>SYNTHETIC coaching agreement</h1><p>For staging tests only.</p>', 'sent'),
  ('b0000000-0000-4000-8000-000000000b01', 'c0000000-0000-4000-8000-0000000000c5',
   'Coaching Agreement — Nadia Notreal (SYNTHETIC)',
   '<h1>SYNTHETIC coaching agreement</h1><p>For staging tests only.</p>', 'sent');

-- ---------------------------------------------------------------------------
-- Appointments  (one per org, in the near future)
-- ---------------------------------------------------------------------------
insert into appointments (coach_id, client_id, scheduled_at, duration_minutes, status) values
  ('a0000000-0000-4000-8000-000000000a01', 'c0000000-0000-4000-8000-0000000000c1', now() + interval '3 days', 60, 'scheduled'),
  ('b0000000-0000-4000-8000-000000000b01', 'c0000000-0000-4000-8000-0000000000c5', now() + interval '5 days', 60, 'scheduled');

-- ---------------------------------------------------------------------------
-- Billing  (one account per org, each with one coachee + one engagement)
-- ---------------------------------------------------------------------------
insert into billing_accounts (id, coach_id, name, type, billing_email) values
  ('d0000000-0000-4000-8000-0000000da001', 'a0000000-0000-4000-8000-000000000a01', 'Org A — Acme Synthetic Corp', 'enterprise', 'ap@orga.example'),
  ('d0000000-0000-4000-8000-0000000db001', 'b0000000-0000-4000-8000-000000000b01', 'Org B — Nadia Notreal',       'solo',       'nadia@client.example')
on conflict (id) do nothing;

insert into coachees (id, coach_id, client_id, billing_account_id) values
  ('e0000000-0000-4000-8000-0000000e0001', 'a0000000-0000-4000-8000-000000000a01', 'c0000000-0000-4000-8000-0000000000c1', 'd0000000-0000-4000-8000-0000000da001'),
  ('e0000000-0000-4000-8000-0000000e0002', 'b0000000-0000-4000-8000-000000000b01', 'c0000000-0000-4000-8000-0000000000c5', 'd0000000-0000-4000-8000-0000000db001')
on conflict (coach_id, client_id) do nothing;

insert into engagements (coach_id, billing_account_id, coachee_id, billing_mode, rate_hourly, status) values
  ('a0000000-0000-4000-8000-000000000a01', 'd0000000-0000-4000-8000-0000000da001', 'e0000000-0000-4000-8000-0000000e0001', 'arrears', 250.00, 'active'),
  ('b0000000-0000-4000-8000-000000000b01', 'd0000000-0000-4000-8000-0000000db001', 'e0000000-0000-4000-8000-0000000e0002', 'arrears', 300.00, 'active');

commit;

-- Quick verification (optional — run separately):
--   select (select count(*) from coaches),  (select count(*) from clients),
--          (select count(*) from transcripts), (select count(*) from notes),
--          (select count(*) from billing_accounts);
--   Expect: 3 coaches, 6 clients, 12 transcripts, 12 notes, 2 billing accounts.
