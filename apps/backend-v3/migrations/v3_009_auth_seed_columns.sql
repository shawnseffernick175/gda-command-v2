-- v3_009_auth_seed_columns.sql
-- Adds failed-login lockout columns + auth_audit trail table.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS auth_audit (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  event       TEXT NOT NULL CHECK (event IN ('login_success','login_failure','lockout','token_refresh','logout')),
  ip          INET,
  user_agent  TEXT,
  request_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_audit_user_idx ON auth_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_audit_email_idx ON auth_audit(email, created_at DESC);
