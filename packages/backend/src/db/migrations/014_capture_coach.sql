-- Migration 014: Capture Coach results table
-- Stores per-opportunity AI strategy analysis from the Capture Coach Agent

CREATE TABLE IF NOT EXISTS capture_coach_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id TEXT NOT NULL,
  analysis JSONB NOT NULL,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by opportunity
CREATE INDEX IF NOT EXISTS idx_capture_coach_opp ON capture_coach_results (opportunity_id, created_at DESC);
