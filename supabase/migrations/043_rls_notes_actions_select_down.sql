-- Migration 043 — org-scoped RLS (SELECT) on notes + actions  (DOWN)
-- Exact reversal of 043_rls_notes_actions_select.sql. Drops the two SELECT
-- policies, returning both tables to deny-by-default for the authenticated role
-- (their pre-043 state — no route used the JWT client before this increment, so
-- nothing depends on the policies existing).
--
-- The SELECT grant to `authenticated` is intentionally LEFT in place: it is a
-- Supabase default that other tooling may rely on, and it is harmless with no
-- policy present (RLS still denies every row). Revoking it is out of scope for a
-- clean policy rollback.

drop policy if exists notes_org_select   on notes;
drop policy if exists actions_org_select on actions;
