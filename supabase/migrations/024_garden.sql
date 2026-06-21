-- 024: Garden index (supersedes 023 frameworks) — vault connection, node + edge model
--
-- A DERIVED index over the coach's mind garden (the TheLeadershipWell-Vault repo).
-- The vault stays the single source of truth: these tables hold only POINTERS +
-- the association graph so the nudge engine can match a leaf the coach is working
-- and pull the note's CURRENT content live from GitHub at draft time. Note bodies
-- are NEVER copied here.
--
-- Why this replaces 023's `frameworks`: client-facing leaves are deliberately
-- heterogeneous in `type` (framework, principle, phrase, psycap-seed,
-- psycap-deep-dive), so keying on `type == framework` / `framework: true` would
-- silently miss leaves like Hope, Clarity, Delegate, Inner HERO. A note is an
-- indexable LEAF iff its frontmatter carries `nudge_eligible` (equivalently a
-- `themes` array); `nudge_eligible: true` is the separate client-SURFACING gate.
--
-- Built/refreshed by lib/vault/sync.ts (manual button + hourly cron). RLS on, no
-- public policies — reached only via the service-role key; coach-scoped in code.

-- 023's table was empty (indexed 0) — drop it outright.
drop table if exists frameworks;

create table if not exists garden_notes (
  -- coach_id + the frontmatter `id` (a stable slug) are the identity. `id` is the
  -- edge endpoint referenced by garden_edges. Composite PK = unique per coach.
  coach_id        uuid not null references coaches(id) on delete cascade,
  id              text not null,
  title           text not null,
  -- Free-form leaf kind (framework | principle | phrase | psycap-seed | ...). Not
  -- a gate — kept for display/filtering only.
  type            text,
  -- Cross-cutting tags the nudge engine matches against (e.g. psycap, feedback).
  themes          text[] not null default '{}',
  -- Short client-facing line; present only on eligible leaves.
  summary         text,
  -- The client-surfacing gate. A leaf is indexed regardless; only `true` leaves
  -- are ever surfaced to a client.
  nudge_eligible  boolean not null default false,
  -- Spoken/alternate names → used to resolve [[wikilinks]] to ids.
  aliases         text[] not null default '{}',
  -- Path within the vault repo; used to pull live content at draft time.
  vault_path      text not null,
  -- Git blob SHA at last index (change detection; reserved).
  blob_sha        text,
  last_synced_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (coach_id, id)
);
alter table garden_notes enable row level security;
create index if not exists garden_notes_coach_idx on garden_notes (coach_id);
create index if not exists garden_notes_eligible_idx on garden_notes (coach_id, nudge_eligible);

create table if not exists garden_edges (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references coaches(id) on delete cascade,
  -- Both endpoints are garden_notes.id values (within the same coach).
  source_id   text not null,
  target_id   text not null,
  -- Where the link came from: 'parent' (frontmatter parent:), 'framework'
  -- (frontmatter frameworks:), or 'link' (inline body [[wikilink]]).
  relation    text not null default 'link',
  created_at  timestamptz not null default now(),
  foreign key (coach_id, source_id) references garden_notes (coach_id, id) on delete cascade,
  foreign key (coach_id, target_id) references garden_notes (coach_id, id) on delete cascade,
  unique (coach_id, source_id, target_id, relation)
);
alter table garden_edges enable row level security;
create index if not exists garden_edges_coach_idx on garden_edges (coach_id);
create index if not exists garden_edges_source_idx on garden_edges (coach_id, source_id);
