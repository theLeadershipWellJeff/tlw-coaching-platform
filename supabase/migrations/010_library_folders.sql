-- theLeadershipWell — Library folder system
--
-- The Library becomes a folder system with two sections:
--   templates — folders (Note, Worksheets, Agreements, + custom) holding the
--               coach's note_templates
--   pdf       — folders holding uploaded PDF resources (files live in Supabase
--               Storage; pdf_resources rows are the index)
--
-- Folders and their contents are coach-scoped. Reached only with the
-- service-role key, so RLS is on with no public policies.

create table if not exists library_folders (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references coaches (id) on delete cascade,
  section     text not null,                 -- 'templates' | 'pdf'
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists library_folders_coach_section_idx on library_folders (coach_id, section);

create trigger library_folders_set_updated_at
  before update on library_folders
  for each row execute function set_updated_at();

alter table library_folders enable row level security;

-- Note templates now belong to a folder (null = unfiled). Deleting a folder
-- removes the templates it holds.
alter table note_templates
  add column if not exists folder_id uuid references library_folders (id) on delete cascade;

create index if not exists note_templates_folder_idx on note_templates (folder_id);

-- PDF resources — one row per uploaded file (the bytes live in Storage).
create table if not exists pdf_resources (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid references coaches (id) on delete cascade,
  folder_id     uuid references library_folders (id) on delete cascade,
  name          text not null,
  storage_path  text not null,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);

create index if not exists pdf_resources_folder_idx on pdf_resources (folder_id);

alter table pdf_resources enable row level security;
