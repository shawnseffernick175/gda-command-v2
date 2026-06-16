-- v3_100: Pipeline Coverage — Shipley Capture Management Lifecycle model
--
-- Creates:
--   1. wheelhouse_config singleton — AOP revenue targets + default stage Pwin
--   2. pipeline_items.pwin_override — per-pursuit Pwin override (nullable numeric)
--
-- Idempotent: safe to re-run.

-- ============================================================================
-- 1. wheelhouse_config singleton
-- ============================================================================
CREATE TABLE IF NOT EXISTS wheelhouse_config (
  id                       INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  aop_revenue_target_fy26  NUMERIC NOT NULL DEFAULT 44800000,
  aop_revenue_target_fy27  NUMERIC NOT NULL DEFAULT 50200000,
  aop_revenue_target_fy28  NUMERIC NOT NULL DEFAULT 56200000,
  default_stage_pwin       JSONB   NOT NULL DEFAULT '{
    "interest": 0.10,
    "qualify": 0.25,
    "pursue": 0.50,
    "solicitation": 0.75,
    "post_submittal": 1.00
  }'::jsonb,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the singleton row (no-op if already present)
INSERT INTO wheelhouse_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. pwin_override on pipeline_items (per-pursuit Pwin override)
-- ============================================================================
ALTER TABLE pipeline_items
  ADD COLUMN IF NOT EXISTS pwin_override NUMERIC
  CHECK (pwin_override IS NULL OR (pwin_override >= 0 AND pwin_override <= 1));
