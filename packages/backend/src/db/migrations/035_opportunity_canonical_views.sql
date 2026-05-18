-- 035: Canonical opportunity views for count reconciliation (W7)
-- Both Launchpad and Opps Tracker MUST read from these views
-- so counts always reconcile.

-- v_opportunity_all_tracked: every opportunity we've ever ingested, minus hard-deletes.
-- Includes all statuses (discovery, qualified, pipeline, won, lost, no_bid, gov_cancelled).
CREATE OR REPLACE VIEW v_opportunity_all_tracked AS
SELECT id, title, agency, department, status, score, value_estimated,
       probability_of_win, naics, psc, due_date, solicitation_number,
       set_aside, place_of_performance, incumbent, qualified_at,
       qualified_by, description, capture_stage, tags, raw_source_url,
       data_source, created_at, updated_at
FROM opportunities
WHERE deleted_at IS NULL;

-- v_opportunity_active: pipeline-relevant opportunities only.
-- Excludes won, lost, no_bid, gov_cancelled — only discovery/qualified/pipeline.
CREATE OR REPLACE VIEW v_opportunity_active AS
SELECT id, title, agency, department, status, score, value_estimated,
       probability_of_win, naics, psc, due_date, solicitation_number,
       set_aside, place_of_performance, incumbent, qualified_at,
       qualified_by, description, capture_stage, tags, raw_source_url,
       data_source, created_at, updated_at
FROM opportunities
WHERE deleted_at IS NULL
  AND status NOT IN ('won', 'lost', 'no_bid', 'gov_cancelled');
