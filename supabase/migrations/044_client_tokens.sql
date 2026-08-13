-- Migration 044 — client_tokens (Client Portal magic-link auth)  (UP)
-- The client-facing portal (app/portal/*) authenticates clients with single-use,
-- time-limited magic links emailed from their coach's Gmail. This table stores
-- only a SHA-256 HASH of each token (the raw token lives only in the emailed
-- link), so a DB read never yields a usable credential. Tokens are single-use
-- (used_at) and expire (expires_at). Reached only via the service-role admin
-- client (RLS enabled, no policy — consistent with the rest of the schema).
-- Reversible via 044_client_tokens_down.sql.

create table if not exists client_tokens (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default '00000000-0000-4000-8000-000000000001'
                references organizations(id),
  client_id   uuid not null references clients(id) on delete cascade,
  token_hash  text not null,                 -- sha256(raw token); raw never stored
  purpose     text not null default 'login', -- login | (future: other portal flows)
  expires_at  timestamptz not null,
  used_at     timestamptz,                    -- set on first successful verify (single-use)
  created_at  timestamptz not null default now()
);

create index if not exists client_tokens_hash_idx    on client_tokens (token_hash);
create index if not exists client_tokens_client_idx  on client_tokens (client_id);
create index if not exists client_tokens_org_id_idx  on client_tokens (org_id);

alter table client_tokens enable row level security;
