-- Migration 069 — down-script. Deactivates the goal-setting brief v2 and
-- re-activates the previous weekly_plan version (061's seeded v1). Rows are
-- kept: brief versions are an audit trail cited by portal_messages.metadata.
DO $do$
DECLARE
  o RECORD;
  cur int;
  prev int;
BEGIN
  FOR o IN SELECT DISTINCT org_id FROM prompt_briefs LOOP
    SELECT version INTO cur FROM prompt_briefs
      WHERE org_id = o.org_id AND slug = 'weekly_plan'
        AND title = 'Plan your week — goal-setting coaching brief v2'
      ORDER BY version DESC LIMIT 1;
    IF cur IS NULL THEN CONTINUE; END IF;
    UPDATE prompt_briefs SET is_active = false
      WHERE org_id = o.org_id AND slug = 'weekly_plan' AND version = cur;
    SELECT MAX(version) INTO prev FROM prompt_briefs
      WHERE org_id = o.org_id AND slug = 'weekly_plan' AND version < cur;
    IF prev IS NOT NULL THEN
      UPDATE prompt_briefs SET is_active = true
        WHERE org_id = o.org_id AND slug = 'weekly_plan' AND version = prev;
    END IF;
  END LOOP;
END
$do$;
