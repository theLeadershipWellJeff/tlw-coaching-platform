-- Migration 042 — organizations + org_id big-bang  (DOWN)
-- Exact reversal of 042_organizations_and_org_id.sql. Safe to run where the up
-- was applied. Drops the org_id column (+ its index) from every tenant table,
-- then drops the organizations table. No tenant data is lost — org_id was a
-- pure additive tenant tag backfilled to org #1.

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
    execute format('drop index if exists %I', t || '_org_id_idx');
    execute format('alter table %I drop column if exists org_id', t);
  end loop;
end $$;

drop table if exists organizations;
