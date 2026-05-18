-- 032_proposal_builder_enhancements.sql
-- Adds version history, compliance mapping, and document import support to Proposal Builder.

-- Section version history — tracks every content change
CREATE TABLE IF NOT EXISTS proposal_section_versions (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES proposal_sections(id) ON DELETE CASCADE,
  proposal_id TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL DEFAULT '',
  word_count INTEGER DEFAULT 0,
  change_summary TEXT,
  changed_by TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_section_versions_section ON proposal_section_versions(section_id);
CREATE INDEX IF NOT EXISTS idx_section_versions_proposal ON proposal_section_versions(proposal_id);

-- Compliance mapping — links RFP requirements to proposal sections (side-by-side view)
CREATE TABLE IF NOT EXISTS proposal_compliance_map (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  requirement_id TEXT,
  requirement_text TEXT NOT NULL,
  requirement_type TEXT DEFAULT 'SHALL',
  section_id TEXT REFERENCES proposal_sections(id) ON DELETE SET NULL,
  section_title TEXT,
  response_status TEXT DEFAULT 'not_addressed'
    CHECK (response_status IN ('not_addressed', 'partial', 'fully_addressed', 'non_compliant')),
  response_summary TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_map_proposal ON proposal_compliance_map(proposal_id);
CREATE INDEX IF NOT EXISTS idx_compliance_map_section ON proposal_compliance_map(section_id);
