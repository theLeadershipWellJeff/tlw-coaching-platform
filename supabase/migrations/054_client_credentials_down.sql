-- Migration 054 — Client Portal username + password  (DOWN)
--
-- Drops every stored password. Clients fall back to magic-link sign-in, which
-- always remains available, so no one is locked out by this.

drop index if exists client_credentials_org_id_idx;
drop index if exists client_credentials_username_idx;
drop table if exists client_credentials;
