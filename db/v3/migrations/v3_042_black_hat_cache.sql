CREATE TABLE IF NOT EXISTS competitor_black_hat_cache (
  id               SERIAL PRIMARY KEY,
  competitor_name  TEXT NOT NULL UNIQUE,
  analysis         JSONB NOT NULL,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);
CREATE INDEX IF NOT EXISTS idx_bh_cache_name ON competitor_black_hat_cache (competitor_name);
CREATE INDEX IF NOT EXISTS idx_bh_cache_expires ON competitor_black_hat_cache (expires_at);
