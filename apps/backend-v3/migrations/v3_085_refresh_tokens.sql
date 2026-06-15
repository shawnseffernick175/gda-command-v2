-- v3_079: Refresh token persistence for silent re-authentication
-- Stores hashed refresh tokens; plaintext is never persisted.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  replaced_by_id  BIGINT REFERENCES refresh_tokens(id),
  user_agent      TEXT,
  ip              INET
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
