-- v3_064: Federal org hierarchy normalization
-- Adds five normalized columns to opportunities for clean, queryable
-- department/agency/office/contracting_office hierarchy.
-- Existing columns (department, agency, sub_agency, agency_subtype) are
-- preserved as raw provenance. Idempotent: safe to re-run.

-- 1. Add normalized columns (all TEXT NULL, additive)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS department_name TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS agency_name TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS office TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contracting_office TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS org_path TEXT;

-- 2. Indexes for the two most common group-by/filter dimensions
CREATE INDEX IF NOT EXISTS idx_opportunities_department_name ON opportunities (department_name);
CREATE INDEX IF NOT EXISTS idx_opportunities_agency_name ON opportunities (agency_name);
