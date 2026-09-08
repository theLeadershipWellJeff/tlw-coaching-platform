-- Migration 066 — down-script. Deactivates the v2.1 brief and re-activates the
-- previous assessment_360 version (065's v2, or the 059 placeholder). Rows are
-- kept: brief versions are an audit trail cited by portal_messages.metadata.
DO $do$
DECLARE
  o RECORD;
  cur int;
  prev int;
BEGIN
  FOR o IN SELECT DISTINCT org_id FROM prompt_briefs LOOP
    SELECT version INTO cur FROM prompt_briefs
      WHERE org_id = o.org_id AND slug = 'assessment_360'
        AND title = 'Assessment 360 interpretation brief v2.1 — Extraordinary Leader'
      ORDER BY version DESC LIMIT 1;
    IF cur IS NULL THEN CONTINUE; END IF;
    UPDATE prompt_briefs SET is_active = false
      WHERE org_id = o.org_id AND slug = 'assessment_360' AND version = cur;
    SELECT MAX(version) INTO prev FROM prompt_briefs
      WHERE org_id = o.org_id AND slug = 'assessment_360' AND version < cur;
    IF prev IS NOT NULL THEN
      UPDATE prompt_briefs SET is_active = true
        WHERE org_id = o.org_id AND slug = 'assessment_360' AND version = prev;
    END IF;
  END LOOP;
END
$do$;
