-- Migration 055 — frameworks surfaced to a client  (DOWN)
--
-- The portal's Frameworks card falls back to deriving its list from the client's
-- framework nudges, which is what it did before this table existed.

drop index if exists client_frameworks_org_id_idx;
drop index if exists client_frameworks_client_idx;
drop index if exists client_frameworks_unique_idx;
drop table if exists client_frameworks;
