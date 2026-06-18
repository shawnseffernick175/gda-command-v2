-- v3_101: Pipeline Coverage — Shipley Capture Management Lifecycle model
--
-- Adds to wheelhouse_config (created by v3_100):
--   - AOP revenue targets (FY26–28)
--   - default_stage_pwin JSONB
-- Adds to pipeline_items:
--   - pwin_override (per-pursuit Pwin override, nullable numeric 0–1)
--
-- Idempotent: safe to re-run.

-- ============================================================================
-- 1. Add AOP + Pwin columns to existing wheelhouse_config singleton
-- ============================================================================
ALTER TABLE wheelhouse_config
  ADD COLUMN IF NOT EXISTS aop_revenue_target_fy26 NUMERIC NOT NULL DEFAULT 44800000;
ALTER TABLE wheelhouse_config
  ADD COLUMN IF NOT EXISTS aop_revenue_target_fy27 NUMERIC NOT NULL DEFAULT 50200000;
ALTER TABLE wheelhouse_config
  ADD COLUMN IF NOT EXISTS aop_revenue_target_fy28 NUMERIC NOT NULL DEFAULT 56200000;
ALTER TABLE wheelhouse_config
  ADD COLUMN IF NOT EXISTS default_stage_pwin JSONB NOT NULL DEFAULT '{
    "interest": 0.10,
    "qualify": 0.25,
    "pursue": 0.50,
    "solicitation": 0.75,
    "post_submittal": 1.00
  }'::jsonb;

-- ============================================================================
-- 2. pwin_override on pipeline_items (per-pursuit Pwin override)
-- ============================================================================
ALTER TABLE pipeline_items
  ADD COLUMN IF NOT EXISTS pwin_override NUMERIC
  CHECK (pwin_override IS NULL OR (pwin_override >= 0 AND pwin_override <= 1));
