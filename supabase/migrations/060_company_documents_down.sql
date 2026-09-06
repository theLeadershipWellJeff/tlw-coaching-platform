-- Migration 060 — Company documents  (DOWN)
-- Reverses 060_company_documents.sql. Drops the table; files in the
-- client-documents bucket under companies/ are left for manual cleanup.
DROP TABLE IF EXISTS company_documents;
