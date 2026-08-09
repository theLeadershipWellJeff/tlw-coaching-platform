-- 034: add coach_note to nudges
-- A private text field the coach attaches before sending (never sent to the client).
ALTER TABLE nudges ADD COLUMN IF NOT EXISTS coach_note text;

ALTER TABLE nudges ENABLE ROW LEVEL SECURITY;
