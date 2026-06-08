-- v3_065: Ingest-time relevance gate (PR-A4)
-- Adds relevance_status and relevance_reason columns to opportunities.
-- Backfills existing rows using NAICS membership + deadline math.
-- Idempotent: safe to re-run.

-- 1. Add columns
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS relevance_status TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS relevance_reason TEXT;

-- 2. Index for filtering relevant-only opps in analysis sweeps
CREATE INDEX IF NOT EXISTS idx_opps_relevance_status
  ON opportunities (relevance_status) WHERE deleted_at IS NULL;

-- 3. Backfill existing rows (idempotent: only stamps NULL rows)
-- NAICS list matches ENVISION_NAICS constant in envision-naics.ts.
UPDATE opportunities
SET
  relevance_status = CASE
    WHEN naics IS NULL OR trim(naics) = '' THEN 'unknown_naics'
    WHEN naics NOT IN (
      '541310','541330','541360','541370','541380','541430','541490',
      '541511','541512','541513','541519','513210','518210',
      '517111','517112','517121','517122','517410','517810','519290',
      '541611','541613','541614','541618','541690','541990',
      '541713','541714','541715',
      '611310','611420','611430','611512','611519','611691','611710',
      '561110','561210','561320','561499','561621',
      '488111','488190','488999',
      '512191','512290','513199','516210',
      '811210'
    ) THEN 'off_profile'
    WHEN response_due_at IS NOT NULL AND response_due_at < NOW() THEN 'auto_pass'
    WHEN response_due_at IS NOT NULL AND response_due_at < NOW() + INTERVAL '30 days' THEN 'auto_pass'
    ELSE 'relevant'
  END,
  relevance_reason = CASE
    WHEN naics IS NULL OR trim(naics) = '' THEN 'unknown_naics: no NAICS code provided'
    WHEN naics NOT IN (
      '541310','541330','541360','541370','541380','541430','541490',
      '541511','541512','541513','541519','513210','518210',
      '517111','517112','517121','517122','517410','517810','519290',
      '541611','541613','541614','541618','541690','541990',
      '541713','541714','541715',
      '611310','611420','611430','611512','611519','611691','611710',
      '561110','561210','561320','561499','561621',
      '488111','488190','488999',
      '512191','512290','513199','516210',
      '811210'
    ) THEN 'off_profile: NAICS ' || naics || ' not in Envision registration'
    WHEN response_due_at IS NOT NULL AND response_due_at < NOW() THEN 'auto_pass: past due'
    WHEN response_due_at IS NOT NULL AND response_due_at < NOW() + INTERVAL '30 days' THEN 'auto_pass: insufficient lead time'
    ELSE 'relevant: NAICS ' || naics || ' in Envision registration'
  END
WHERE relevance_status IS NULL;
