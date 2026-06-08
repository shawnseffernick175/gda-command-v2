-- v3_044_risk_type_columns.sql  (F-610: Risk Card Drill-In)
ALTER TABLE risks
  ADD COLUMN IF NOT EXISTS risk_type TEXT NOT NULL DEFAULT 'negative'
    CHECK (risk_type IN ('negative', 'positive')),
  ADD COLUMN IF NOT EXISTS if_condition TEXT,
  ADD COLUMN IF NOT EXISTS then_impact TEXT,
  ADD COLUMN IF NOT EXISTS mitigation_plan TEXT,
  ADD COLUMN IF NOT EXISTS exploitation_plan TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS next_step TEXT;
