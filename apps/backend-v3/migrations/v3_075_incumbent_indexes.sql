-- v3_074: Indexes for incumbent enrichment pipeline (FPDS + USAspending lookup)
-- Speeds up the batch enrichment worker and backfill script queries.

CREATE INDEX IF NOT EXISTS idx_opps_incumbent_lookup
  ON opportunities (solicitation_number)
  WHERE solicitation_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opps_incumbent_naics_agency
  ON opportunities (naics, agency)
  WHERE relevance_status = 'relevant';
