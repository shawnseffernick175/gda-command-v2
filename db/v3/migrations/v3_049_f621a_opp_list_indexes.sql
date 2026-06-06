-- F-621a: Add indexes to support new opportunity list filters
-- data_source filter and stage (via pipeline_items) filter

CREATE INDEX IF NOT EXISTS idx_opps_data_source
  ON opportunities(data_source)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_opps_response_due
  ON opportunities(response_due_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_opps_grade
  ON opportunities(grade)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_opps_set_aside
  ON opportunities(set_aside)
  WHERE deleted_at IS NULL;
