-- Migration 042 — organizations + org_id big-bang  (UP)
-- Phase 1 §5.0. Introduces the tenant root and stamps every tenant row with an
-- org_id, backfilled to org #1 (theLeadershipWell). SCHEMA ONLY — no RLS is
-- enabled, no policy is added, no application behavior changes. The org_id
-- column carries a transitional DEFAULT of org #1 so existing INSERTs keep
-- working with zero code change; a later migration removes that default once
-- inserts set org_id explicitly from the request JWT (Phase 1 §5.1).
-- Reversible via 042_organizations_and_org_id_down.sql.

-- ---------------------------------------------------------------------------
-- organizations — the tenant root. RLS enabled, no policy (service-role only,
-- consistent with every other table until the strangler RLS rollout).
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  legal_entity_name text,               -- for agreements / mandates (per-tenant legal name)
  from_email        text,               -- per-org default send-from (Phase 1 §5.5)
  cc_email          text,               -- per-org default Cc
  logo_url          text,               -- per-org brand mark
  brand_color       text,               -- per-org accent
  timezone          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table organizations enable row level security;

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

-- Org #1 = theLeadershipWell (fixed id — referenced as the transitional default).
insert into organizations (id, name, legal_entity_name, from_email, cc_email)
values (
  '00000000-0000-4000-8000-000000000001',
  'theLeadershipWell',
  'theLeadershipWell',
  'jeff@jeffkholmes.com',
  'jeff@theleadershipwell.com'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Add org_id to every tenant table: NOT NULL DEFAULT org#1 (fills existing rows
-- and any not-yet-org-aware INSERT), FK to organizations, indexed for policy
-- lookups. Idempotent.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'actions','agenda_requests','agreement_templates','agreements',
    'appointment_reminders','appointments','billable_sessions','billing_accounts',
    'billing_authorization_events','billing_run_warnings','clients','coach_clients',
    'coach_growth_areas','coachees','coaches','communications','dashboard_layouts',
    'email_signatures','engagements','garden_edges','garden_notes',
    'growth_area_assessments','invoice_adjustments','invoice_charge_attempts',
    'invoice_lines','invoice_reminders','invoices','library_folders','note_templates',
    'notes','nudges','pdf_resources','prep_sheet_pipeline','prep_sheets',
    'session_reports','transcripts'
  ]
  loop
    execute format(
      'alter table %I add column if not exists org_id uuid not null '
      || 'default ''00000000-0000-4000-8000-000000000001'' references organizations(id)',
      t
    );
    execute format(
      'create index if not exists %I on %I (org_id)', t || '_org_id_idx', t
    );
  end loop;
end $$;

-- Safety re-assert: any row that somehow escaped the default lands on org #1.
do $$
declare t text;
begin
  foreach t in array array[
    'actions','agenda_requests','agreement_templates','agreements',
    'appointment_reminders','appointments','billable_sessions','billing_accounts',
    'billing_authorization_events','billing_run_warnings','clients','coach_clients',
    'coach_growth_areas','coachees','coaches','communications','dashboard_layouts',
    'email_signatures','engagements','garden_edges','garden_notes',
    'growth_area_assessments','invoice_adjustments','invoice_charge_attempts',
    'invoice_lines','invoice_reminders','invoices','library_folders','note_templates',
    'notes','nudges','pdf_resources','prep_sheet_pipeline','prep_sheets',
    'session_reports','transcripts'
  ]
  loop
    execute format(
      'update %I set org_id = ''00000000-0000-4000-8000-000000000001'' where org_id is null', t
    );
  end loop;
end $$;
