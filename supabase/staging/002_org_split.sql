-- ============================================================================
-- theLeadershipWell — STAGING ORG SPLIT  (Phase 1 §5.3)
-- ============================================================================
-- Run in the STAGING project ONLY, AFTER 042 (organizations + org_id) and the
-- original 001_synthetic_seed.sql have both been applied.
--
-- WHY: the synthetic seed was authored before `org_id` existed, so after 042
-- every seeded row inherited the DEFAULT org #1. That makes the two "orgs" a
-- single tenant at the DB level, which cannot demonstrate org isolation. This
-- script gives the seed a real two-tenant shape:
--
--   Org A  = org #1  ('...0001', theLeadershipWell — the default; Ada + Ben and
--            their four clients already sit here, so no update is needed).
--   Org B  = org #2  ('...0002', created below; Cara + Nadia + Omar move here).
--
-- It also seeds a couple of `actions` rows (the seed created none — only notes
-- with "ACTION:" text), one per org, so the actions SELECT policy has data to
-- isolate.
--
-- Idempotent: safe to re-run (fixed ids + guarded updates).
-- ⚠️  NEVER run against production.
-- ============================================================================

begin;

-- Org B tenant root ----------------------------------------------------------
insert into organizations (id, name, legal_entity_name)
values ('00000000-0000-4000-8000-000000000002', 'Org B — staging', 'Org B (synthetic)')
on conflict (id) do nothing;

-- Move every Org B row (Cara + Nadia c5 + Omar c6) to org #2 ------------------
update coaches       set org_id = '00000000-0000-4000-8000-000000000002'
  where id = 'b0000000-0000-4000-8000-000000000b01';

update clients       set org_id = '00000000-0000-4000-8000-000000000002'
  where id in ('c0000000-0000-4000-8000-0000000000c5','c0000000-0000-4000-8000-0000000000c6');

update coach_clients set org_id = '00000000-0000-4000-8000-000000000002'
  where coach_id = 'b0000000-0000-4000-8000-000000000b01';

update notes         set org_id = '00000000-0000-4000-8000-000000000002'
  where client_id in ('c0000000-0000-4000-8000-0000000000c5','c0000000-0000-4000-8000-0000000000c6');

update transcripts   set org_id = '00000000-0000-4000-8000-000000000002'
  where client_id in ('c0000000-0000-4000-8000-0000000000c5','c0000000-0000-4000-8000-0000000000c6');

update agreements    set org_id = '00000000-0000-4000-8000-000000000002'
  where client_id = 'c0000000-0000-4000-8000-0000000000c5';

update appointments  set org_id = '00000000-0000-4000-8000-000000000002'
  where client_id = 'c0000000-0000-4000-8000-0000000000c5';

update billing_accounts set org_id = '00000000-0000-4000-8000-000000000002'
  where id = 'd0000000-0000-4000-8000-0000000db001';

update coachees      set org_id = '00000000-0000-4000-8000-000000000002'
  where id = 'e0000000-0000-4000-8000-0000000e0002';

update engagements   set org_id = '00000000-0000-4000-8000-000000000002'
  where billing_account_id = 'd0000000-0000-4000-8000-0000000db001';

-- Seed one action per org (org #1 = Fiona c1, org #2 = Nadia c5) --------------
insert into actions (id, client_id, description, status, org_id) values
  ('f0000000-0000-4000-8000-0000000000a1',
   'c0000000-0000-4000-8000-0000000000c1',
   'SYNTHETIC action for Fiona (Org A) — follow up before next session.',
   'open', '00000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-0000000000b1',
   'c0000000-0000-4000-8000-0000000000c5',
   'SYNTHETIC action for Nadia (Org B) — follow up before next session.',
   'open', '00000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

commit;

-- ============================================================================
-- VERIFICATION — DB-level proof of the 043 policies (run AFTER 043 is applied).
-- Simulates an authenticated request per org and confirms notes/actions isolate.
-- Each block is wrapped in begin/rollback so the role + claim reset cleanly.
-- ============================================================================
--
-- -- As Org A (org #1): expect 8 notes visible, 0 leak from Org B, 1 action.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     '{"role":"authenticated","org_id":"00000000-0000-4000-8000-000000000001"}', true);
--   select count(*) as org_a_notes   from notes;                                    -- 8
--   select count(*) as org_b_leak    from notes   where org_id = '00000000-0000-4000-8000-000000000002'; -- 0
--   select count(*) as org_a_actions from actions;                                  -- 1
-- rollback;
--
-- -- As Org B (org #2): expect 4 notes visible, 0 leak from Org A, 1 action.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     '{"role":"authenticated","org_id":"00000000-0000-4000-8000-000000000002"}', true);
--   select count(*) as org_b_notes   from notes;                                    -- 4
--   select count(*) as org_a_leak    from notes   where org_id = '00000000-0000-4000-8000-000000000001'; -- 0
--   select count(*) as org_b_actions from actions;                                  -- 1
-- rollback;
--
-- Optional app smoke-test (so a real Google login on staging sees data): link
-- YOUR staging coach (org #1 by default) to Fiona, then open her workspace — her
-- notes/actions load, and Nadia (Org B) never appears.
--   insert into coach_clients (coach_id, client_id, role, org_id)
--   select id, 'c0000000-0000-4000-8000-0000000000c1', 'primary', org_id
--   from coaches where email = lower('<your-staging-login-email>')
--   on conflict (coach_id, client_id) do nothing;
-- ============================================================================
