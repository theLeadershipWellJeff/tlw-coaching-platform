-- Migration 043 — org-scoped RLS (SELECT) on notes + actions  (UP)
-- Phase 1 §5.3 group 1a — the first strangler RLS cutover.
--
-- Adds a FOR SELECT policy scoping each table to the caller's organization, read
-- from the `org_id` claim on the request-scoped JWT (lib/supabase/jwt.ts →
-- getSupabaseForClaims). SELECT-ONLY on purpose: writes still run through the
-- service-role admin client, which BYPASSES RLS, so INSERT/UPDATE/DELETE are
-- entirely unaffected by this migration. The write path (WITH CHECK + org_id on
-- inserts) lands in a later increment (§5.3 group 1b).
--
-- RLS is already ENABLED on both tables (since their original migrations) with no
-- policy — i.e. deny-by-default for any non-service-role caller. The service-role
-- key keeps bypassing these policies, so every route still on getSupabaseAdmin()
-- is unchanged. Only the authenticated-role JWT client is scoped by org.
--
-- Reversible via 043_rls_notes_actions_select_down.sql.

-- The authenticated role needs a table-level SELECT grant for the policy to have
-- anything to filter (Supabase usually grants this by default; assert it).
grant select on notes   to authenticated;
grant select on actions to authenticated;

drop policy if exists notes_org_select on notes;
create policy notes_org_select on notes
  for select
  to authenticated
  using (org_id = (auth.jwt() ->> 'org_id')::uuid);

drop policy if exists actions_org_select on actions;
create policy actions_org_select on actions
  for select
  to authenticated
  using (org_id = (auth.jwt() ->> 'org_id')::uuid);
