-- Migration 126: Disable staging banner for production
-- gda.csr-llc.tech IS production — the misleading banner must not render.
-- The feature_flags mechanism remains for actual ephemeral environments;
-- an admin can toggle staging_banner back on via PUT /api/feature-flags/staging_banner.

UPDATE feature_flags SET enabled = false, updated_at = NOW()
WHERE flag_key = 'staging_banner';
