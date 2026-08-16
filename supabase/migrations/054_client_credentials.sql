-- Migration 054 — Client Portal username + password  (UP)
--
-- The portal shipped with magic-link sign-in only. This adds an optional
-- username + password a client can set for themselves; the magic link stays as
-- the recovery path (and as the way a coach gets a client back in).
--
-- The hash lives in its OWN table rather than on `clients` on purpose: portal
-- and coach code select from `clients` constantly, sometimes with `select *`,
-- and a password hash must never ride along in one of those payloads by
-- accident. A separate table makes leaking it require a deliberate join.
--
-- What the coach can see is `username`, whether a password is set, and
-- `last_login_at` — never the password, which is a one-way hash. The coach's
-- affordances are "resend the sign-in link" (the existing portal-invite route)
-- and, implicitly, "the client can reset it themselves".
--
-- Reversible via 054_client_credentials_down.sql.

create table if not exists client_credentials (
  client_id       uuid primary key references clients(id) on delete cascade,
  org_id          uuid not null default '00000000-0000-4000-8000-000000000001'
                    references organizations(id),
  -- Lowercased at write time; unique across the whole install so sign-in needs
  -- only the username, not a tenant hint.
  username        text not null unique,
  -- scrypt: "scrypt$N$r$p$<salt-b64>$<hash-b64>". Never reversible, never shown.
  password_hash   text not null,
  -- Throttling state for the password form. The magic-link limiter doesn't
  -- cover this path — a password field invites guessing in a way a link doesn't.
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Sign-in looks the row up by username; the PK covers the client_id direction.
create index if not exists client_credentials_username_idx
  on client_credentials (username);
create index if not exists client_credentials_org_id_idx
  on client_credentials (org_id);

alter table client_credentials enable row level security;
