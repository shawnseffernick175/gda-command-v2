-- Backfill source_uri for existing SAM opportunities that have a sam_notice_id
UPDATE opportunities
SET source_uri = 'https://sam.gov/opp/' || sam_notice_id || '/view'
WHERE data_source = 'sam.gov'
  AND sam_notice_id IS NOT NULL
  AND source_uri IS NULL;
