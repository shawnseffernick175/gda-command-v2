-- v3_068: Add is_seed flag to financial tables (Vault financials ingest)
-- The Financials tab currently shows only seed/demo rows from v3_041_financials.sql.
-- The owner wants real uploaded data to replace seed data on first real ingest.
-- This migration adds a boolean is_seed flag (default false) to both tables and
-- marks the existing FY26 seed rows is_seed=true so the ingest service can clear
-- them on the first real upload without nuking future real rows.
-- Idempotent: safe to re-run.

ALTER TABLE financial_plan ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE financial_actuals ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT false;

UPDATE financial_plan SET is_seed = true WHERE fiscal_year = 2026;
UPDATE financial_actuals SET is_seed = true WHERE fiscal_year = 2026;
