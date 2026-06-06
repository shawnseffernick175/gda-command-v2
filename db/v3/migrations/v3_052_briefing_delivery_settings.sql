-- v3_052_briefing_delivery_settings.sql
-- Adds JSONB settings column to users for per-user preferences
-- (e.g. briefing_auto_delivery, briefing_delivery_email).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
