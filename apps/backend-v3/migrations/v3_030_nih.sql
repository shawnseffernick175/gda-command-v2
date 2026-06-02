-- V3 Migration 030: extend sources_kind_check — add nih (F-434)
-- ============================================================================
-- The NIH RePORTER adapter (F-434) inserts into the sources table with
-- kind = 'nih'. The CHECK constraint must include it.
-- ============================================================================

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check
  CHECK (kind = ANY (ARRAY[
    'sam_gov',
    'fpds',
    'usaspending',
    'govwin',
    'govtribe',
    'news',
    'doctrine',
    'partner_site',
    'internal',
    'manual',
    'n8n_workflow',
    'dibbs',
    'neco',
    'sbir',
    'federal_register',
    'color_team',
    'nsf',
    'dod_rss',
    'nih'
  ]));
