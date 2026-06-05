-- v3_046_contacts_expand.sql
-- F-615: Expand govtribe_contacts to cover all contact categories,
-- manual entry, AI enrichment, relationship tracking, and source labelling.

ALTER TABLE govtribe_contacts
  ADD COLUMN IF NOT EXISTS contact_category TEXT NOT NULL DEFAULT 'government'
    CHECK (contact_category IN ('government', 'teaming_partner', 'competitor', 'industry', 'internal', 'other')),
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS relationship_score INTEGER DEFAULT NULL
    CHECK (relationship_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS ai_profile JSONB,
  ADD COLUMN IF NOT EXISTS ai_ran_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS added_by TEXT DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS source_label TEXT;

-- Make govtribe_id nullable for manual contacts (no GovTribe origin)
ALTER TABLE govtribe_contacts ALTER COLUMN govtribe_id DROP NOT NULL;

-- Index for category filtering
CREATE INDEX IF NOT EXISTS govtribe_contacts_category_idx ON govtribe_contacts (contact_category);
