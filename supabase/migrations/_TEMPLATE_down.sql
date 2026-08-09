-- Migration NNN — <short description>
-- Down-script (exact reversal of NNN_name.sql). Author this BEFORE applying the up.
-- Must be safe to run against a database where the up-script was applied, and must
-- reverse ONLY what the up-script did.

-- Example (delete and replace — reverse the up-script exactly):
-- DROP TABLE IF EXISTS example_table;
-- ALTER TABLE clients DROP COLUMN IF EXISTS example_col;
