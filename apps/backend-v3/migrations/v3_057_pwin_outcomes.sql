CREATE TABLE IF NOT EXISTS pwin_outcomes (
  id BIGSERIAL PRIMARY KEY,
  opportunity_id BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  predicted_pwin NUMERIC(5,2),
  predicted_grade TEXT,
  actual_outcome TEXT CHECK (actual_outcome IN ('won','lost','no_bid','pending')),
  feedback_source TEXT DEFAULT 'manual',
  recorded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(opportunity_id)
);
CREATE INDEX IF NOT EXISTS idx_pwin_outcomes_opportunity ON pwin_outcomes(opportunity_id);
