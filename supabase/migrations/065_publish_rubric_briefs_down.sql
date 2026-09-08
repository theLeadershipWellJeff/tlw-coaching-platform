-- Migration 065 — down-script. Deactivates the versions 065 published and
-- re-activates the previous version of each slug (where one exists). Rows are
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
    FOREACH s IN ARRAY ARRAY['portal_chat', 'assessment_360'] LOOP
      SELECT version INTO cur FROM prompt_briefs
        WHERE org_id = o.org_id AND slug = s
          AND title IN ('Portal coaching chat — coaching-conversation rubric v1.0',
                        'Assessment 360 interpretation brief v2 — Extraordinary Leader')
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
