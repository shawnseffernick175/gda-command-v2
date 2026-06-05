-- v3_046_capture_color_team_workflow.sql
-- F-612: Capture RFP upload → AI draft → color team workflow

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS entry_point TEXT NOT NULL DEFAULT 'full_pipeline' CHECK (entry_point IN ('full_pipeline', 'white_only')),
  ADD COLUMN IF NOT EXISTS rfp_filename TEXT,
  ADD COLUMN IF NOT EXISTS rfp_text TEXT,
  ADD COLUMN IF NOT EXISTS rfp_uploaded_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS capture_color_stages (
  id SERIAL PRIMARY KEY,
  capture_id INTEGER NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('blue','pink','red','green','white')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','complete','skipped')),
  reviewer TEXT,
  gate_decision TEXT CHECK (gate_decision IN ('go','no_go','conditional')),
  gate_note TEXT,
  ai_analysis JSONB,
  ai_ran_at TIMESTAMPTZ,
  version_snapshot JSONB,
  snapshot_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(capture_id, stage)
);

CREATE TABLE IF NOT EXISTS capture_stage_annotations (
  id SERIAL PRIMARY KEY,
  stage_id INTEGER NOT NULL REFERENCES capture_color_stages(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT 'Analyst',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
