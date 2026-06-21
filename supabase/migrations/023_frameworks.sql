-- 023: Framework index (Phase A-parallel — vault connection)
--
-- A DERIVED index over the coach's mind garden (the TheLeadershipWell-Vault repo),
-- not a content store. The vault stays the single source of truth: this table holds
-- only POINTERS + the 1-hop association graph so the nudge engine can (a) match a
-- framework the coach named in session against `aliases`, and (b) pull the note's
-- CURRENT content live from GitHub at draft time. Note bodies are NEVER copied here.
--
-- Built/refreshed by the vault sync job (lib/vault/sync.ts), which reads only files
-- under the configured folder that carry the `framework: true` frontmatter tag
-- (double scoping). Re-runs upsert on (coach_id, slug); blob_sha lets a sync skip
-- unchanged notes.
--
-- RLS on, no public policies — reached only via the service-role key. Coach-scoped
-- in code (the vault PAT is a single, app-level read credential).

create table if not exists frameworks (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null references coaches(id) on delete cascade,
  -- Stable id from frontmatter; the matching/linking key. Unique per coach.
  slug            text not null,
  name            text not null,
  -- Everything the coach might say out loud that should match this note.
  aliases         text[] not null default '{}',
  -- Situational cues that suggest the framework even if unnamed (Phase C).
  trigger_signals text[] not null default '{}',
  -- Short "when to use" line from frontmatter (optional).
  when_to_use     text,
  -- Path within the vault repo, used to pull live content at draft time.
  vault_path      text not null,
  -- 1-hop wikilink edges: target slugs when the target is also a tagged framework,
  -- else the raw link title. The association graph used to enrich nudges.
  linked_slugs    text[] not null default '{}',
  -- The note's git blob SHA at last index — lets a sync skip unchanged files.
  blob_sha        text,
  last_synced_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table frameworks enable row level security;

create unique index if not exists frameworks_coach_slug_idx on frameworks (coach_id, slug);
create index if not exists frameworks_coach_idx on frameworks (coach_id);
