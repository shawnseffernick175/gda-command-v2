-- v3_051_contacts_relationship.sql
-- F-627: Add relationship temperature, last-contacted tracking, contact notes,
-- and linked opportunity/capture arrays.

ALTER TABLE govtribe_contacts
  ADD COLUMN IF NOT EXISTS relationship_temp TEXT CHECK (relationship_temp IN ('hot','warm','cold','unknown')) DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_notes TEXT,
  ADD COLUMN IF NOT EXISTS linked_opportunity_ids INTEGER[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_capture_ids INTEGER[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_contacts_temp ON govtribe_contacts(relationship_temp);
CREATE INDEX IF NOT EXISTS idx_contacts_last_touch ON govtribe_contacts(last_contacted_at);
