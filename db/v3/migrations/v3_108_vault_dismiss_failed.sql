-- F-606: Vault — resolve/clear failed uploads (retry or dismiss)
-- Add 'dismissed' extraction_status so the owner can clear stuck items.

-- Drop the old CHECK and add the widened one.
ALTER TABLE vault_documents
  DROP CONSTRAINT IF EXISTS vault_documents_extraction_status_check;

ALTER TABLE vault_documents
  ADD CONSTRAINT vault_documents_extraction_status_check
    CHECK (extraction_status IN ('pending', 'success', 'failed', 'unsupported', 'dismissed'));
