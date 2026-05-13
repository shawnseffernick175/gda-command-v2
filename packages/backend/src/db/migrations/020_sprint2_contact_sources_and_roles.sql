-- 020_sprint2_contact_sources_and_roles.sql
-- Adds data_source tracking to contacts + user invitation tokens.

-- ============================================================================
-- Contact source tracking
-- ============================================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'manual';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_opportunity_id TEXT;

-- ============================================================================
-- User invitation tokens for email-based role assignment
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  token TEXT NOT NULL UNIQUE,
  invited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ
);
