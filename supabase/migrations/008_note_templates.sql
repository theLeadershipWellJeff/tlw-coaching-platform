-- theLeadershipWell — note templates (Library)
--
-- Reusable, formatted note templates the coach authors in the Library and drops
-- into a note from the editor's "Templates" dropdown. Coach-scoped; content is
-- the same rich-text HTML the note editor produces. Reached only with the
-- service-role key, so RLS is on with no public policies (like the other tables).

create table if not exists note_templates (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references coaches (id) on delete cascade,
  name        text not null,
  content     text not null default '',   -- rich-text HTML
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists note_templates_coach_id_idx on note_templates (coach_id);

create trigger note_templates_set_updated_at
  before update on note_templates
  for each row execute function set_updated_at();

alter table note_templates enable row level security;
