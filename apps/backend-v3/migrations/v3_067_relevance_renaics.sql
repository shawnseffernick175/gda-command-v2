-- v3_067: Re-stamp opportunity relevance against the curated Envision NAICS profile
-- The pursuit NAICS list was narrowed to the targeted profile (see envision-naics.ts).
-- v3_066 backfilled relevance_status using the prior ~50-code SAM registration.
-- This migration re-evaluates ALL existing rows against the new list so stale
-- 'relevant' / 'off_profile' stamps are corrected. Runtime ingest already uses
-- the new constant; this aligns historical rows.
-- Idempotent: safe to re-run (recomputes deterministically from current data).
-- NAICS list matches ENVISION_NAICS constant in envision-naics.ts.

UPDATE opportunities
SET
  relevance_status = CASE
    WHEN naics IS NULL OR trim(naics) = '' THEN 'unknown_naics'
    WHEN naics NOT IN (
      '541330','541512','541611','541715','541714',
      '511210','513210','518210','54151S','54151HACS'
    ) THEN 'off_profile'
    WHEN response_due_at IS NOT NULL AND response_due_at < NOW() THEN 'auto_pass'
    WHEN response_due_at IS NOT NULL AND response_due_at < NOW() + INTERVAL '30 days' THEN 'auto_pass'
    ELSE 'relevant'
  END,
  relevance_reason = CASE
    WHEN naics IS NULL OR trim(naics) = '' THEN 'unknown_naics: no NAICS code provided'
    WHEN naics NOT IN (
      '541330','541512','541611','541715','541714',
      '511210','513210','518210','54151S','54151HACS'
    ) THEN 'off_profile: NAICS ' || naics || ' not in Envision pursuit profile'
    WHEN response_due_at IS NOT NULL AND response_due_at < NOW() THEN 'auto_pass: past due'
    WHEN response_due_at IS NOT NULL AND response_due_at < NOW() + INTERVAL '30 days' THEN 'auto_pass: insufficient lead time'
    ELSE 'relevant: NAICS ' || naics || ' in Envision pursuit profile'
  END
WHERE deleted_at IS NULL;
