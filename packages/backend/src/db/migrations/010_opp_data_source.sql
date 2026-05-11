-- Add data_source column to opportunities table
-- Tracks where each opportunity was sourced from (SAM.gov, FPDS, GovWin, GovTribe, Manual)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'manual';

-- Update existing opportunities with probable source based on raw_source_url
UPDATE opportunities SET data_source = 'sam.gov' WHERE raw_source_url LIKE '%sam.gov%';
UPDATE opportunities SET data_source = 'fpds' WHERE raw_source_url LIKE '%fpds%' OR raw_source_url LIKE '%usaspending%';
