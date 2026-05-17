-- 025_proposal_sections.sql
-- Adds proposal_sections table for the Proposal Builder feature.
-- Sections represent individual writable blocks within a proposal volume.

CREATE TABLE IF NOT EXISTS proposal_sections (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  volume_type TEXT NOT NULL DEFAULT 'technical'
    CHECK (volume_type IN ('executive_summary', 'technical', 'management', 'past_performance', 'cost_price', 'cover_letter', 'other')),
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  content TEXT DEFAULT '',
  ai_generated BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'outline'
    CHECK (status IN ('outline', 'draft', 'in_review', 'final')),
  word_count INTEGER DEFAULT 0,
  notes TEXT,
  assigned_to TEXT,
  compliance_req_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_sections_proposal ON proposal_sections(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_sections_volume ON proposal_sections(proposal_id, volume_type);

-- Add new columns to proposals table for builder features
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS win_theme_details JSONB DEFAULT '[]';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS storyboard JSONB DEFAULT '[]';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS outline JSONB DEFAULT '[]';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS linked_opportunity_id TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS linked_shred_job_id TEXT;
