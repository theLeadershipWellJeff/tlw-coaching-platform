-- Migration 045 — Client Portal AI chat (portal_conversations + portal_messages)  (UP)
-- Stores the client-facing reflection chat. Both tables are reached only via the
-- service-role admin client and every query is app-scoped to the authenticated
-- portal client (RLS enabled, no policy — consistent with the schema). The AI
-- context is built from the client's OWN goals + transcripts; coach-private
-- fields (key_info, coach notes) are never included.
-- Reversible via 045_portal_chat_down.sql.

create table if not exists portal_conversations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default '00000000-0000-4000-8000-000000000001'
                references organizations(id),
  client_id   uuid not null references clients(id) on delete cascade,
  title       text not null default 'New conversation',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists portal_conversations_client_idx
  on portal_conversations (client_id, updated_at desc);
create index if not exists portal_conversations_org_id_idx
  on portal_conversations (org_id);

create table if not exists portal_messages (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default '00000000-0000-4000-8000-000000000001'
                     references organizations(id),
  conversation_id  uuid not null references portal_conversations(id) on delete cascade,
  role             text not null,   -- 'user' | 'assistant'
  content          text not null,
  created_at       timestamptz not null default now()
);
create index if not exists portal_messages_conversation_idx
  on portal_messages (conversation_id, created_at);
create index if not exists portal_messages_org_id_idx
  on portal_messages (org_id);

alter table portal_conversations enable row level security;
alter table portal_messages enable row level security;
