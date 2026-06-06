-- V3 Migration 050: Awards re-compete radar fields (F-626)
-- Adds incumbent_name, linked_opportunity_id, and recompete_flagged_at
-- for the re-compete radar, incumbent tracker, and pursuit flow.

-- 50.1 Incumbent name (extracted from awardee_name or enriched via ingest)
ALTER TABLE awards ADD COLUMN IF NOT EXISTS incumbent_name TEXT;

-- 50.2 Link to an opportunity created from this award (pursuit tracking)
ALTER TABLE awards ADD COLUMN IF NOT EXISTS linked_opportunity_id INTEGER REFERENCES opportunities(id);

-- 50.3 Timestamp when the re-compete was flagged for pursuit
ALTER TABLE awards ADD COLUMN IF NOT EXISTS recompete_flagged_at TIMESTAMPTZ;

-- 50.4 Indexes for new filter patterns
CREATE INDEX IF NOT EXISTS idx_awards_incumbent ON awards(incumbent_name) WHERE incumbent_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_awards_linked_opp ON awards(linked_opportunity_id) WHERE linked_opportunity_id IS NOT NULL;

-- 50.5 Backfill incumbent_name from awardee_name where not yet set
UPDATE awards
SET incumbent_name = awardee_name
WHERE incumbent_name IS NULL
  AND awardee_name IS NOT NULL;
