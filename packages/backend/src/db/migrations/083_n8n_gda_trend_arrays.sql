-- Migration 083: Create gda_trend_arrays table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Trend arrays — 15 rows, 1 consumer, actively updated
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_trend_arrays (
  metric_name VARCHAR(100) NOT NULL,
  spark_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  latest_value NUMERIC,
  delta_pct NUMERIC,
  trend_direction VARCHAR(10) DEFAULT 'flat'::character varying,
  updated_at TIMESTAMP DEFAULT now()
);

