-- Migration 065 — down-script. Deactivates the portal_chat version 065 published
-- and re-activates the previous version (where one exists). assessment_360 is
-- 066's — see 066's down-script. Rows are
-- kept: brief versions are an audit trail and portal_messages.metadata cites
-- them. Safe to run more than once.
DO $do$
DECLARE
  o RECORD;
  s text;
  cur int;
  prev int;
BEGIN
  FOR o IN SELECT DISTINCT org_id FROM prompt_briefs LOOP
    FOREACH s IN ARRAY ARRAY['portal_chat'] LOOP
      SELECT version INTO cur FROM prompt_briefs
        WHERE org_id = o.org_id AND slug = s
          AND title = 'Portal coaching chat — coaching-conversation rubric v1.0'
        ORDER BY version DESC LIMIT 1;
      IF cur IS NULL THEN CONTINUE; END IF;
      UPDATE prompt_briefs SET is_active = false
        WHERE org_id = o.org_id AND slug = s AND version = cur;
      SELECT MAX(version) INTO prev FROM prompt_briefs
        WHERE org_id = o.org_id AND slug = s AND version < cur;
      IF prev IS NOT NULL THEN
        UPDATE prompt_briefs SET is_active = true
          WHERE org_id = o.org_id AND slug = s AND version = prev;
      END IF;
    END LOOP;
  END LOOP;
END
$do$;
