-- Migration 006: Dashboard layout customization
-- Stores per-user widget layout preferences for the Launchpad dashboard.

CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_user ON dashboard_layouts(user_id);
