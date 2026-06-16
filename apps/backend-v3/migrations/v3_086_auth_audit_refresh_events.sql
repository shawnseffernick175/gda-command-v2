-- Expand auth_audit event CHECK constraint to include refresh token events.
ALTER TABLE auth_audit DROP CONSTRAINT IF EXISTS auth_audit_event_check;
ALTER TABLE auth_audit ADD CONSTRAINT auth_audit_event_check
  CHECK (event IN (
    'login_success',
    'login_failure',
    'lockout',
    'token_refresh',
    'logout',
    'refresh',
    'refresh_revoked_reuse'
  ));
