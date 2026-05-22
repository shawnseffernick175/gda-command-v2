-- Migration 069: Create daily_trends table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Trend analytics — 537 rows, 4 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS daily_trends (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  metric_name VARCHAR(100) NOT NULL,
  metric_value NUMERIC,
  rolling_avg_7d NUMERIC,
  rolling_avg_30d NUMERIC,
  delta_1d NUMERIC,
  delta_7d NUMERIC,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_trends_date_metric_name_key ON public.daily_trends USING btree (date, metric_name);
CREATE INDEX IF NOT EXISTS idx_daily_trends_date ON public.daily_trends USING btree (date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_trends_metric ON public.daily_trends USING btree (metric_name);
