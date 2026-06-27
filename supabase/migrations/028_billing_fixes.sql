-- 028_billing_fixes.sql
-- Two constraint fixes for the billing schema.

-- 1. Fix installment_count check to allow 1–12 (was restricted to 1 or 2).
ALTER TABLE engagements
  DROP CONSTRAINT IF EXISTS engagements_installment_count_check;

ALTER TABLE engagements
  ADD CONSTRAINT engagements_installment_count_check
    CHECK (installment_count IS NULL OR installment_count BETWEEN 1 AND 12);

-- 2. Add 'manual' as a valid invoice_lines.source (for manually created invoices).
ALTER TABLE invoice_lines
  DROP CONSTRAINT IF EXISTS invoice_lines_source_check;

ALTER TABLE invoice_lines
  ADD CONSTRAINT invoice_lines_source_check
    CHECK (source IN ('session','subscription','engagement_installment','manual'));
