-- Migration 005: Email notification preferences + email log
-- Adds per-user notification preferences and an email delivery log.

-- User notification preferences
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_digest_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_digest_frequency TEXT NOT NULL DEFAULT 'daily'
    CHECK (email_digest_frequency IN ('daily', 'weekly')),
  ADD COLUMN IF NOT EXISTS notification_categories JSONB NOT NULL DEFAULT '["critical","approval","deadline","anomaly"]'::jsonb;

-- Email delivery log
CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  template TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed', 'bounced')),
  error_message TEXT,
  notification_id TEXT REFERENCES notifications(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_user ON email_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log(status);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log(created_at DESC);
